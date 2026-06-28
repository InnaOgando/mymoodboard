import { useState, useEffect, useRef } from 'react'
import SortableGrid from '../SortableGrid'
import ResizeHandle from '../ResizeHandle'

// Backward compat: old `color` type used { color: '#hex' }
export function getPaletteColors(content) {
  if (content.colors && content.colors.length > 0) return content.colors
  if (content.color) return [content.color]
  return ['#e8315a']
}

// Perceived luminance — returns true when the color is light enough to need a border
function isLightColor(hex) {
  try {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return r * 0.299 + g * 0.587 + b * 0.114 > 200
  } catch { return false }
}

function hexToRgb(hex) {
  try {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `${r}, ${g}, ${b}`
  } catch { return '' }
}

const MAX_COLORS = 12
const SWATCH_SIZE = 44   // px — square swatch cell (meets 44px touch target)
const SWATCH_GAP  = 6

export default function PaletteObject({ el, selected, onUpdate, onDelete, onMakeCollection, onResize, scaleRef }) {
  const colors = getPaletteColors(el.content)
  const w = el.w || 210  // defaults to 3 swatches wide: 3×44 + 2×6 + 20pad ≈ 210

  const [editMode, setEditMode] = useState(false)
  const [editingIdx, setEditingIdx] = useState(null)
  const lastTapRef = useRef({ index: -1, time: 0 })

  // Exit edit mode when the card is deselected
  useEffect(() => {
    if (!selected) { setEditMode(false); setEditingIdx(null) }
  }, [selected])

  function setColors(next) {
    onUpdate({ ...el.content, colors: next })
  }

  function changeColor(idx, hex) {
    setColors(colors.map((c, i) => i === idx ? hex : c))
  }

  function addColor() {
    if (colors.length >= MAX_COLORS) return
    const next = [...colors, '#888888']
    setColors(next)
    setEditingIdx(next.length - 1)
  }

  function removeColor(idx) {
    if (colors.length <= 1) return
    setColors(colors.filter((_, i) => i !== idx))
    setEditingIdx(null)
  }

  // Double-tap detection: first tap is ignored, second tap within 350ms opens picker
  function handleSwatchTap(index) {
    if (!editMode) return
    const now = Date.now()
    const lt = lastTapRef.current
    if (lt.index === index && now - lt.time < 350) {
      setEditingIdx(index)
      lastTapRef.current = { index: -1, time: 0 }
    } else {
      lastTapRef.current = { index, time: now }
      // Close the editor if another swatch is tapped
      if (editingIdx !== null && editingIdx !== index) setEditingIdx(null)
    }
  }

  // Wrap colors as SortableGrid items (id is stable within a render)
  const swatchItems = colors.map((color, i) => ({ id: `s${i}-${color}`, color, idx: i }))

  return (
    <div style={{ position: 'relative', width: w }}>
      {/* Floating popup — different buttons in normal vs edit mode */}
      {selected && !editMode && (
        <div className="img-popup-menu" onPointerDown={e => e.stopPropagation()}>
          <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setEditMode(true) }}>✎ Edit</button>
          <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onMakeCollection?.() }}>+ Collection</button>
          <button className="img-popup-btn img-popup-delete" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        </div>
      )}
      {selected && editMode && (
        <div className="img-popup-menu" onPointerDown={e => e.stopPropagation()}>
          <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setEditMode(false); setEditingIdx(null) }}>✓ Done</button>
          {colors.length < MAX_COLORS && (
            <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); addColor() }}>+ Color</button>
          )}
        </div>
      )}

      <div className={`el-card el-palette ${selected ? 'selected' : ''} ${editMode ? 'palette-edit-mode' : ''}`}
        style={{ width: w }}>
        <div className="drag-handle">
          <span className="handle-dots">⠿</span>
          <span className="palette-label">{editMode ? 'Palette · double-tap to edit' : 'Palette'}</span>
        </div>

        {/* Swatch grid */}
        <SortableGrid
          items={swatchItems}
          cellSize={SWATCH_SIZE}
          gap={SWATCH_GAP}
          padTop={8}
          padRight={10}
          padBottom={8}
          padLeft={10}
          disabled={!editMode}
          onReorder={newItems => setColors(newItems.map(s => s.color))}
          onItemTap={handleSwatchTap}
          renderItem={(swatch, index, { isDragged }) => {
            const light = isLightColor(swatch.color)
            return (
              <div className="palette-swatch-sq-wrap">
                <div
                  className={`palette-swatch-sq ${light ? 'palette-swatch-sq--light' : ''} ${editMode ? 'palette-swatch-sq--edit' : ''}`}
                  style={{ background: swatch.color }}
                />
                {editMode && (
                  <button
                    className="swatch-delete-btn"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); removeColor(index) }}
                    title="Remove color"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          }}
        />

        {/* Color editor panel — appears below grid when a swatch is double-tapped */}
        {editMode && editingIdx !== null && colors[editingIdx] !== undefined && (
          <div className="palette-editor" onPointerDown={e => e.stopPropagation()}>
            <input
              type="color"
              value={colors[editingIdx]}
              className="palette-color-input"
              onChange={e => changeColor(editingIdx, e.target.value)}
            />
            <div className="palette-codes">
              <span className="palette-hex">{colors[editingIdx].toUpperCase()}</span>
              <span className="palette-rgb">RGB {hexToRgb(colors[editingIdx])}</span>
            </div>
            <button className="palette-remove"
              onClick={e => { e.stopPropagation(); removeColor(editingIdx) }}
              title="Remove color">×</button>
          </div>
        )}

        {selected && (
          <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={SWATCH_SIZE + 20} scaleRef={scaleRef} />
        )}
      </div>
    </div>
  )
}
