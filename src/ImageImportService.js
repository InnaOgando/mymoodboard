import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getCachedBlob, setCachedImage, saveElement, getDB } from './db'

const IMAGE_CONFIG = {
  MAX_PX: 512,
  TARGET_BYTES: 50 * 1024,
  FORMAT: 'image/webp',
  QUALITY_START: 0.75,
  QUALITY_MIN: 0.55,
  QUALITY_STEP: 0.05,
}

// ── 1. Image optimization pipeline ──────────────────────────────────────────

/**
 * Optimize a File, Blob, or string (URL / base64 data URI) to a WebP blob
 * ≤MAX_PX longest side, targeting <TARGET_BYTES using adaptive quality stepping.
 * @returns {{ blob: Blob, width: number, height: number, sizeBytes: number }}
 */
export async function optimize(input) {
  const blob = await _toBlob(input)
  const bitmap = await createImageBitmap(blob)
  const { width: origW, height: origH } = bitmap

  let w = origW
  let h = origH
  if (Math.max(w, h) > IMAGE_CONFIG.MAX_PX) {
    if (w >= h) { h = Math.round(h * IMAGE_CONFIG.MAX_PX / w); w = IMAGE_CONFIG.MAX_PX }
    else        { w = Math.round(w * IMAGE_CONFIG.MAX_PX / h); h = IMAGE_CONFIG.MAX_PX }
  }

  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const stepInt  = Math.round(IMAGE_CONFIG.QUALITY_STEP  * 100)
  const minInt   = Math.round(IMAGE_CONFIG.QUALITY_MIN   * 100)
  let qualityInt = Math.round(IMAGE_CONFIG.QUALITY_START * 100)
  let result

  do {
    result = await _canvasToBlob(canvas, IMAGE_CONFIG.FORMAT, qualityInt / 100)
    if (result.size <= IMAGE_CONFIG.TARGET_BYTES) break
    qualityInt -= stepInt
  } while (qualityInt >= minInt)

  canvas.width = 1
  canvas.height = 1
  return { blob: result, width: w, height: h, sizeBytes: result.size }
}

async function _toBlob(input) {
  if (input instanceof Blob) return input
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const [header, b64] = input.split(',')
      const mime = header.match(/:(.*?);/)[1]
      const bytes = atob(b64)
      const arr = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
      return new Blob([arr], { type: mime })
    }
    const res = await fetch(input)
    return res.blob()
  }
  throw new Error('ImageImportService.optimize: unsupported input type')
}

function _canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), type, quality)
  })
}

// ── 2. SHA-256 deduplication ─────────────────────────────────────────────────

export async function sha256Hex(blob) {
  const buf = await blob.arrayBuffer()
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function _findExistingRemoteUrl(hash, userId) {
  const { data } = await supabase
    .from('elements')
    .select('content')
    .eq('user_id', userId)
    .filter('content->>hash', 'eq', hash)
    .eq('type', 'image')
    .limit(1)
  if (data && data.length > 0) {
    const src = data[0].content?.src
    // Only return a confirmed remote URL — skip null or legacy dataUrls
    if (src && src.startsWith('http')) return src
  }
  return null
}

// ── 3. Upload to Supabase Storage ─────────────────────────────────────────────

async function _uploadWebp(blob, userId, hash) {
  const path = `${userId}/${hash}.webp`
  const { error } = await supabase.storage
    .from('images')
    .upload(path, blob, { contentType: IMAGE_CONFIG.FORMAT, upsert: false })

  if (error && error.statusCode !== '409' && error.message && !error.message.includes('already exists')) {
    throw error
  }

  const { data } = supabase.storage.from('images').getPublicUrl(path)
  return data.publicUrl
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Full import pipeline: optimize → cache locally as Blob → upload when online.
 *
 * The local Blob is stored permanently in IndexedDB regardless of network state.
 * Supabase is synchronisation and backup only.
 *
 * When offline:
 *   Returns { src: null, hash, syncStatus: 'pending', ... }
 *   The local Blob is the working copy. Upload happens on reconnect.
 *
 * When online:
 *   Returns { src: remoteUrl, hash, syncStatus: 'synced', ... }
 *   The local Blob is still kept. Rendering always prefers local first.
 *
 * @param {File|Blob|string} input
 * @returns {{ src: string|null, hash: string, width: number, height: number, sizeBytes: number, syncStatus: 'synced'|'pending' }}
 */
export async function processAndUpload(input) {
  const { blob, width, height, sizeBytes } = await optimize(input)
  const hash = await sha256Hex(blob)

  // Always cache the Blob locally first — this is the permanent working copy
  await setCachedImage(hash, blob)

  // Auth session is in local storage — works offline
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not authenticated')

  if (!navigator.onLine) {
    return { src: null, hash, width, height, sizeBytes, syncStatus: 'pending' }
  }

  try {
    const existingUrl = await _findExistingRemoteUrl(hash, userId)
    if (existingUrl) return { src: existingUrl, hash, width, height, sizeBytes, syncStatus: 'synced' }
    const src = await _uploadWebp(blob, userId, hash)
    return { src, hash, width, height, sizeBytes, syncStatus: 'synced' }
  } catch (e) {
    console.warn('[ImageImportService] upload failed, will retry on reconnect:', e.message)
    return { src: null, hash, width, height, sizeBytes, syncStatus: 'pending' }
  }
}

/**
 * Upload pending images when back online.
 * Sets content.src to the remote URL and syncStatus to 'synced'.
 * The local Blob is NEVER removed — IndexedDB is the working database.
 */
export async function flushPendingImageUploads() {
  if (!navigator.onLine) return
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return

  const db = await getDB()
  const allElements = await db.getAll('elements')
  const pending = allElements.filter(
    el => el.type === 'image' && el.content?.syncStatus === 'pending' && el.content?.hash
  )

  if (pending.length === 0) return
  console.log('[ImageImportService] uploading', pending.length, 'pending image(s)')

  for (const el of pending) {
    const { hash } = el.content
    try {
      let remoteUrl = await _findExistingRemoteUrl(hash, userId)
      if (!remoteUrl) {
        const blob = await getCachedBlob(hash)
        if (!blob) { console.warn('[ImageImportService] no cached blob for hash:', hash); continue }
        remoteUrl = await _uploadWebp(blob, userId, hash)
      }
      // Update src and syncStatus — local Blob stays in imageCache permanently
      const updated = { ...el, content: { ...el.content, src: remoteUrl, syncStatus: 'synced' } }
      await saveElement(updated)
    } catch (e) {
      console.warn('[ImageImportService] flush failed for hash:', hash, e.message)
    }
  }
}

// ── 4. Background image caching ──────────────────────────────────────────────

/**
 * For each image element in the list, download and cache the blob if not already
 * in IndexedDB. Runs entirely in the background — never blocks the caller.
 * Skips elements with no src or no hash. Skips already-cached hashes. Continues
 * past individual fetch failures.
 */
export async function cacheImagesInBackground(elements) {
  const images = elements.filter(
    el => el.type === 'image' && el.content?.hash && el.content?.src
  )
  for (const el of images) {
    const { hash, src } = el.content
    try {
      const existing = await getCachedBlob(hash)
      if (existing) continue
      const response = await fetch(src)
      if (!response.ok) continue
      const blob = await response.blob()
      await setCachedImage(hash, blob)
    } catch {
      // one image failing must not stop the rest
    }
  }
}

// ── 5. Orphan cleanup ─────────────────────────────────────────────────────────

/**
 * Delete from Supabase Storage if no other element references this image.
 * Never touches the local Blob cache.
 */
export async function deleteImageIfOrphaned(url, currentElementId) {
  if (!url || !url.startsWith('http')) return  // local-only image, nothing to clean up
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return

    const marker = '/object/public/images/'
    const idx = url.indexOf(marker)
    if (idx === -1) return
    const pathPart = url.slice(idx + marker.length)
    const fileName = pathPart.split('/').pop()
    const hash = fileName.replace(/\.webp$/, '')

    const { data } = await supabase
      .from('elements')
      .select('id, content')
      .eq('user_id', userId)
      .filter('content->>hash', 'eq', hash)
      .eq('type', 'image')

    const others = (data || []).filter(el => el.id !== currentElementId)
    if (others.length === 0) {
      await supabase.storage.from('images').remove([pathPart])
    }
  } catch (e) {
    console.warn('[ImageImportService] deleteImageIfOrphaned error:', e)
  }
}

// ── 5. Image rendering hook ───────────────────────────────────────────────────
//
// Rendering priority:
//   1. Local Blob (ObjectURL) — immediate, works offline
//   2. Remote URL              — fallback when not cached locally
//
// Includes IntersectionObserver for lazy loading.

const PLACEHOLDER_SVG = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'><rect width='1' height='1' fill='%23f0f0f0'/></svg>`

/**
 * Hook that returns the best available image source.
 * Always prefers the local Blob cache over the remote URL.
 *
 * @param {string|null} remoteSrc  — el.content.src (remote URL or null)
 * @param {string|null} hash       — el.content.hash (SHA-256)
 */
export function useCachedImage(remoteSrc, hash) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // ObjectURL created from the cached Blob — revoked on cleanup
  const [blobUrl, setBlobUrl] = useState(null)

  // Look up local Blob and create ObjectURL
  useEffect(() => {
    if (!hash) return
    let latestUrl = null
    let cancelled = false

    getCachedBlob(hash).then(blob => {
      if (cancelled || !blob) return
      const url = URL.createObjectURL(blob)
      latestUrl = url
      setBlobUrl(url)
    })

    return () => {
      cancelled = true
      if (latestUrl) URL.revokeObjectURL(latestUrl)
    }
  }, [hash])

  // Intersection observer for lazy loading (avoids loading off-screen images)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { rootMargin: '100px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The best available src: local blob URL > remote URL > null
  const displaySrc = blobUrl || remoteSrc

  useEffect(() => {
    if (!visible || !displaySrc) return
    setLoaded(false)
    const img = new Image()
    img.onload = () => setLoaded(true)
    img.onerror = () => setLoaded(true)
    img.src = displaySrc
  }, [visible, displaySrc])

  return {
    ref,
    loaded,
    visibleSrc: visible ? displaySrc : null,
    placeholderSrc: PLACEHOLDER_SVG,
  }
}

// ── 6. Storage statistics ─────────────────────────────────────────────────────

export async function getStorageStats(userId) {
  const { data, error } = await supabase
    .from('elements')
    .select('content')
    .eq('user_id', userId)
    .eq('type', 'image')

  if (error) throw error
  const refs = data || []
  const totalBytes = refs.reduce((sum, el) => sum + (Number(el.content?.sizeBytes) || 0), 0)
  const averageBytes = refs.length ? Math.round(totalBytes / refs.length) : 0
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2)

  return { references: refs.length, totalBytes, averageBytes, totalMB }
}
