import ResizeHandle from '../ResizeHandle'
import CachedImage from './CachedImage'
import { getPaletteColors } from './PaletteObject'

function normalizeType(type) {
  if (type === 'text' || type === 'note') return 'idea'
  if (type === 'color') return 'palette'
  return type
}

// Backward compat: old column format used content.images
export function getCollectionItems(content) {
  if (content.items) return content.items
  if (content.images) {
    return content.images.map(img => ({ id: img.id, type: 'image', content: { src: img.src } }))
  }
  return []
}

function shortUrl(url) {
  try {
    const u = new URL(url)
    return u.hostname.replace('www.', '')
  } catch { return url.slice(0, 24) + '…' }
}

// Full-fidelity preview — objects display at their natural size inside the collection
function CollectionItem({ item }) {
  const type = normalizeType(item.type)
  switch (type) {
    case 'image':
      return (
        <CachedImage
          src={item.content.src}
          hash={item.content.hash}
          style={{ width: item.w || 150, height: 'auto', display: 'block' }}
          draggable={false}
        />
      )
    case 'idea':
      return (
        <div className="mini-idea">
          <span className="mini-idea-icon">💡</span>
          <span className="mini-idea-text">{item.content.text || '(empty)'}</span>
        </div>
      )
    case 'link':
      return (
        <div className="mini-link">
          <div className="mini-link-title">{item.content.title || shortUrl(item.content.url || '') || 'Link'}</div>
          {item.content.url && (
            <a className="mini-link-url" href={item.content.url} target="_blank" rel="noreferrer"
              onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
              {shortUrl(item.content.url)}
            </a>
          )}
        </div>
      )
    case 'palette':
      return (
        <div className="mini-palette">
          {getPaletteColors(item.content).map((c, i) => (
            <div key={i} className="mini-swatch" style={{ background: c }} />
          ))}
        </div>
      )
    case 'todo':
      return (
        <div className="mini-todo">
          {(item.content.items || []).slice(0, 4).map((t, i) => (
            <div key={i} className="mini-todo-item">
              <span className="mini-todo-check">{t.done ? '☑' : '☐'}</span>
              <span className={`mini-todo-text ${t.done ? 'done' : ''}`}>{t.text || '…'}</span>
            </div>
          ))}
        </div>
      )
    default:
      return <div className="mini-unknown">{item.type}</div>
  }
}

export default function CollectionObject({
  el, selected, isDropTarget, onResize, onEjectItem, scaleRef,
}) {
  const w = el.w || 260
  const items = getCollectionItems(el.content)
  const accentColor = el.content.color || null
  const label = el.content.name || 'Collection'

  return (
    <div style={{ position: 'relative', width: w, paddingBottom: selected ? 12 : 0 }}>

      <div
        className={`el-card el-collection ${selected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''}`}
        style={{ width: w, borderColor: accentColor || undefined }}
      >
        <div className="drag-handle" style={{ background: accentColor ? `${accentColor}1a` : undefined }}>
          <span className="handle-dots">⠿</span>
          <span className="column-label">{label}</span>
        </div>

        {items.length === 0 ? (
          <div className="collection-empty">Drag objects here</div>
        ) : (
          <div className="collection-items">
            {items.map(item => {
              const isText = normalizeType(item.type) !== 'image'
              return (
                <div key={item.id} className={`collection-item-wrap${isText ? ' collection-item-wrap--text' : ''}`}>
                  <CollectionItem item={item} />
                  {selected && (
                    <button
                      className="col-img-eject"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); onEjectItem?.(item.id) }}
                      title="Move to canvas"
                    >↗</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)}
          minW={Math.max(140, ...items.map(i => i.w || 150))}
          scaleRef={scaleRef} />
      )}
    </div>
  )
}
