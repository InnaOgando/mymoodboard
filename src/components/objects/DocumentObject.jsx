import ResizeHandle from '../ResizeHandle'

export default function DocumentObject({ el, selected, onResize, scaleRef }) {
  const w = el.w || 180

  function openDoc(e) {
    e.stopPropagation()
    if (!el.content.src) return
    const byteStr = atob(el.content.src.split(',')[1])
    const ab = new ArrayBuffer(byteStr.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i)
    const blob = new Blob([ab], { type: el.content.type || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.target = '_blank'; a.rel = 'noreferrer'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  return (
    <div style={{ position: 'relative', width: w }}>

      <div className={`el-card el-document ${selected ? 'selected' : ''}`} style={{ width: w }}>
        <div className="drag-handle">
          <span className="handle-dots">⠿</span>
        </div>
        <div className="doc-icon">{el.content.type === 'application/pdf' ? '📄' : '📝'}</div>
        <div className="doc-name">{el.content.name}</div>
        {el.content.src && (
          <button className="doc-open" onPointerDown={e => e.stopPropagation()} onClick={openDoc}>Open</button>
        )}
        {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={140} scaleRef={scaleRef} />}
      </div>
    </div>
  )
}
