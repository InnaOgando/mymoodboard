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

// Cache userId from auth state — avoids getSession() failing after tab suspension
let _cachedUserId = null
supabase.auth.onAuthStateChange((_event, session) => {
  _cachedUserId = session?.user?.id ?? null
})
supabase.auth.getSession().then(({ data }) => {
  _cachedUserId = data?.session?.user?.id ?? null
})

function currentUserId() {
  return _cachedUserId
}

// ── Boards ──────────────────────────────────────────────

export async function getBoards(parentId = null) {
  const userId = currentUserId()
  const db = await getDB()
  if (userId) {
    const pid = toParentId(parentId)
    const { data, error } = await supabase
      .from('boards')
      .select('*')
      .eq('user_id', userId)
      .eq('parent_id', pid)
    if (!error && data) {
      const boards = data.map(fromSupabaseBoard)
      const tx = db.transaction('boards', 'readwrite')
      for (const b of boards) await tx.objectStore('boards').put({ ...b, parentId: toParentId(b.parentId) })
      await tx.done
      return boards
    }
  }
  return db.getAllFromIndex('boards', 'parentId', toParentId(parentId))
}

export async function getBoard(id) {
  const userId = currentUserId()
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
  const userId = currentUserId()
  if (userId) supabase.from('boards').upsert(toSupabaseBoard(normalized, userId))
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
  // Supabase in background
  const userId = currentUserId()
  if (userId) {
    supabase.from('elements').delete().eq('board_id', id).eq('user_id', userId)
    supabase.from('boards').delete().eq('id', id).eq('user_id', userId)
  }
}

// ── Elements ─────────────────────────────────────────────

export async function getElements(boardId) {
  const userId = currentUserId()
  const db = await getDB()
  if (userId) {
    const { data, error } = await supabase
      .from('elements')
      .select('*')
      .eq('board_id', boardId)
      .eq('user_id', userId)
    if (!error && data) {
      const elements = data.map(fromSupabaseElement)
      const tx = db.transaction('elements', 'readwrite')
      for (const el of elements) await tx.objectStore('elements').put(el)
      await tx.done
      return elements
    }
  }
  return db.getAllFromIndex('elements', 'boardId', boardId)
}

export async function saveElement(el, { skipRemote = false } = {}) {
  const db = await getDB()
  await db.put('elements', el)
  if (!skipRemote) {
    const userId = currentUserId()
    if (userId) supabase.from('elements').upsert(toSupabaseElement(el, userId))
  }
}

export async function deleteElement(id) {
  const db = await getDB()
  await db.delete('elements', id)
  const userId = currentUserId()
  if (userId) supabase.from('elements').delete().eq('id', id).eq('user_id', userId)
}

// ── Shape converters ──────────────────────────────────────

function toSupabaseBoard(b, userId) {
  return {
    id: b.id,
    user_id: userId,
    parent_id: toParentId(b.parentId),
    name: b.name,
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
