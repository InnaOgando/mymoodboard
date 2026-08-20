import { useEffect, useMemo } from 'react'

// In-app document viewer. Opening a blob/new tab works in Safari but NOT in the
// Capacitor WKWebView, so we render the file inside the app instead.
export default function DocumentPreview({ el, onClose }) {
  const url = useMemo(() => {
    try {
      const b64 = (el.content.src || '').split(',')[1]
      if (!b64) return null
      const byteStr = atob(b64)
      const ab = new ArrayBuffer(byteStr.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i)
      const blob = new Blob([ab], { type: el.content.type || 'application/pdf' })
      return URL.createObjectURL(blob)
    } catch { return null }
  }, [el])

  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const name = el.content.name || 'Document'
  const isPdf = (el.content.type === 'application/pdf') || /\.pdf$/i.test(name)

  return (
    <div className="doc-preview-overlay">
      <div className="doc-preview-bar">
        <span className="doc-preview-title">{el.content.name || 'Document'}</span>
        <button className="doc-preview-close" onClick={onClose}>Done</button>
      </div>
      {url && isPdf
        ? <iframe title={name} src={url} className="doc-preview-frame" />
        : (
          <div className="doc-preview-error">
            <p className="doc-preview-msg">Preview is available for PDF files.</p>
            <p className="doc-preview-sub">Word and Excel files open in their own app — coming in a later update.</p>
          </div>
        )}
    </div>
  )
}
