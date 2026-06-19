import { useRef } from 'react'

const INTERACTIVE = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'A'])

export default function DraggableCard({ x, y, scaleRef, onMove, onTap, onDragMove, onDragEnd, children, selected, alwaysDraggable }) {
  const isDragging = useRef(false)
  const startPointer = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const lastPos = useRef({ x, y })
  const moved = useRef(false)
  const ref = useRef()
  const longTimer = useRef(null)
  const savedPointerId = useRef(null)

  function cancelLong() {
    if (longTimer.current) {
      clearTimeout(longTimer.current)
      longTimer.current = null
    }
    ref.current?.classList.remove('long-pressing')
  }

  function onPointerDown(e) {
    const isHandle = e.target.closest('.drag-handle')
    const isInteractive = INTERACTIVE.has(e.target.tagName) && !isHandle
    if (isInteractive) return
    if (e.target.closest('.resize-handle')) return
    e.stopPropagation()

    moved.current = false
    startPointer.current = { x: e.clientX, y: e.clientY }
    savedPointerId.current = e.pointerId

    if (selected || alwaysDraggable) {
      isDragging.current = true
      startPos.current = { x, y }
      ref.current.setPointerCapture(e.pointerId)
    } else {
      // Long-press activates drag on unselected elements
      ref.current?.classList.add('long-pressing')
      const capturedX = x
      const capturedY = y
      const capturedId = e.pointerId
      longTimer.current = setTimeout(() => {
        longTimer.current = null
        ref.current?.classList.remove('long-pressing')
        isDragging.current = true
        startPos.current = { x: capturedX, y: capturedY }
        try { ref.current?.setPointerCapture(capturedId) } catch {}
      }, 450)
    }
  }

  function onPointerMove(e) {
    const dx = e.clientX - startPointer.current.x
    const dy = e.clientY - startPointer.current.y
    // Cancel long-press if finger moves too much (user is scrolling canvas)
    if (longTimer.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      cancelLong()
    }
    if (!isDragging.current) return
    const s = scaleRef?.current ?? 1
    const ndx = dx / s
    const ndy = dy / s
    if (Math.abs(ndx) > 4 || Math.abs(ndy) > 4) moved.current = true
    if (moved.current) {
      const nx = startPos.current.x + ndx
      const ny = startPos.current.y + ndy
      lastPos.current = { x: nx, y: ny }
      onMove?.(nx, ny)
      onDragMove?.(nx, ny)
    }
  }

  function onPointerUp() {
    cancelLong()
    if (moved.current) {
      onDragEnd?.(lastPos.current.x, lastPos.current.y)
    } else {
      onTap?.()
    }
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
      onPointerCancel={onPointerUp}
    >
      {children}
    </div>
  )
}
