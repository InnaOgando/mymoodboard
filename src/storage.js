import { supabase } from './supabase'
import { processAndUpload as _processAndUpload, deleteImageIfOrphaned } from './ImageImportService'

/**
 * Process, optimize, deduplicate and upload an image.
 * Returns { src, hash, width, height, sizeBytes }.
 * Use this as the single entry point for all image imports.
 */
export async function processAndUpload(input) {
  return _processAndUpload(input)
}

/**
 * Delete image from Storage only if no other element references it.
 * Replaces the old deleteImage.
 */
export { deleteImageIfOrphaned }

/**
 * @deprecated Use processAndUpload instead.
 * Kept for legacy callers. Uploads and returns the public URL only.
 */
export async function uploadImage(file) {
  const result = await _processAndUpload(file)
  return result.src
}

/**
 * @deprecated Use deleteImageIfOrphaned instead.
 * Hard-deletes without orphan check — kept so old callers don't break.
 */
export async function deleteImage(url) {
  try {
    const marker = '/object/public/images/'
    const idx = url.indexOf(marker)
    if (idx === -1) return
    const path = url.slice(idx + marker.length)
    await supabase.storage.from('images').remove([path])
  } catch {}
}
