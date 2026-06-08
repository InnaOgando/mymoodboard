// Handles the Web Share Target POST — receives shared image and forwards to app via BroadcastChannel
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.pathname !== '/share-target' || event.request.method !== 'POST') return

  event.respondWith((async () => {
    const formData = await event.request.formData()
    const files = formData.getAll('images')
    const text = formData.get('text') || ''
    const title = formData.get('title') || ''

    for (const file of files) {
      if (!file || !file.type?.startsWith('image/')) continue
      const arrayBuffer = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(arrayBuffer, file.type)
      const bc = new BroadcastChannel('share-target')
      bc.postMessage({ data: base64, name: file.name || title || 'Shared image', sourceUrl: text || null })
      bc.close()
      break // only first image per share
    }

    return Response.redirect('/', 303)
  })())
})

function arrayBufferToBase64(buffer, type) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return `data:${type};base64,${btoa(binary)}`
}
