import { useState } from 'react'
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

export default function PaletteObject({ el, selected, onUpdate, onResize, scaleRef }) {
  const colors = getPaletteColors(el.content)
  const [activeIdx, setActiveIdx] = useState(0)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const idx = Math.min(activeIdx, colors.length - 1)
  const size = el.w || SWATCH_SIZE
  const w = size * colors.length + 6 * (colors.length - 1)

  function changeColor(i, hex) {
    onUpdate({ ...el.content, colors: colors.map((c, ci) => ci === i ? hex : c) })
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
                onClick={() => { console.log(`[palette] swatch-div[${i}] onClick (setActiveIdx)`); setActiveIdx(i) }}
              >
                {/* Native OS color picker — always in DOM so trigger can .click() it synchronously */}
                <input
                  ref={el => { inputRefs.current[i] = el }}
                  type="color"
                  value={color}
                  className="palette-color-input-hidden"
                  style={{ pointerEvents: selected ? 'auto' : 'none' }}
                  onPointerDown={e => console.log(`[palette] input[${i}] pointerdown — isPrimary:${e.isPrimary} type:${e.pointerType} target:${e.target.tagName}`)}
                  onPointerUp={e => console.log(`[palette] input[${i}] pointerup   — isPrimary:${e.isPrimary} type:${e.pointerType}`)}
                  onClick={e => console.log(`[palette] input[${i}] click        — isTrusted:${e.isTrusted}`)}
                  onFocus={e => console.log(`[palette] input[${i}] focus`)}
                  onBlur={e => console.log(`[palette] input[${i}] blur`)}
                  onChange={e => { console.log(`[palette] input[${i}] onChange → ${e.target.value}`); setActiveIdx(i); changeColor(i, e.target.value) }}
                />
              </div>
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

      {selected && (
        <ResizeHandle w={size} h={null} onResize={nw => onResize(nw, null)} minW={50} scaleRef={scaleRef} />
      )}
    </div>
  )
}
