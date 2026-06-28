import { openDB } from 'idb'
import { supabase } from './supabase'

const DB_NAME = 'refmemo'
const DB_VERSION = 3      // v3 adds imageCache + pendingOps stores
const ROOT = '__root__'

export function toParentId(id) { return id ?? ROOT }

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // ── v1 / v2 stores (idempotent) ──
      if (!db.objectStoreNames.contains('boards')) {
        const bs = db.createObjectStore('boards', { keyPath: 'id' })
        bs.createIndex('parentId', 'parentId')
      }
      if (!db.objectStoreNames.contains('elements')) {
        const es = db.createObjectStore('elements', { keyPath: 'id' })
        es.createIndex('boardId', 'boardId')
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' })
      }

      // ── v3 stores ──
      // imageCache: stores optimised WebP blobs as dataUrls, keyed by SHA-256 hash.
      // Lets images display immediately when offline; src is updated to remote URL later.
      if (!db.objectStoreNames.contains('imageCache')) {
        db.createObjectStore('imageCache', { keyPath: 'hash' })
      }
      // pendingOps: operations that must be replayed to Supabase when back online.
      // Prevents zombie boards and ensures deletes are honoured after reconnect.
      if (!db.objectStoreNames.contains('pendingOps')) {
        db.createObjectStore('pendingOps', { keyPath: 'id' })
      }
    }
  })
}

// ── User identity ─────────────────────────────────────────────────────────────

let _cachedUserId = null
let _userIdResolvers = []

function _notifyUserId(id) {
  _cachedUserId = id
  const resolvers = _userIdResolvers.splice(0)
  for (const r of resolvers) r(id)
}

supabase.auth.onAuthStateChange((_event, session) => {
  _notifyUserId(session?.user?.id ?? null)
})
supabase.auth.getSession().then(({ data }) => {
  if (_cachedUserId === null) _notifyUserId(data?.session?.user?.id ?? null)
})

async function currentUserId() {
  if (_cachedUserId !== null) return _cachedUserId
  const { data } = await supabase.auth.getSession()
  return (_cachedUserId = data?.session?.user?.id ?? null)
}

// ── Image cache ───────────────────────────────────────────────────────────────

/** Store an optimised WebP dataUrl by hash so images work offline. */
export async function setCachedImage(hash, dataUrl) {
  const db = await getDB()
  await db.put('imageCache', { hash, dataUrl })
}

/** Retrieve a locally cached image dataUrl. Returns null if not cached. */
export async function getCachedImage(hash) {
  const db = await getDB()
  const row = await db.get('imageCache', hash)
  return row?.dataUrl ?? null
}

// ── Pending operations ────────────────────────────────────────────────────────
// We record destructive operations that could not be sent to Supabase while
// offline.  On reconnect (or startup) we replay them so deletions and image
// uploads are never silently lost.

function _opId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

async function _queueOp(op) {
  const db = await getDB()
  await db.put('pendingOps', { id: _opId(), ...op, queuedAt: Date.now() })
}

/**
 * Replay all queued operations against Supabase.
 * Call on startup and whenever the browser goes online.
 */
export async function flushPendingOps() {
  if (!navigator.onLine) return
  const userId = await currentUserId()
  if (!userId) return
  const db = await getDB()
  const ops = await db.getAll('pendingOps')
  if (ops.length === 0) return
  console.log('[db] flushing', ops.length, 'pending op(s)')

  for (const op of ops) {
    try {
      if (op.entity === 'board' && op.op === 'delete') {
        // Delete child elements first, then the board
        await supabase.from('elements').delete().eq('board_id', op.entityId).eq('user_id', userId)
        await supabase.from('boards').delete().eq('id', op.entityId).eq('user_id', userId)
      } else if (op.entity === 'element' && op.op === 'delete') {
        await supabase.from('elements').delete().eq('id', op.entityId).eq('user_id', userId)
      } else if (op.entity === 'image' && op.op === 'upload') {
        // Handled separately by ImageImportService.flushPendingImageUploads()
        continue
      }
      await db.delete('pendingOps', op.id)
    } catch (e) {
      console.warn('[db] flushPendingOps: op failed, will retry:', op.id, e.message)
      // Leave in queue — it will be retried on the next online event
    }
  }
}

/** Return the set of entity IDs that have pending delete operations. */
async function _getPendingDeleteIds() {
  const db = await getDB()
  const ops = await db.getAll('pendingOps')
  return new Set(
    ops
      .filter(op => op.op === 'delete')
      .map(op => op.entityId)
  )
}

// ── Boards ────────────────────────────────────────────────────────────────────

export async function getBoards(parentId = null) {
  const db = await getDB()
  const pid = toParentId(parentId)

  // LOCAL-FIRST: return IndexedDB data immediately
  const pendingDeletes = await _getPendingDeleteIds()
  let local = await db.getAllFromIndex('boards', 'parentId', pid)
  // Hide anything queued for deletion (tombstone filter)
  local = local.filter(b => !pendingDeletes.has(b.id))

  // Background sync with Supabase (non-blocking)
  const userId = await currentUserId()
  if (userId && navigator.onLine) {
    _syncBoardsDown(pid, userId, db, pendingDeletes).catch(
      e => console.warn('[db] background board sync error:', e.message)
    )
  }

  return local
}

async function _syncBoardsDown(pid, userId, db, pendingDeletes) {
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('user_id', userId)
    .eq('parent_id', pid)

  if (error) {
    console.warn('[db] getBoards Supabase error:', error.message)
    return
  }

  if (!data || data.length === 0) {
    // Supabase empty — push any unsynced local boards up
    const local = await db.getAllFromIndex('boards', 'parentId', pid)
    for (const b of local) {
      if (!pendingDeletes.has(b.id)) {
        supabase.from('boards').upsert(toSupabaseBoard(b, userId)).catch(() => {})
      }
    }
    return
  }

  const tx = db.transaction('boards', 'readwrite')
  for (const row of data) {
    const board = fromSupabaseBoard(row)
    // Never restore a board the user has queued for deletion
    if (pendingDeletes.has(board.id)) continue
    await tx.objectStore('boards').put({ ...board, parentId: toParentId(board.parentId) })
  }
  await tx.done
}

export async function getBoard(id) {
  const db = await getDB()
  // LOCAL-FIRST
  const local = await db.get('boards', id)
  if (local) {
    // Sync in background
    const userId = await currentUserId()
    if (userId && navigator.onLine) {
      supabase.from('boards').select('*').eq('id', id).eq('user_id', userId).single()
        .then(({ data, error }) => {
          if (!error && data) db.put('boards', { ...fromSupabaseBoard(data), parentId: toParentId(data.parent_id) })
        })
        .catch(() => {})
    }
    return local
  }
  // Not in local cache — try Supabase
  const userId = await currentUserId()
  if (!userId || !navigator.onLine) return null
  const { data, error } = await supabase.from('boards').select('*').eq('id', id).eq('user_id', userId).single()
  if (error || !data) return null
  const board = fromSupabaseBoard(data)
  await db.put('boards', { ...board, parentId: toParentId(board.parentId) })
  return board
}

export async function saveBoard(board) {
  const db = await getDB()
  const normalized = { ...board, parentId: toParentId(board.parentId) }
  await db.put('boards', normalized)
  const userId = await currentUserId()
  if (userId) {
    supabase.from('boards').upsert(toSupabaseBoard(normalized, userId)).catch(
      e => console.warn('[db] saveBoard upsert failed:', e.message)
    )
  }
}

export async function deleteBoard(id) {
  const db = await getDB()
  // Recursively delete child boards
  const children = await db.getAllFromIndex('boards', 'parentId', id)
  for (const child of children) await deleteBoard(child.id)
  // Delete local elements
  const elements = await db.getAllFromIndex('elements', 'boardId', id)
  const tx = db.transaction(['boards', 'elements'], 'readwrite')
  for (const el of elements) await tx.objectStore('elements').delete(el.id)
  await tx.objectStore('boards').delete(id)
  await tx.done

  const userId = await currentUserId()
  if (!userId) return
  if (navigator.onLine) {
    // Send immediately — fire & verify (not fire & forget so deletions succeed)
    await supabase.from('elements').delete().eq('board_id', id).eq('user_id', userId)
    await supabase.from('boards').delete().eq('id', id).eq('user_id', userId)
  } else {
    // Tombstone: queue the delete so it's replayed when back online
    await _queueOp({ entity: 'board', op: 'delete', entityId: id })
  }
}

// ── Elements ──────────────────────────────────────────────────────────────────

export async function getElements(boardId) {
  const db = await getDB()
  const pendingDeletes = await _getPendingDeleteIds()

  // LOCAL-FIRST
  let local = await db.getAllFromIndex('elements', 'boardId', boardId)
  local = local.filter(el => !pendingDeletes.has(el.id))

  const userId = await currentUserId()
  if (userId && navigator.onLine) {
    _syncElementsDown(boardId, userId, db, pendingDeletes).catch(
      e => console.warn('[db] background element sync error:', e.message)
    )
  }

  return local
}

async function _syncElementsDown(boardId, userId, db, pendingDeletes) {
  const { data, error } = await supabase
    .from('elements')
    .select('*')
    .eq('board_id', boardId)
    .eq('user_id', userId)

  if (error) {
    console.warn('[db] getElements Supabase error:', error.message)
    return
  }

  if (!data || data.length === 0) {
    const local = await db.getAllFromIndex('elements', 'boardId', boardId)
    for (const el of local) {
      if (!pendingDeletes.has(el.id)) {
        supabase.from('elements').upsert(toSupabaseElement(el, userId)).catch(() => {})
      }
    }
    return
  }

  const tx = db.transaction('elements', 'readwrite')
  for (const row of data) {
    const el = fromSupabaseElement(row)
    if (pendingDeletes.has(el.id)) continue
    await tx.objectStore('elements').put(el)
  }
  await tx.done
}

export async function saveElement(el, { skipRemote = false } = {}) {
  const db = await getDB()
  await db.put('elements', el)
  if (!skipRemote) {
    const userId = await currentUserId()
    if (userId) {
      supabase.from('elements').upsert(toSupabaseElement(el, userId)).catch(
        e => console.warn('[db] saveElement upsert failed:', e.message)
      )
    }
  }
}

export async function deleteElement(id) {
  const db = await getDB()
  await db.delete('elements', id)
  const userId = await currentUserId()
  if (!userId) return
  if (navigator.onLine) {
    supabase.from('elements').delete().eq('id', id).eq('user_id', userId).catch(
      e => console.warn('[db] deleteElement failed:', e.message)
    )
  } else {
    await _queueOp({ entity: 'element', op: 'delete', entityId: id })
  }
}

// ── Shape converters ──────────────────────────────────────────────────────────

function toSupabaseBoard(b, userId) {
  return {
    id: b.id,
    user_id: userId,
    parent_id: toParentId(b.parentId),
    name: b.name,
    color: b.color ?? null,
    x: b.x ?? 0,
    y: b.y ?? 0,
    created_at: b.createdAt ?? Date.now(),
  }
}

function fromSupabaseBoard(row) {
  return {
    id: row.id,
    parentId: row.parent_id === ROOT ? null : row.parent_id,
    name: row.name,
    color: row.color ?? null,
    x: row.x ?? 0,
    y: row.y ?? 0,
    createdAt: row.created_at,
  }
}

function toSupabaseElement(el, userId) {
  return {
    id: el.id,
    user_id: userId,
    board_id: el.boardId,
    type: el.type,
    x: el.x ?? 0,
    y: el.y ?? 0,
    w: el.w ?? null,
    h: el.h ?? null,
    content: el.content ?? {},
    created_at: el.createdAt ?? Date.now(),
  }
}

function fromSupabaseElement(row) {
  return {
    id: row.id,
    boardId: row.board_id,
    type: row.type,
    x: row.x ?? 0,
    y: row.y ?? 0,
    w: row.w ?? null,
    h: row.h ?? null,
    content: row.content ?? {},
    createdAt: row.created_at,
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function getConfig(key) {
  const db = await getDB()
  const row = await db.get('config', key)
  return row?.value
}

export async function setConfig(key, value) {
  const db = await getDB()
  await db.put('config', { key, value })
}

// ── Backup / Restore ──────────────────────────────────────────────────────────

export async function exportAllData() {
  const db = await getDB()
  const boards = await db.getAll('boards')
  const elements = await db.getAll('elements')
  return { version: 1, exportedAt: Date.now(), boards, elements }
}

export async function importAllData(data) {
  if (!data?.boards || !data?.elements) throw new Error('Invalid backup file')
  const db = await getDB()
  const tx = db.transaction(['boards', 'elements'], 'readwrite')
  for (const b of data.boards) await tx.objectStore('boards').put(b)
  for (const e of data.elements) await tx.objectStore('elements').put(e)
  await tx.done
  const userId = await currentUserId()
  if (userId) {
    for (const b of data.boards) await supabase.from('boards').upsert(toSupabaseBoard(b, userId))
    for (const e of data.elements) await supabase.from('elements').upsert(toSupabaseElement(e, userId))
  }
}
