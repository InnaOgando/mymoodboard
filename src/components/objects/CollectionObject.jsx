import { useState, useEffect } from 'react'
import ResizeHandle from '../ResizeHandle'
import CachedImage from './CachedImage'
import { getPaletteColors } from './PaletteObject'
import { PRESET_COLORS } from '../../colors'

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
          style={{ width: '100%', display: 'block' }}
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
  el, selected, isDropTarget, onUpdate, onDelete, onResize, onEjectItem, onDuplicate, scaleRef
}) {
  const w = el.w || 260
  const items = getCollectionItems(el.content)
  const accentColor = el.content.color || null
  const label = el.content.name || 'Collection'

  const [showMenu, setShowMenu] = useState(false)
  const [showColors, setShowColors] = useState(false)

  useEffect(() => {
    if (!selected) { setShowMenu(false); setShowColors(false) }
  }, [selected])

  function handleRename() {
    const next = prompt('Collection name:', label)
    if (next !== null) onUpdate({ ...el.content, name: next.trim() || 'Collection' })
    setShowMenu(false)
  }

  function handleColorSelect(color) {
    onUpdate({ ...el.content, color })
    setShowColors(false)
    setShowMenu(false)
  }

  return (
    <div style={{ position: 'relative', width: w }}>

      {selected && showMenu && (
        <div className="col-menu-dropdown" onPointerDown={e => e.stopPropagation()}>
          <button className="col-menu-item" onClick={e => { e.stopPropagation(); handleRename() }}>Rename</button>
          <button className="col-menu-item" onClick={e => { e.stopPropagation(); setShowMenu(false); setShowColors(true) }}>Color</button>
          <button className="col-menu-item" onClick={e => { e.stopPropagation(); onDuplicate?.(); setShowMenu(false) }}>Duplicate</button>
          <button className="col-menu-item col-menu-danger" onClick={e => { e.stopPropagation(); onDelete(); setShowMenu(false) }}>Delete</button>
        </div>
      )}

      {selected && showColors && (
        <div className="col-color-panel" onPointerDown={e => e.stopPropagation()}>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              className={`col-color-swatch ${accentColor === c ? 'col-color-swatch--active' : ''}`}
              style={{ background: c }}
              onClick={e => { e.stopPropagation(); handleColorSelect(c) }}
            />
          ))}
          <button className="col-color-none"
            onClick={e => { e.stopPropagation(); handleColorSelect(null) }}>None</button>
        </div>
      )}

      <div
        className={`el-card el-collection ${selected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''}`}
        style={{ width: w, borderColor: accentColor || undefined }}
      >
        <div className="drag-handle" style={{ background: accentColor ? `${accentColor}1a` : undefined }}>
          <span className="handle-dots">⠿</span>
          <span className="column-label">{label}</span>
          {selected && (
            <button
              className="col-menu-btn"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setShowColors(false); setShowMenu(m => !m) }}
            >⋯</button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="collection-empty">Drag objects here</div>
        ) : (
          <div className="collection-items">
            {items.map(item => (
              <div key={item.id} className="collection-item-wrap">
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
            ))}
          </div>
        )}

        {selected && (
          <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={140} scaleRef={scaleRef} />
        )}
      </div>
    </div>
  )
}
