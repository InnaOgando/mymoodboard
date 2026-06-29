import { useRef } from 'react'

export default function ResizeHandle({ w, h, onResize, minW = 80, minH = 60, scaleRef }) {
  const startPtr = useRef(null)
  const divRef = useRef()

  return (
    <div
      ref={divRef}
      className="resize-handle"
      style={{ touchAction: 'none', padding: 16, margin: -16, boxSizing: 'content-box' }}
      onPointerDown={e => {
        e.stopPropagation()
        e.preventDefault()
        startPtr.current = { x: e.clientX, y: e.clientY, w, h }
        divRef.current?.setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        e.stopPropagation()
        e.preventDefault()
        if (!startPtr.current) return
        // Re-capture if React re-rendered the div and the capture was lost
        if (divRef.current && !divRef.current.hasPointerCapture(e.pointerId)) {
          try { divRef.current.setPointerCapture(e.pointerId) } catch {}
        }
        const s = scaleRef?.current ?? 1
        const nw = Math.max(minW, (startPtr.current.w || 150) + (e.clientX - startPtr.current.x) / s)
        const nh = h !== null ? Math.max(minH, (startPtr.current.h || 120) + (e.clientY - startPtr.current.y) / s) : null
        onResize(nw, nh)
      }}
      onPointerUp={e => {
        e.stopPropagation()
        startPtr.current = null
      }}
      onPointerCancel={e => {
        e.stopPropagation()
        startPtr.current = null
      }}
    />
  )
}
