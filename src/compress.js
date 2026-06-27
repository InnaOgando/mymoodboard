import { optimize } from './ImageImportService'

/**
 * @deprecated Use processAndUpload from storage.js instead.
 * Compresses a blob to a base64 JPEG data URL.
 * Internally delegates to ImageImportService.optimize (produces WebP).
 */
export async function compressImage(blob) {
  try {
    const { blob: webp } = await optimize(blob)
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(webp)
    })
  } catch {
    // Hard fallback to original canvas approach so callers never break
    return _legacyCompressImage(blob)
  }
}

/**
 * @deprecated Use processAndUpload from storage.js instead.
 * Compresses a blob to a Blob (was JPEG, now WebP via ImageImportService).
 */
export async function compressToBlob(blob) {
  try {
    const { blob: webp } = await optimize(blob)
    return webp
  } catch {
    return _legacyCompressToBlob(blob)
  }
}

// ── Legacy implementations kept as internal fallbacks ─────────────────────────

const MAX = 1200

function _legacyCompressToBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(resolve, 'image/jpeg', 0.75)
    }
    img.onerror = reject
    img.src = url
  })
}

function _legacyCompressImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.onerror = reject
    img.src = url
  })
}
