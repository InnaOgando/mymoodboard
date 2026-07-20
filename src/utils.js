export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

export function openUrl(url) {
  if (!url) return
  const href = /^https?:\/\//i.test(url) ? url : 'https://' + url
  const a = document.createElement('a')
  a.href = href; a.target = '_blank'; a.rel = 'noreferrer noopener'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// Read files into stable in-memory copies immediately. iOS Safari can invalidate
// or alias File objects from the photo picker once the <input> is cleared/GC'd,
// so a later async read may return a DIFFERENT (previously selected) image's
// bytes. Snapshotting the ArrayBuffer up front guarantees each file keeps its
// own data through the whole optimize/upload pipeline.
export async function stableFiles(files) {
  return Promise.all(files.map(async f => {
    try {
      const buf = await f.arrayBuffer()
      return new File([buf], f.name || 'image', { type: f.type || 'application/octet-stream' })
    } catch {
      return f
    }
  }))
}
