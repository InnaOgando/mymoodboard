import { useRef } from 'react'
import ResizeHandle from '../ResizeHandle'
import CachedImage from './CachedImage'
import { getPaletteColors } from './PaletteObject'
import { openUrl } from '../../utils.js'

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

const DOUBLE_TAP_MS = 420

// Full-fidelity preview — objects display at their natural size inside the collection
function CollectionItem({ item }) {
  const type = normalizeType(item.type)
  const lastTapRef = useRef(0)

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
        <div className="mini-idea" style={item.w ? { width: item.w } : undefined}>
          <span className="mini-idea-icon">💡</span>
          <span className="mini-idea-text">{item.content.text || '(empty)'}</span>
        </div>
      )
    case 'link': {
      const url = item.content.url?.trim()
      function handleLinkPointerDown(e) {
        const now = Date.now()
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
          e.stopPropagation()
          openUrl(url)
        }
        lastTapRef.current = now
      }
      return (
        <div className="mini-link" style={item.w ? { width: item.w } : undefined} onPointerDown={handleLinkPointerDown}>
          <div className="mini-link-title">{item.content.title || shortUrl(url || '') || 'Link'}</div>
          {url && (
            <span className="mini-link-url" onPointerDown={e => e.stopPropagation()}>
              {shortUrl(url)}
            </span>
          )}
        </div>
      )
    }
    case 'palette': {
      const colors = getPaletteColors(item.content)
      const swatchSize = item.w || 90
      const totalW = swatchSize * colors.length + 6 * (colors.length - 1)
      return (
        <div className="mini-palette" style={{ width: totalW }}>
          {colors.map((c, i) => (
            <div key={i} className="palette-swatch-wrap">
              <div className="mini-swatch" style={{ background: c, width: swatchSize, height: swatchSize }} />
              <span className="palette-hex">{c.toUpperCase()}</span>
            </div>
          ))}
        </div>
      )
    }
    case 'todo':
      return (
        <div className="mini-todo" style={item.w ? { width: item.w } : undefined}>
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
        className={`el-collection ${selected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''}`}
        style={{ width: w, borderColor: accentColor || undefined }}
      >
        <div className="col-header drag-handle" style={{ background: accentColor ? `${accentColor}1a` : undefined }}>
          <span className="col-header-icon" />
          <span className="col-header-title">{label}</span>
        </div>

        {items.length === 0 ? (
          <div className="collection-empty">Drag objects here</div>
        ) : (
          <div className="collection-items">
            {items.map(item => {
              return (
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
