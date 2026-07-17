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

// ── Per-user storage usage (tester-phase soft cap) ───────────────────────────
export const STORAGE_LIMIT_BYTES = 150 * 1024 * 1024  // 150 MB per user

// Sum of UNIQUE image bytes the user holds (deduplicated by hash), counting both
// board images and images nested inside collections. Fully client-side (reads
// IndexedDB only) so it costs no Supabase egress.
export async function getStorageUsage() {
  const db = await getDB()
  const elements = await db.getAll('elements')
  const seen = new Map()
  const add = (c) => {
    if (c && c.hash && typeof c.sizeBytes === 'number' && !seen.has(c.hash)) {
      seen.set(c.hash, c.sizeBytes)
    }
  }
  for (const el of elements) {
    if (el.deleted_at) continue
    if (el.type === 'image') add(el.content)
    const items = el.content && el.content.items
    if (Array.isArray(items)) for (const it of items) if (it && it.type === 'image') add(it.content)
  }
  let bytes = 0
  for (const v of seen.values()) bytes += v
  return { bytes, limit: STORAGE_LIMIT_BYTES, ratio: STORAGE_LIMIT_BYTES ? bytes / STORAGE_LIMIT_BYTES : 0 }
}

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
        const ts = Date.now()
        await supabase.from('elements').update({ deleted_at: ts }).eq('board_id', op.entityId).eq('user_id', userId)
        await supabase.from('boards').update({ deleted_at: ts }).eq('id', op.entityId).eq('user_id', userId)
      } else if (op.entity === 'element' && op.op === 'delete') {
        await supabase.from('elements').update({ deleted_at: Date.now() }).eq('id', op.entityId).eq('user_id', userId)
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

// ── Tombstone garbage collection ───────────────────────────────────────────────
// Soft-deleted rows are kept only as long as needed for every device to sync the
// deletion. After PURGE_AFTER_MS they are hard-deleted so they stop occupying
// space, and any image no live element still references is removed from Storage.
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export async function purgeOldDeletions() {
  if (!navigator.onLine) return
  const userId = await currentUserId()
  if (!userId) return
  const cutoff = Date.now() - PURGE_AFTER_MS

  try {
    // 1) Expired soft-deleted elements — collect image hashes before removing rows.
    const { data: deadEls, error: elErr } = await supabase
      .from('elements')
      .select('id, type, content')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff)
    if (elErr) throw elErr

    const hashes = new Set(
      (deadEls || [])
        .filter(r => r.type === 'image' && r.content?.hash)
        .map(r => r.content.hash)
    )

    // 2) Hard-delete the expired element rows.
    if (deadEls && deadEls.length > 0) {
      await supabase.from('elements').delete()
        .eq('user_id', userId).not('deleted_at', 'is', null).lt('deleted_at', cutoff)
    }

    // 3) Free each image in Storage only if NO live element still references its hash.
    for (const hash of hashes) {
      const { data: live } = await supabase
        .from('elements')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'image')
        .is('deleted_at', null)
        .filter('content->>hash', 'eq', hash)
        .limit(1)
      if (!live || live.length === 0) {
        await supabase.storage.from('images').remove([`${userId}/${hash}.webp`])
      }
    }

    // 4) Hard-delete the expired board rows.
    await supabase.from('boards').delete()
      .eq('user_id', userId).not('deleted_at', 'is', null).lt('deleted_at', cutoff)
  } catch (e) {
    console.warn('[db] purgeOldDeletions failed (will retry next start):', e.message)
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
  // Guard: data must be a real array from a successful response before any
  // deletion can occur. Protects against undefined Supabase JS behaviour where
  // error is null but data is also null.
  if (!Array.isArray(data)) return

  // supabaseIds includes soft-deleted rows too, so the reconcile push never
  // re-uploads a board the server already knows about (no resurrection).
  const supabaseIds = new Set(data.map(r => r.id))

  // Durable push: upload only boards the server has NEVER seen (genuinely new);
  // queue on failure so they are retried until confirmed — never lost.
  const localBoards = await db.getAllFromIndex('boards', 'parentId', pid)
  await Promise.all(localBoards.map(async b => {
    if (supabaseIds.has(b.id) || pendingDeletes.has(b.id)) return
    try {
      const { error } = await supabase.from('boards').upsert(toSupabaseBoard(b, userId))
      if (error) throw error
    } catch (e) {
      console.warn('[db] reconcile board upsert failed, queued for retry:', b.id, e.message)
      await _queueUpsert('board', b.id)
    }
  }))

  // Apply server state to the local cache:
  //   • deleted_at set → board was deleted somewhere → remove it locally
  //   • otherwise      → write/update the live board
  // Skips ids whose local write is still in-flight so we never clobber a fresh
  // local change with older server data. Deletion is driven ONLY by an explicit
  // deleted_at tombstone — never by mere absence — so a transient/partial server
  // response can never wipe local boards.
  const pendingUpserts = await _getPendingUpsertIds()
  const tx = db.transaction('boards', 'readwrite')
  for (const row of data) {
    const board = fromSupabaseBoard(row)
    if (pendingUpserts.has(board.id)) continue
    if (_pendingBoardWrites.has(board.id)) continue
    if (board.deletedAt) {
      await tx.objectStore('boards').delete(board.id)   // propagate remote deletion
      continue
    }
    if (pendingDeletes.has(board.id)) continue
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
          if (error || !data || _pendingBoardWrites.has(id)) return
          if (data.deleted_at) { db.delete('boards', id); return }  // deleted elsewhere
          db.put('boards', { ...fromSupabaseBoard(data), parentId: toParentId(data.parent_id) })
        })
        .catch(() => {})
    }
    return local
  }
  // Not in local cache — fetch from Supabase
  const userId = await currentUserId()
  if (!userId || !navigator.onLine) return null
  const { data, error } = await supabase.from('boards').select('*').eq('id', id).eq('user_id', userId).single()
  if (error || !data || data.deleted_at) return null
  const board = fromSupabaseBoard(data)
  await db.put('boards', { ...board, parentId: toParentId(board.parentId) })
  return board
}

export async function saveBoard(board) {
  const db = await getDB()
  const normalized = { ...board, parentId: toParentId(board.parentId) }
  await db.put('boards', normalized)
  const userId = await currentUserId()
  // No user yet (auth still resolving) OR offline → queue a deduplicating upsert
  // so the board is pushed durably once we can, instead of being lost locally.
  if (!userId || !navigator.onLine) {
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
  const ts = Date.now()
  // Recurse into child boards first so the whole subtree is removed.
  const children = await db.getAllFromIndex('boards', 'parentId', id)
  for (const child of children) await deleteBoard(child.id)
  // Remove board + its elements from local immediately (instant UI feedback).
  const elements = await db.getAllFromIndex('elements', 'boardId', id)
  const tx = db.transaction(['boards', 'elements'], 'readwrite')
  for (const el of elements) await tx.objectStore('elements').delete(el.id)
  await tx.objectStore('boards').delete(id)
  await tx.done

  const userId = await currentUserId()
  if (!userId) return
  if (navigator.onLine) {
    try {
      // Soft-delete: keep the rows but stamp deleted_at so the deletion
      // propagates to every device (each removes it locally on next sync)
      // and the reconcile push can never resurrect it.
      await supabase.from('elements').update({ deleted_at: ts }).eq('board_id', id).eq('user_id', userId)
      const { error } = await supabase.from('boards').update({ deleted_at: ts }).eq('id', id).eq('user_id', userId)
      if (error) throw error
    } catch (e) {
      console.warn('[db] deleteBoard soft-delete failed, queued for retry:', e.message)
      await _queueOp({ entity: 'board', op: 'delete', entityId: id })
    }
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
  if (!Array.isArray(data)) return

  // supabaseIds includes soft-deleted rows so the reconcile push never
  // re-uploads an element the server already knows about.
  const supabaseIds = new Set(data.map(r => r.id))

  // Durable push: upload only elements the server has never seen; queue on failure.
  const localEls = await db.getAllFromIndex('elements', 'boardId', boardId)
  await Promise.all(localEls.map(async el => {
    if (supabaseIds.has(el.id) || pendingDeletes.has(el.id)) return
    try {
      const { error } = await supabase.from('elements').upsert(toSupabaseElement(el, userId))
      if (error) throw error
    } catch (e) {
      console.warn('[db] reconcile element upsert failed, queued for retry:', el.id, e.message)
      await _queueUpsert('element', el.id)
    }
  }))

  // Apply server state: deleted_at → remove locally; otherwise write the live row.
  const pendingUpserts = await _getPendingUpsertIds()
  const tx = db.transaction('elements', 'readwrite')
  for (const row of data) {
    const el = fromSupabaseElement(row)
    if (pendingUpserts.has(el.id)) continue
    if (_pendingElementWrites.has(el.id)) continue
    if (el.deletedAt) {
      await tx.objectStore('elements').delete(el.id)
      continue
    }
    if (pendingDeletes.has(el.id)) continue
    await tx.objectStore('elements').put(el)
  }
  await tx.done
}

export async function saveElement(el, { skipRemote = false } = {}) {
  const db = await getDB()
  await db.put('elements', el)
  if (skipRemote) return
  const userId = await currentUserId()
  // No user yet (auth still resolving) OR offline → queue a durable upsert.
  if (!userId || !navigator.onLine) {
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
  const ts = Date.now()
  await db.delete('elements', id)
  // Queue tombstone BEFORE the network call so background sync (which reads
  // pendingOps to decide what to skip) never writes the element back.
  await _queueOp({ entity: 'element', op: 'delete', entityId: id })
  const userId = await currentUserId()
  if (!userId || !navigator.onLine) return
  try {
    // Soft-delete: stamp deleted_at so the removal propagates to every device.
    const { error } = await supabase.from('elements').update({ deleted_at: ts }).eq('id', id).eq('user_id', userId)
    if (error) throw error
    // Remove tombstone only after Supabase confirms the soft-delete
    const ops = await db.getAll('pendingOps')
    const op = ops.find(o => o.entity === 'element' && o.entityId === id)
    if (op) await db.delete('pendingOps', op.id)
  } catch (e) {
    console.warn('[db] deleteElement soft-delete failed, keeping tombstone:', e.message)
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
    deleted_at: b.deletedAt ?? null,
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
    deletedAt: row.deleted_at ?? null,
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
    deleted_at: el.deletedAt ?? null,
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
    deletedAt: row.deleted_at ?? null,
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

function _blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

export async function exportAllData() {
  const db = await getDB()
  const boards = await db.getAll('boards')
  const elements = await db.getAll('elements')
  // Collect every unique image hash referenced by live elements (board images
  // AND images nested inside collections), then embed the actual bytes so the
  // backup restores real pictures — not just dead links.
  const hashes = new Set()
  for (const el of elements) {
    if (el.deleted_at) continue
    if (el.type === 'image' && el.content && el.content.hash) hashes.add(el.content.hash)
    const items = el.content && el.content.items
    if (Array.isArray(items)) for (const it of items) if (it && it.type === 'image' && it.content && it.content.hash) hashes.add(it.content.hash)
  }
  const images = []
  for (const hash of hashes) {
    const blob = await getCachedBlob(hash)
    if (blob) images.push({ hash, dataUrl: await _blobToDataUrl(blob) })
  }
  return { version: 2, exportedAt: Date.now(), boards, elements, images }
}

export async function importAllData(data) {
  if (!data?.boards || !data?.elements) throw new Error('Invalid backup file')
  const db = await getDB()

  // Restore embedded image bytes first so pictures render immediately from cache.
  const restored = new Set()
  if (Array.isArray(data.images)) {
    for (const img of data.images) {
      if (img && img.hash && img.dataUrl) {
        await setCachedImage(img.hash, _dataUrlToBlob(img.dataUrl))
        restored.add(img.hash)
      }
    }
  }

  // Mark restored images as pending so they re-upload to Storage (repairs any
  // dead URLs). flushPendingImageUploads() is called by the UI after import.
  const elements = data.elements.map(e =>
    (e.type === 'image' && e.content && e.content.hash && restored.has(e.content.hash))
      ? { ...e, content: { ...e.content, syncStatus: 'pending' } }
      : e
  )

  const tx = db.transaction(['boards', 'elements'], 'readwrite')
  for (const b of data.boards) await tx.objectStore('boards').put(b)
  for (const e of elements) await tx.objectStore('elements').put(e)
  await tx.done
  const userId = await currentUserId()
  if (userId) {
    for (const b of data.boards) await supabase.from('boards').upsert(toSupabaseBoard(b, userId))
    for (const e of elements) await supabase.from('elements').upsert(toSupabaseElement(e, userId))
  }
}
