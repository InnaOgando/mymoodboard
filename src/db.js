import { openDB } from 'idb'

const DB_NAME = 'refnest'
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

// Boards — use '__root__' instead of null so Safari indexes it
export async function getBoards(parentId = null) {
  const db = await getDB()
  const all = await db.getAllFromIndex('boards', 'parentId', toParentId(parentId))
  return all
}

export async function getBoard(id) {
  const db = await getDB()
  return db.get('boards', id)
}

export async function saveBoard(board) {
  const db = await getDB()
  // normalize parentId before saving
  await db.put('boards', { ...board, parentId: toParentId(board.parentId) })
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
}

// Elements
export async function getElements(boardId) {
  const db = await getDB()
  return db.getAllFromIndex('elements', 'boardId', boardId)
}

export async function saveElement(el) {
  const db = await getDB()
  await db.put('elements', el)
}

export async function deleteElement(id) {
  const db = await getDB()
  await db.delete('elements', id)
}

// Config
export async function getConfig(key) {
  const db = await getDB()
  const row = await db.get('config', key)
  return row?.value
}

export async function setConfig(key, value) {
  const db = await getDB()
  await db.put('config', { key, value })
}
