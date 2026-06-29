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
      if (!db.objectStoreNames.contains('imageCache')) {
        db.createObjectStore('imageCache', { keyPath: 'hash' })
      }
      if (!db.objectStoreNames.contains('pendingOps')) {
        db.createObjectStore('pendingOps', { keyPath: 'id' })
      }
    }
  })
}

// ── Pending-write guard ───────────────────────────────────────────────────────
// These in-memory sets track element/board IDs whose Supabase upsert is still
// in-flight. Background sync must skip these IDs so it never overwrites a local
// change (create, update, move, resize, rename) with older server data.
// The ID is removed once Supabase confirms the write (or on failure — the next
// sync will then get the correct server state).
const _pendingElementWrites = new Set()
const _pendingBoardWrites   = new Set()

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

// ── User isolation ────────────────────────────────────────────────────────────
// IndexedDB is shared within a browser origin. We store the userId that last
// populated the local cache. If a different user is detected on load, we wipe
// boards and elements so no stale data from the previous session is displayed.
// imageCache is content-addressed (SHA-256 hash) so it is safe to share.

async function _ensureUserIsolation(userId, db) {
  const row = await db.get('config', 'localUserId')
  const storedId = row?.value ?? null
  if (storedId && storedId !== userId) {
    console.log('[db] User changed (%s → %s) — clearing local cache', storedId, userId)
    const tx = db.transaction(['boards', 'elements', 'pendingOps'], 'readwrite')
    await tx.objectStore('boards').clear()
    await tx.objectStore('elements').clear()
    await tx.objectStore('pendingOps').clear()
    await tx.done
  }
  if (userId && storedId !== userId) {
    await db.put('config', { key: 'localUserId', value: userId })
  }
}

// ── Image cache ───────────────────────────────────────────────────────────────

export async function setCachedImage(hash, blob) {
  const db = await getDB()
  await db.put('imageCache', { hash, blob, cachedAt: Date.now() })
}

export async function getCachedBlob(hash) {
  const db = await getDB()
  const row = await db.get('imageCache', hash)
  if (!row) return null
  if (row.blob instanceof Blob) return row.blob
  // Legacy format (dataUrl) — migrate once
  if (row.dataUrl && typeof row.dataUrl === 'string') {
    const blob = _dataUrlToBlob(row.dataUrl)
    await db.put('imageCache', { hash, blob, cachedAt: row.cachedAt || Date.now() })
    return blob
  }
  return null
}

function _dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const bytes = atob(b64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// ── Debug stats ───────────────────────────────────────────────────────────────

export async function getDebugStats() {
  const db = await getDB()
  const [boards, elements, imageCache, pendingOps] = await Promise.all([
    db.getAll('boards'),
    db.getAll('elements'),
    db.getAll('imageCache'),
    db.getAll('pendingOps'),
  ])
  const cacheBytes = imageCache.reduce((sum, row) => sum + (row.blob?.size || 0), 0)
  const pendingUploads = elements.filter(
    el => el.type === 'image' && el.content?.syncStatus === 'pending'
  ).length
  return {
    boards: boards.length,
    elements: elements.length,
    cachedImages: imageCache.length,
    cacheBytes,
    pendingOps: pendingOps.length,
    pendingUploads,
  }
}

// ── Pending operations ────────────────────────────────────────────────────────

function _opId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

async function _queueOp(op) {
  const db = await getDB()
  await db.put('pendingOps', { id: _opId(), ...op, queuedAt: Date.now() })
}

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
        await supabase.from('elements').delete().eq('board_id', op.entityId).eq('user_id', userId)
        await supabase.from('boards').delete().eq('id', op.entityId).eq('user_id', userId)
      } else if (op.entity === 'element' && op.op === 'delete') {
        await supabase.from('elements').delete().eq('id', op.entityId).eq('user_id', userId)
      } else if (op.entity === 'element' && op.op === 'upsert') {
        // Read the current local value (the one we saved while offline) and push it
        const el = await db.get('elements', op.entityId)
        if (el) await supabase.from('elements').upsert(toSupabaseElement(el, userId))
      } else if (op.entity === 'board' && op.op === 'upsert') {
        const b = await db.get('boards', op.entityId)
        if (b) await supabase.from('boards').upsert(toSupabaseBoard(b, userId))
      } else if (op.entity === 'image' && op.op === 'upload') {
        continue // handled by ImageImportService.flushPendingImageUploads()
      }
      await db.delete('pendingOps', op.id)
    } catch (e) {
      console.warn('[db] flushPendingOps: op failed, will retry:', op.id, e.message)
    }
  }
}

async function _getPendingDeleteIds() {
  const db = await getDB()
  const ops = await db.getAll('pendingOps')
  return new Set(ops.filter(op => op.op === 'delete').map(op => op.entityId))
}

async function _getPendingUpsertIds() {
  const db = await getDB()
  const ops = await db.getAll('pendingOps')
  return new Set(ops.filter(op => op.op === 'upsert').map(op => op.entityId))
}

// Queue an offline upsert. Uses a deterministic id ('upsert-el-{id}' / 'upsert-b-{id}')
// so repeated saves to the same entity overwrite the previous queued op rather than
// accumulating, e.g. during a drag-move sequence while offline.
async function _queueUpsert(entity, entityId) {
  const db = await getDB()
  await db.put('pendingOps', {
    id: `upsert-${entity.slice(0, 1)}-${entityId}`,
    entity, entityId, op: 'upsert', queuedAt: Date.now()
  })
}

// ── Boards ────────────────────────────────────────────────────────────────────

/**
 * Returns boards from IndexedDB immediately (local-first).
 * Starts a background Supabase sync; calls onSync(freshBoards) when done
 * so callers can update React state without a page refresh.
 */
export async function getBoards(parentId = null, { onSync } = {}) {
  const db = await getDB()
  const pid = toParentId(parentId)
  const pendingDeletes = await _getPendingDeleteIds()

  const userId = await currentUserId()

  // Clear stale cache if a different user is now signed in
  if (userId) await _ensureUserIsolation(userId, db)

  let local = await db.getAllFromIndex('boards', 'parentId', pid)
  local = local.filter(b => !pendingDeletes.has(b.id))

  if (userId && navigator.onLine) {
    _syncBoardsDown(pid, userId, db, pendingDeletes)
      .then(async () => {
        if (!onSync) return
        // Re-read pendingDeletes fresh so any boards deleted during the sync round-trip
        // are excluded — the snapshot taken at getBoards() call time may be stale.
        const freshDeletes = await _getPendingDeleteIds()
        let fresh = await db.getAllFromIndex('boards', 'parentId', pid)
        fresh = fresh.filter(b => !freshDeletes.has(b.id))
        onSync(fresh)
      })
      .catch(e => console.warn('[db] background board sync error:', e.message))
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

  const supabaseIds = new Set((data || []).map(r => r.id))

  // Push any locally-created boards that Supabase doesn't have yet
  // (created offline or before first sync on this device)
  const localBoards = await db.getAllFromIndex('boards', 'parentId', pid)
  for (const b of localBoards) {
    if (!supabaseIds.has(b.id) && !pendingDeletes.has(b.id)) {
      supabase.from('boards').upsert(toSupabaseBoard(b, userId)).catch(() => {})
    }
  }

  if (!data || data.length === 0) return

  // Write all Supabase boards into IndexedDB, skipping any whose local write
  // is still in-flight (delete tombstone, pending upsert op, or in-memory guard).
  const pendingUpserts = await _getPendingUpsertIds()
  const tx = db.transaction('boards', 'readwrite')
  for (const row of data) {
    const board = fromSupabaseBoard(row)
    if (pendingDeletes.has(board.id)) continue
    if (pendingUpserts.has(board.id)) continue
    if (_pendingBoardWrites.has(board.id)) continue
    await tx.objectStore('boards').put({ ...board, parentId: toParentId(board.parentId) })
  }
  await tx.done
}

export async function getBoard(id) {
  const db = await getDB()
  const local = await db.get('boards', id)
  if (local) {
    const userId = await currentUserId()
    if (userId && navigator.onLine) {
      supabase.from('boards').select('*').eq('id', id).eq('user_id', userId).single()
        .then(({ data, error }) => {
          if (!error && data && !_pendingBoardWrites.has(id)) {
            db.put('boards', { ...fromSupabaseBoard(data), parentId: toParentId(data.parent_id) })
          }
        })
        .catch(() => {})
    }
    return local
  }
  // Not in local cache — fetch from Supabase
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
  if (!userId) return
  if (!navigator.onLine) {
    // Queue a deduplicating upsert op so reconnect pushes the latest local state
    await _queueUpsert('board', board.id)
    return
  }
  _pendingBoardWrites.add(board.id)
  supabase.from('boards').upsert(toSupabaseBoard(normalized, userId))
    .then(() => _pendingBoardWrites.delete(board.id))
    .catch(async e => {
      console.warn('[db] saveBoard upsert failed:', e.message)
      _pendingBoardWrites.delete(board.id)
      // Write failed — queue for retry on reconnect
      await _queueUpsert('board', board.id)
    })
}

export async function deleteBoard(id) {
  const db = await getDB()
  const children = await db.getAllFromIndex('boards', 'parentId', id)
  for (const child of children) await deleteBoard(child.id)
  const elements = await db.getAllFromIndex('elements', 'boardId', id)
  const tx = db.transaction(['boards', 'elements'], 'readwrite')
  for (const el of elements) await tx.objectStore('elements').delete(el.id)
  await tx.objectStore('boards').delete(id)
  await tx.done

  const userId = await currentUserId()
  if (!userId) return
  if (navigator.onLine) {
    await supabase.from('elements').delete().eq('board_id', id).eq('user_id', userId)
    await supabase.from('boards').delete().eq('id', id).eq('user_id', userId)
  } else {
    await _queueOp({ entity: 'board', op: 'delete', entityId: id })
  }
}

// ── Elements ──────────────────────────────────────────────────────────────────

/**
 * Returns elements from IndexedDB immediately (local-first).
 * Starts a background Supabase sync; calls onSync(freshElements) when done
 * so callers can update React state without a page refresh.
 */
export async function getElements(boardId, { onSync } = {}) {
  const db = await getDB()
  const pendingDeletes = await _getPendingDeleteIds()

  let local = await db.getAllFromIndex('elements', 'boardId', boardId)
  local = local.filter(el => !pendingDeletes.has(el.id))

  const userId = await currentUserId()
  if (userId && navigator.onLine) {
    _syncElementsDown(boardId, userId, db, pendingDeletes)
      .then(async () => {
        if (!onSync) return
        const freshDeletes = await _getPendingDeleteIds()
        let fresh = await db.getAllFromIndex('elements', 'boardId', boardId)
        fresh = fresh.filter(el => !freshDeletes.has(el.id))
        onSync(fresh)
      })
      .catch(e => console.warn('[db] background element sync error:', e.message))
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

  const supabaseIds = new Set((data || []).map(r => r.id))

  // Push any locally-created elements that Supabase doesn't have yet
  const localEls = await db.getAllFromIndex('elements', 'boardId', boardId)
  for (const el of localEls) {
    if (!supabaseIds.has(el.id) && !pendingDeletes.has(el.id)) {
      supabase.from('elements').upsert(toSupabaseElement(el, userId)).catch(() => {})
    }
  }

  if (!data || data.length === 0) return

  // Write all Supabase elements into IndexedDB, skipping any whose local write
  // is still in-flight (delete tombstone, persistent upsert op, or in-memory guard).
  const pendingUpserts = await _getPendingUpsertIds()
  const tx = db.transaction('elements', 'readwrite')
  for (const row of data) {
    const el = fromSupabaseElement(row)
    if (pendingDeletes.has(el.id)) continue
    if (pendingUpserts.has(el.id)) continue
    if (_pendingElementWrites.has(el.id)) continue
    await tx.objectStore('elements').put(el)
  }
  await tx.done
}

export async function saveElement(el, { skipRemote = false } = {}) {
  const db = await getDB()
  await db.put('elements', el)
  if (skipRemote) return
  const userId = await currentUserId()
  if (!userId) return
  if (!navigator.onLine) {
    await _queueUpsert('element', el.id)
    return
  }
  _pendingElementWrites.add(el.id)
  supabase.from('elements').upsert(toSupabaseElement(el, userId))
    .then(() => _pendingElementWrites.delete(el.id))
    .catch(async e => {
      console.warn('[db] saveElement upsert failed:', e.message)
      _pendingElementWrites.delete(el.id)
      await _queueUpsert('element', el.id)
    })
}

export async function deleteElement(id) {
  const db = await getDB()
  await db.delete('elements', id)
  // Queue tombstone BEFORE Supabase delete so the background sync (which reads
  // pendingOps to decide what to skip) never writes the element back.
  await _queueOp({ entity: 'element', op: 'delete', entityId: id })
  const userId = await currentUserId()
  if (!userId || !navigator.onLine) return
  try {
    await supabase.from('elements').delete().eq('id', id).eq('user_id', userId)
    // Remove tombstone only after Supabase confirms the delete
    const ops = await db.getAll('pendingOps')
    const op = ops.find(o => o.entity === 'element' && o.entityId === id)
    if (op) await db.delete('pendingOps', op.id)
  } catch (e) {
    console.warn('[db] deleteElement Supabase failed, keeping tombstone:', e.message)
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
