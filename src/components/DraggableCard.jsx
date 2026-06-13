import { useRef } from 'react'

const INTERACTIVE = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'A'])

export default function DraggableCard({ x, y, scaleRef, onMove, onTap, children, selected }) {
  const isDragging = useRef(false)
  const startPointer = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const moved = useRef(false)
  const ref = useRef()

  function onPointerDown(e) {
    // Only drag from handle or non-interactive surface
    const isHandle = e.target.closest('.drag-handle')
    const isInteractive = INTERACTIVE.has(e.target.tagName) && !isHandle
    if (isInteractive) return
    if (e.target.closest('.resize-handle')) return
    e.stopPropagation()
    moved.current = false
    startPointer.current = { x: e.clientX, y: e.clientY }
    // Only start drag tracking if already selected
    if (selected) {
      isDragging.current = true
      startPos.current = { x, y }
      ref.current.setPointerCapture(e.pointerId)
    }
  }

  function onPointerMove(e) {
    if (!isDragging.current) return
    const s = scaleRef?.current ?? 1
    const dx = (e.clientX - startPointer.current.x) / s
    const dy = (e.clientY - startPointer.current.y) / s
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true
    if (moved.current) onMove?.(startPos.current.x + dx, startPos.current.y + dy)
  }

  function onPointerUp() {
    if (!moved.current) onTap?.()
    isDragging.current = false
  }

  return (
    <div
      ref={ref}
      className={`draggable-card ${selected ? 'selected' : ''}`}
      style={{ left: x, top: y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {children}
    </div>
  )
}
