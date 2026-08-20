import ResizeHandle from '../ResizeHandle'

export default function DocumentObject({ el, selected, onResize, scaleRef, onOpenDoc }) {
  const w = el.w || 180

  function openDoc(e) {
    e.stopPropagation()
    if (!el.content.src) return
    onOpenDoc?.()
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
      </div>
      {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={140} scaleRef={scaleRef} />}
    </div>
  )
}
