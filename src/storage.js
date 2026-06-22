import { supabase } from './supabase'
import { compressToBlob } from './compress'

// Upload image file to Supabase Storage, returns public URL
export async function uploadImage(file) {
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not authenticated')

  const compressed = await compressToBlob(file)
  const ext = 'jpg'
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage
    .from('images')
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: false })

  if (error) throw error

  const { data } = supabase.storage.from('images').getPublicUrl(path)
  return data.publicUrl
}

// Delete image from Storage by URL
export async function deleteImage(url) {
  try {
    // Extract path from URL: .../storage/v1/object/public/images/USER/FILE
    const marker = '/object/public/images/'
    const idx = url.indexOf(marker)
    if (idx === -1) return
    const path = url.slice(idx + marker.length)
    await supabase.storage.from('images').remove([path])
  } catch {}
}
