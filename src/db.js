import { openDB } from 'idb'
import { supabase } from './supabase'

const DB_NAME = 'refmemo'
const DB_VERSION = 2
const ROOT = '__root__'

export function toParentId(id) { return id ?? ROOT }

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
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
    }
  })
}

// Cache userId — fast path. Falls back to getSession() if cache not ready yet.
// We also resolve any pending waiters when the session becomes known.
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
// Seed the cache as soon as the module loads
supabase.auth.getSession().then(({ data }) => {
  if (_cachedUserId === null) {
    _notifyUserId(data?.session?.user?.id ?? null)
  }
})

async function currentUserId() {
  if (_cachedUserId !== null) return _cachedUserId
  // Haven't heard from Supabase yet — ask directly
  const { data } = await supabase.auth.getSession()
  const id = data?.session?.user?.id ?? null
  _cachedUserId = id
  return id
}

// ── Boards ──────────────────────────────────────────────

export async function getBoards(parentId = null) {
  const userId = await currentUserId()
  const db = await getDB()
  const pid = toParentId(parentId)
  if (userId) {
    const { data, error } = await supabase
      .from('boards')
      .select('*')
      .eq('user_id', userId)
      .eq('parent_id', pid)
    if (error) {
      // Network/RLS error — fall back to IndexedDB, do NOT overwrite
      console.warn('[db] getBoards Supabase error, using IndexedDB:', error.message)
      return db.getAllFromIndex('boards', 'parentId', pid)
    }
    if (data && data.length > 0) {
      // Supabase has data — it is authoritative; sync down to IndexedDB
      const boards = data.map(fromSupabaseBoard)
      const tx = db.transaction('boards', 'readwrite')
      for (const b of boards) await tx.objectStore('boards').put({ ...b, parentId: toParentId(b.parentId) })
      await tx.done
      return boards
    }
    // Supabase returned empty — check IndexedDB for unsynced local data
    const local = await db.getAllFromIndex('boards', 'parentId', pid)
    if (local.length > 0) {
      // Push local boards up to Supabase so they're not lost on next login
      for (const b of local) {
        supabase.from('boards').upsert(toSupabaseBoard(b, userId)).then(({ error: e }) => {
          if (e) console.warn('[db] sync-up board failed:', e.message)
        })
      }
    }
    return local
  }
  return db.getAllFromIndex('boards', 'parentId', pid)
}

export async function getBoard(id) {
  const userId = await currentUserId()
  const db = await getDB()
  if (userId) {
    const { data, error } = await supabase
      .from('boards')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()
    if (!error && data) {
      const board = fromSupabaseBoard(data)
      await db.put('boards', { ...board, parentId: toParentId(board.parentId) })
      return board
    }
  }
  return db.get('boards', id)
}

export async function saveBoard(board) {
  const db = await getDB()
  const normalized = { ...board, parentId: toParentId(board.parentId) }
  await db.put('boards', normalized)
  const userId = await currentUserId()
  if (userId) {
    supabase.from('boards').upsert(toSupabaseBoard(normalized, userId)).then(({ error }) => {
      if (error) console.warn('[db] saveBoard upsert failed:', error.message)
    })
  }
}

export async function deleteBoard(id) {
  const db = await getDB()
  const children = await getBoards(id)
  for (const child of children) await deleteBoard(child.id)
  const elements = await getElements(id)
  const tx = db.transaction(['boards', 'elements'], 'readwrite')
  for (const el of elements) await tx.objectStore('elements').delete(el.id)
  await tx.objectStore('boards').delete(id)
  await tx.done
  const userId = await currentUserId()
  if (userId) {
    supabase.from('elements').delete().eq('board_id', id).eq('user_id', userId)
      .then(({ error }) => { if (error) console.warn('[db] deleteBoard elements failed:', error.message) })
    supabase.from('boards').delete().eq('id', id).eq('user_id', userId)
      .then(({ error }) => { if (error) console.warn('[db] deleteBoard board failed:', error.message) })
  }
}

// ── Elements ─────────────────────────────────────────────

export async function getElements(boardId) {
  const userId = await currentUserId()
  const db = await getDB()
  if (userId) {
    const { data, error } = await supabase
      .from('elements')
      .select('*')
      .eq('board_id', boardId)
      .eq('user_id', userId)
    if (error) {
      console.warn('[db] getElements Supabase error, using IndexedDB:', error.message)
      return db.getAllFromIndex('elements', 'boardId', boardId)
    }
    if (data && data.length > 0) {
      const elements = data.map(fromSupabaseElement)
      const tx = db.transaction('elements', 'readwrite')
      for (const el of elements) await tx.objectStore('elements').put(el)
      await tx.done
      return elements
    }
    // Supabase empty — push local up if any
    const local = await db.getAllFromIndex('elements', 'boardId', boardId)
    if (local.length > 0) {
      for (const el of local) {
        supabase.from('elements').upsert(toSupabaseElement(el, userId)).then(({ error: e }) => {
          if (e) console.warn('[db] sync-up element failed:', e.message)
        })
      }
    }
    return local
  }
  return db.getAllFromIndex('elements', 'boardId', boardId)
}

export async function saveElement(el, { skipRemote = false } = {}) {
  if (el.type === 'image' && el.content?.sizeBytes) {
    console.debug('[db] saveElement image sizeBytes:', el.content.sizeBytes, 'hash:', el.content.hash)
  }
  const db = await getDB()
  await db.put('elements', el)
  if (!skipRemote) {
    const userId = await currentUserId()
    if (userId) {
      supabase.from('elements').upsert(toSupabaseElement(el, userId)).then(({ error }) => {
        if (error) console.warn('[db] saveElement upsert failed:', error.message)
      })
    }
  }
}

export async function deleteElement(id) {
  const db = await getDB()
  await db.delete('elements', id)
  const userId = await currentUserId()
  if (userId) {
    supabase.from('elements').delete().eq('id', id).eq('user_id', userId)
      .then(({ error }) => { if (error) console.warn('[db] deleteElement failed:', error.message) })
  }
}

// ── Shape converters ──────────────────────────────────────

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

// ── Config ────────────────────────────────────────────────

export async function getConfig(key) {
  const db = await getDB()
  const row = await db.get('config', key)
  return row?.value
}

export async function setConfig(key, value) {
  const db = await getDB()
  await db.put('config', { key, value })
}

// ── Backup / Restore (local JSON) ─────────────────────────

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
  // Sync imported data to Supabase
  const userId = await currentUserId()
  if (userId) {
    for (const b of data.boards) await supabase.from('boards').upsert(toSupabaseBoard(b, userId))
    for (const e of data.elements) await supabase.from('elements').upsert(toSupabaseElement(e, userId))
  }
}
