import { useRef } from 'react'

// A plain tap landing in the handle's (deliberately generous) hit zone must
// behave exactly like a tap anywhere else on the card — selection, double-tap
// preview, etc. So this never claims the gesture on pointerdown. It only
// commits to a resize once real drag movement is observed, mirroring how
// DraggableCard itself tells a tap apart from a drag. Until that happens it
// stays silent (no stopPropagation/preventDefault), so the event keeps
// bubbling to DraggableCard and its tap/double-tap/long-press logic runs
// completely independently of resize.
const MOVE_THRESHOLD = 4

export default function ResizeHandle({ w, h, onResize, minW = 80, minH = 60, scaleRef }) {
  const startPtr = useRef(null)
  const engaged = useRef(false)
  const divRef = useRef()

  function resizeTo(e) {
    const s = scaleRef?.current ?? 1
    const nw = Math.max(minW, (startPtr.current.w || 150) + (e.clientX - startPtr.current.x) / s)
    const nh = h !== null ? Math.max(minH, (startPtr.current.h || 120) + (e.clientY - startPtr.current.y) / s) : null
    onResize(nw, nh)
  }

  return (
    <div
      ref={divRef}
      className="resize-handle"
      style={{ touchAction: 'none', padding: 16, margin: -16, boxSizing: 'content-box' }}
      onPointerDown={e => {
        startPtr.current = { x: e.clientX, y: e.clientY, w, h }
        engaged.current = false
        // Capture early so fast movement off the small hit zone still reaches
        // us — capture alone does not stop the event from bubbling, so a tap
        // that never crosses the move threshold still reaches DraggableCard.
        try { divRef.current?.setPointerCapture(e.pointerId) } catch {}
      }}
      onPointerMove={e => {
        if (!startPtr.current) return
        if (!engaged.current) {
          const dx = e.clientX - startPtr.current.x
          const dy = e.clientY - startPtr.current.y
          if (Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return
          engaged.current = true
        }
        e.stopPropagation()
        e.preventDefault()
        resizeTo(e)
      }}
      onPointerUp={e => {
        if (engaged.current) e.stopPropagation()
        startPtr.current = null
        engaged.current = false
      }}
      onPointerCancel={e => {
        if (engaged.current) e.stopPropagation()
        startPtr.current = null
        engaged.current = false
      }}
    />
  )
}
