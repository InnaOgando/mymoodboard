import { useRef } from 'react'

export default function ResizeHandle({ w, h, onResize, minW = 80, minH = 60, scaleRef }) {
  const startPtr = useRef(null)
  return (
    <div
      className="resize-handle"
      onPointerDown={e => {
        e.stopPropagation(); e.preventDefault()
        startPtr.current = { x: e.clientX, y: e.clientY, w, h }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        if (!startPtr.current) return
        const s = scaleRef?.current ?? 1
        const nw = Math.max(minW, (startPtr.current.w || 150) + (e.clientX - startPtr.current.x) / s)
        const nh = h !== null ? Math.max(minH, (startPtr.current.h || 120) + (e.clientY - startPtr.current.y) / s) : null
        onResize(nw, nh)
      }}
      onPointerUp={() => { startPtr.current = null }}
    />
  )
}
