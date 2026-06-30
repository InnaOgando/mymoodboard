import { useEffect, useRef } from 'react'
import ResizeHandle from '../ResizeHandle'

function shortUrl(url) {
  try {
    const u = new URL(url)
    const p = u.pathname.length > 20 ? u.pathname.slice(0, 20) + '…' : u.pathname
    return u.hostname.replace('www.', '') + p
  } catch { return url.length > 40 ? url.slice(0, 40) + '…' : url }
}

export default function LinkObject({ el, selected, editing, onUpdate, onStopEdit, onResize, scaleRef }) {
  const urlRef = useRef()
  const w = el.w || 260
  const url = el.content.url || ''

  useEffect(() => {
    if (editing) urlRef.current?.focus()
  }, [editing])

  return (
    <div style={{ position: 'relative', width: w }}>
      <div className={`el-card el-link ${selected ? 'selected' : ''}`} style={{ width: w }}>
        {editing ? (
          <div className="link-edit-col">
            <label className="link-field-label">URL</label>
            <div className="link-edit-row">
              <input
                ref={urlRef}
                className="card-input"
                value={url}
                onChange={e => onUpdate({ ...el.content, url: e.target.value })}
                placeholder="https://…"
                onKeyDown={e => { if (e.key === 'Enter') onStopEdit?.() }}
              />
              <button className="paste-btn" onMouseDown={e => e.preventDefault()}
                onClick={async () => { try { onUpdate({ ...el.content, url: await navigator.clipboard.readText() }) } catch {} }}>
                <img src="/link.png" alt="paste" style={{ width: 18, height: 18, objectFit: 'contain' }} />
              </button>
            </div>
            <button className="btn-primary" style={{ marginTop: 8 }}
              onMouseDown={e => e.preventDefault()} onClick={onStopEdit}>Done</button>
          </div>
        ) : (
          <div className="link-view">
            {url
              ? <span className="link-view-url">
                  <img src="/link.png" alt="" style={{ width: 12, height: 12, objectFit: 'contain', marginRight: 4, verticalAlign: 'middle', opacity: 0.6 }} />
                  {shortUrl(url)}
                </span>
              : <span className="link-view-url link-view-placeholder">Two taps to open URL</span>}
          </div>
        )}
        {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={160} scaleRef={scaleRef} />}
      </div>
    </div>
  )
}
