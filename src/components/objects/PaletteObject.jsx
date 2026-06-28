import { useState } from 'react'

// Backward compat: old `color` type used { color: '#hex' }
export function getPaletteColors(content) {
  if (content.colors && content.colors.length > 0) return content.colors
  if (content.color) return [content.color]
  return ['#e8315a']
}

const MAX_COLORS = 8

export default function PaletteObject({ el, selected, onUpdate, onDelete, onMakeCollection }) {
  const colors = getPaletteColors(el.content)
  const [editingIdx, setEditingIdx] = useState(null)

  function setColors(next) {
    onUpdate({ ...el.content, colors: next })
  }

  function changeColor(idx, hex) {
    const next = colors.map((c, i) => i === idx ? hex : c)
    setColors(next)
  }

  function addColor() {
    if (colors.length >= MAX_COLORS) return
    setColors([...colors, '#888888'])
    setEditingIdx(colors.length)
  }

  function removeColor(idx) {
    if (colors.length <= 1) return
    const next = colors.filter((_, i) => i !== idx)
    setColors(next)
    setEditingIdx(null)
  }

  function hexToRgb(hex) {
    try {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return `${r}, ${g}, ${b}`
    } catch { return '' }
  }

  const activeColor = editingIdx !== null ? colors[editingIdx] : null

  return (
    <div style={{ position: 'relative' }}>
      {selected && (
        <div className="img-popup-menu" onPointerDown={e => e.stopPropagation()}>
          <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onMakeCollection?.() }}>+ Collection</button>
          <button className="img-popup-btn img-popup-delete" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        </div>
      )}

      <div className={`el-card el-palette ${selected ? 'selected' : ''}`}>
        <div className="drag-handle">
          <span className="handle-dots">⠿</span>
          <span className="palette-label">Palette</span>
        </div>

        <div className="palette-swatches" onPointerDown={e => e.stopPropagation()}>
          {colors.map((c, i) => (
            <button
              key={i}
              className={`palette-swatch ${editingIdx === i ? 'active' : ''}`}
              style={{ background: c }}
              onClick={e => { e.stopPropagation(); setEditingIdx(editingIdx === i ? null : i) }}
            />
          ))}
          {selected && colors.length < MAX_COLORS && (
            <button className="palette-add" onClick={e => { e.stopPropagation(); addColor() }}>+</button>
          )}
        </div>

        {selected && editingIdx !== null && activeColor && (
          <div className="palette-editor" onPointerDown={e => e.stopPropagation()}>
            <input
              type="color"
              value={activeColor}
              className="palette-color-input"
              onChange={e => changeColor(editingIdx, e.target.value)}
            />
            <div className="palette-codes">
              <span className="palette-hex">{activeColor.toUpperCase()}</span>
              <span className="palette-rgb">RGB {hexToRgb(activeColor)}</span>
            </div>
            <button className="palette-remove" onClick={e => { e.stopPropagation(); removeColor(editingIdx) }} title="Remove this color">×</button>
          </div>
        )}
      </div>
    </div>
  )
}
