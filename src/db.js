import { openDB } from 'idb'

const DB_NAME = 'refbook'
const DB_VERSION = 1

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('images')) {
        const store = db.createObjectStore('images', { keyPath: 'id' })
        store.createIndex('projectId', 'projectId')
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' })
      }
    }
  })
}

export async function getProjects() {
  const db = await getDB()
  return db.getAll('projects')
}

export async function saveProject(project) {
  const db = await getDB()
  await db.put('projects', project)
}

export async function deleteProject(id) {
  const db = await getDB()
  const images = await db.getAllFromIndex('images', 'projectId', id)
  const tx = db.transaction(['projects', 'images'], 'readwrite')
  await tx.objectStore('projects').delete(id)
  for (const img of images) {
    await tx.objectStore('images').delete(img.id)
  }
  await tx.done
}

export async function getImages(projectId) {
  const db = await getDB()
  return db.getAllFromIndex('images', 'projectId', projectId)
}

export async function saveImage(image) {
  const db = await getDB()
  await db.put('images', image)
}

export async function deleteImage(id) {
  const db = await getDB()
  await db.delete('images', id)
}

export async function getConfig(key) {
  const db = await getDB()
  const row = await db.get('config', key)
  return row?.value
}

export async function setConfig(key, value) {
  const db = await getDB()
  await db.put('config', { key, value })
}
