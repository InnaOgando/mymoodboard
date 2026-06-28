import ResizeHandle from '../ResizeHandle'
import SortableGrid from '../SortableGrid'
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

// Compact read-only thumbnail preview of any object type inside the collection
function MiniObject({ item }) {
  const type = normalizeType(item.type)
  switch (type) {
    case 'image':
      return <img src={item.content.src} alt="" draggable={false} />
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
  el, selected, isDropTarget, onUpdate, onDelete, onResize, onAddImage, onEjectItem, scaleRef
}) {
  const w = el.w || 260
  const items = getCollectionItems(el.content)

  function handleReorder(newItems) {
    onUpdate?.({ ...el.content, items: newItems })
  }

  return (
    <div style={{ position: 'relative', width: w }}>
      {selected && (
        <div className="img-popup-menu" onPointerDown={e => e.stopPropagation()}>
          <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onAddImage?.() }}>+ Image</button>
          <button className="img-popup-btn img-popup-delete" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        </div>
      )}

      <div
        className={`el-card el-collection ${selected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''}`}
        style={{ width: w }}
      >
        <div className="drag-handle">
          <span className="handle-dots">⠿</span>
          <span className="column-label">Collection{selected ? ' · drag to reorder' : ''}</span>
        </div>

        {items.length === 0 ? (
          <div className="collection-empty">Drag objects here</div>
        ) : (
          <SortableGrid
            items={items}
            cellSize={120}
            gap={4}
            padTop={6}
            padRight={8}
            padBottom={8}
            padLeft={8}
            disabled={!selected}
            onReorder={handleReorder}
            renderItem={(item, index, { isDragged }) => (
              <div className="collection-item-wrap">
                <MiniObject item={item} />
                {selected && (
                  <button
                    className="col-img-eject"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onEjectItem?.(item.id) }}
                    title="Move to canvas"
                  >
                    ↗
                  </button>
                )}
              </div>
            )}
          />
        )}

        {selected && (
          <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={140} scaleRef={scaleRef} />
        )}
      </div>
    </div>
  )
}
