import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

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

  // Adaptive compression: step quality down until under TARGET_BYTES or QUALITY_MIN reached
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

async function _findExistingUrl(hash, userId) {
  const { data } = await supabase
    .from('elements')
    .select('content')
    .eq('user_id', userId)
    .filter('content->>hash', 'eq', hash)
    .eq('type', 'image')
    .limit(1)
  if (data && data.length > 0) {
    return data[0].content?.src ?? null
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
 * Full pipeline: optimize → deduplicate → upload.
 * @param {File|Blob|string} input
 * @returns {{ src: string, hash: string, width: number, height: number, sizeBytes: number }}
 */
export async function processAndUpload(input) {
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not authenticated')

  const { blob, width, height, sizeBytes } = await optimize(input)
  const hash = await sha256Hex(blob)

  const existingUrl = await _findExistingUrl(hash, userId)
  if (existingUrl) {
    return { src: existingUrl, hash, width, height, sizeBytes }
  }

  const src = await _uploadWebp(blob, userId, hash)
  return { src, hash, width, height, sizeBytes }
}

// ── 4. Orphan cleanup ─────────────────────────────────────────────────────────

/**
 * Delete image from Storage only if no other elements (besides currentElementId) reference it.
 */
export async function deleteImageIfOrphaned(url, currentElementId) {
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

// ── 5. Lazy loading hook ──────────────────────────────────────────────────────

const PLACEHOLDER_SVG = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'><rect width='1' height='1' fill='%23f0f0f0'/></svg>`

/**
 * @param {string|null} src
 * @returns {{ ref: React.RefObject, loaded: boolean, visibleSrc: string|null, placeholderSrc: string }}
 */
export function useLazyImage(src) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  const [loaded, setLoaded] = useState(false)

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

  useEffect(() => {
    if (!visible || !src) return
    setLoaded(false)
    const img = new Image()
    img.onload = () => setLoaded(true)
    img.onerror = () => setLoaded(true)
    img.src = src
  }, [visible, src])

  return {
    ref,
    loaded,
    visibleSrc: visible ? src : null,
    placeholderSrc: PLACEHOLDER_SVG,
  }
}

// ── 6. Storage statistics ─────────────────────────────────────────────────────

/**
 * @param {string} userId
 * @returns {{ references: number, totalBytes: number, averageBytes: number, totalMB: string }}
 */
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
