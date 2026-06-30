import { useState, useEffect, useRef } from 'react'
import { HexColorPicker } from 'react-colorful'
import ResizeHandle from '../ResizeHandle'

// Backward compat: old `color` type used { color: '#hex' }
export function getPaletteColors(content) {
  if (content.colors && content.colors.length > 0) return content.colors
  if (content.color) return [content.color]
  return ['#e8315a']
}

function isLightColor(hex) {
  try {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return r * 0.299 + g * 0.587 + b * 0.114 > 200
  } catch { return false }
}

const SWATCH_SIZE = 90

export default function PaletteObject({ el, selected, editing, onUpdate, onResize, scaleRef }) {
  const colors = getPaletteColors(el.content)
  const [activeIdx, setActiveIdx] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const idx = Math.min(activeIdx, colors.length - 1)
  const size = el.w || SWATCH_SIZE
  const w = size * colors.length + 6 * (colors.length - 1)
  const pickerRef = useRef()

  // Double-tap (editing prop) opens picker for the active swatch
  useEffect(() => {
    if (editing) setPickerOpen(true)
  }, [editing])

  // Close picker on outside tap
  useEffect(() => {
    if (!pickerOpen) return
    function onDown(e) {
      if (!pickerRef.current?.contains(e.target)) setPickerOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [pickerOpen])

  function changeColor(hex) {
    onUpdate({ ...el.content, colors: colors.map((c, ci) => ci === idx ? hex : c) })
  }

  return (
    <div style={{ position: 'relative', width: w }}>
      <div className={`el-palette-row ${selected ? 'selected' : ''}`}>
        {colors.map((color, i) => {
          const light = isLightColor(color)
          return (
            <div key={i} className="palette-swatch-wrap">
              <div
                className={`palette-swatch-sq ${light ? 'palette-swatch-sq--light' : ''} ${i === idx ? 'active' : ''}`}
                style={{ background: color, width: size, height: size }}
                onClick={() => setActiveIdx(i)}
              />
              <span
                className={`palette-hex${copiedIdx === i ? ' copied' : ''}`}
                onClick={e => {
                  e.stopPropagation()
                  navigator.clipboard?.writeText(color.toUpperCase())
                  setCopiedIdx(i)
                  setTimeout(() => setCopiedIdx(null), 1200)
                }}
              >{copiedIdx === i ? 'Copied!' : color.toUpperCase()}</span>
            </div>
          )
        })}
      </div>

      {pickerOpen && (
        <div
          ref={pickerRef}
          className="palette-picker-popover"
          onPointerDown={e => e.stopPropagation()}
        >
          <HexColorPicker color={colors[idx]} onChange={changeColor} />
          <div className="palette-picker-hex">
            <span className="palette-picker-hex-label">{colors[idx].toUpperCase()}</span>
            <button className="palette-picker-done" onPointerDown={e => e.stopPropagation()} onClick={() => setPickerOpen(false)}>Done</button>
          </div>
        </div>
      )}

      {selected && (
        <ResizeHandle w={size} h={null} onResize={nw => onResize(nw, null)} minW={50} scaleRef={scaleRef} />
      )}
    </div>
  )
}
