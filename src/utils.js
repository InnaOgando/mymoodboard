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
