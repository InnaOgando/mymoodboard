import ResizeHandle from '../ResizeHandle'
import { useLazyImage } from '../../ImageImportService.js'

export default function ImageObject({ el, selected, onDelete, onResize, onMakeCollection, scaleRef }) {
  const w = el.w || 150
  const { ref, loaded, visibleSrc, placeholderSrc } = useLazyImage(el.content.src)

  return (
    <div style={{ position: 'relative', width: w }}>
      {selected && (
        <div className="img-popup-menu" onPointerDown={e => e.stopPropagation()}>
          <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onMakeCollection?.() }}>+ Collection</button>
          <button className="img-popup-btn img-popup-delete" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        </div>
      )}
      <div ref={ref} className={`el-card el-image ${selected ? 'selected' : ''}`} style={{ width: w, position: 'relative', minHeight: 60 }}>
        {!loaded && (
          <div style={{ width: '100%', minHeight: 80, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 20, height: 20, border: '2px solid #ccc', borderTopColor: '#888', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}
        {visibleSrc && (
          <img src={visibleSrc} alt="" draggable={false}
            style={{ width: '100%', height: 'auto', display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease' }} />
        )}
        {!visibleSrc && !loaded && (
          <img src={placeholderSrc} alt="" draggable={false} style={{ width: '100%', height: 'auto', display: 'block' }} />
        )}
        {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={60} scaleRef={scaleRef} />}
      </div>
    </div>
  )
}
