import { useEffect, useRef } from 'react'
import ResizeHandle from '../ResizeHandle'

function shortUrl(url) {
  try {
    const u = new URL(url)
    const p = u.pathname.length > 20 ? u.pathname.slice(0, 20) + '…' : u.pathname
    return u.hostname.replace('www.', '') + p
  } catch { return url.length > 40 ? url.slice(0, 40) + '…' : url }
}

export default function LinkObject({ el, selected, editing, onUpdate, onDelete, onStopEdit, onEdit, onResize, onMakeCollection, scaleRef }) {
  const urlRef = useRef()
  const w = el.w || 260
  const title = el.content.title || ''
  const url = el.content.url || ''

  useEffect(() => {
    if (editing) setTimeout(() => urlRef.current?.focus(), 50)
  }, [editing])

  return (
    <div style={{ position: 'relative', width: w }}>
      {selected && (
        <div className="img-popup-menu" onPointerDown={e => e.stopPropagation()}>
          <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onEdit?.() }}>✎ Edit</button>
          <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onMakeCollection?.() }}>+ Collection</button>
          <button className="img-popup-btn img-popup-delete" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        </div>
      )}

      <div className={`el-card el-link ${selected ? 'selected' : ''}`} style={{ width: w }}>
        <div className="drag-handle">
          <span className="handle-dots">⠿</span>
          <span className="idea-label">Link</span>
        </div>

        {editing ? (
          <div className="link-edit-col">
            <label className="link-field-label">Title</label>
            <input
              className="card-input"
              value={title}
              onChange={e => onUpdate({ ...el.content, title: e.target.value })}
              placeholder="e.g. Forest atmosphere"
            />
            <label className="link-field-label" style={{ marginTop: 8 }}>URL</label>
            <div className="link-edit-row">
              <input
                ref={urlRef}
                className="card-input"
                value={url}
                onChange={e => onUpdate({ ...el.content, url: e.target.value })}
                placeholder="https://…"
              />
              <button className="paste-btn" onMouseDown={e => e.preventDefault()}
                onClick={async () => { try { onUpdate({ ...el.content, url: await navigator.clipboard.readText() }) } catch {} }}>
                <img src="/link.png" alt="paste" style={{ width: 18, height: 18, objectFit: 'contain' }} />
              </button>
            </div>
            <button className="btn-primary" style={{ marginTop: 8 }} onMouseDown={e => e.preventDefault()} onClick={onStopEdit}>Done</button>
          </div>
        ) : (
          <div className="link-view">
            {title
              ? <div className="link-view-title">{title}</div>
              : <div className="link-view-title link-view-placeholder">Tap ✎ Edit to add title</div>}
            {url
              ? <a className="link-view-url" href={url} target="_blank" rel="noreferrer" onPointerDown={e => e.stopPropagation()}>
                  <img src="/link.png" alt="" style={{ width: 12, height: 12, objectFit: 'contain', marginRight: 4, verticalAlign: 'middle', opacity: 0.6 }} />
                  {shortUrl(url)}
                </a>
              : <span className="link-view-url link-view-placeholder">No URL yet</span>}
          </div>
        )}
        {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={160} scaleRef={scaleRef} />}
      </div>
    </div>
  )
}
