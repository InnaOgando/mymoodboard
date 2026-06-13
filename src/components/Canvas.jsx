import { useRef, useState } from 'react'

export default function Canvas({ children, onClick, scaleRef: externalScaleRef }) {
  const [offset, setOffset] = useState({ x: 40, y: 40 })
  const [scale, setScale] = useState(1)
  const scaleRef = externalScaleRef || useRef(1)
  const isPanning = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const lastDist = useRef(null)
  const containerRef = useRef()
  const didMove = useRef(false)

  function updateScale(newScale) {
    scaleRef.current = newScale
    setScale(newScale)
  }

  function isInteractive(el) {
    return el.closest('.draggable-card')
  }

  function onPointerDown(e) {
    if (isInteractive(e.target)) return
    isPanning.current = true
    didMove.current = false
    lastPos.current = { x: e.clientX, y: e.clientY }
    containerRef.current.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!isPanning.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didMove.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
  }

  function onPointerUp(e) {
    if (!didMove.current && isPanning.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const pos = {
        x: (e.clientX - rect.left - offset.x) / scaleRef.current,
        y: (e.clientY - rect.top - offset.y) / scaleRef.current,
      }
      onClick?.(pos)
    }
    isPanning.current = false
  }

  function onTouchMove(e) {
    if (e.touches.length !== 2) return
    e.preventDefault()
    const t1 = e.touches[0], t2 = e.touches[1]
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
    const midX = (t1.clientX + t2.clientX) / 2
    const midY = (t1.clientY + t2.clientY) / 2
    const rect = containerRef.current.getBoundingClientRect()

    if (lastDist.current !== null) {
      const ratio = dist / lastDist.current
      const newScale = Math.min(Math.max(scaleRef.current * ratio, 0.15), 5)
      const mx = midX - rect.left
      const my = midY - rect.top
      setOffset(prev => ({
        x: mx - (mx - prev.x) * (newScale / scaleRef.current),
        y: my - (my - prev.y) * (newScale / scaleRef.current),
      }))
      updateScale(newScale)
    }
    lastDist.current = dist
  }

  function onTouchEnd() { lastDist.current = null }

  function onWheel(e) {
    e.preventDefault()
    const rect = containerRef.current.getBoundingClientRect()
    const ratio = e.deltaY < 0 ? 1.1 : 0.9
    const newScale = Math.min(Math.max(scaleRef.current * ratio, 0.15), 5)
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setOffset(prev => ({
      x: mx - (mx - prev.x) * (newScale / scaleRef.current),
      y: my - (my - prev.y) * (newScale / scaleRef.current),
    }))
    updateScale(newScale)
  }

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={e => { onPointerUp(e); containerRef.current?.focus() }}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      style={{ touchAction: 'none', outline: 'none' }}
    >
      <div className="canvas-bg" />
      <div
        className="canvas-inner"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
