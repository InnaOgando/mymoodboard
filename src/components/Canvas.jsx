import { useRef, useEffect, useLayoutEffect, useState } from 'react'

export default function Canvas({ children, onClick, scaleRef: externalScaleRef }) {
  const containerRef = useRef()
  const innerRef = useRef()
  const offsetRef = useRef({ x: 40, y: 40 })
  const internalScaleRef = useRef(1)
  const scaleRef = externalScaleRef || internalScaleRef

  // Active pointers map: pointerId → {x, y}
  const pointers = useRef(new Map())
  const lastPinchDist = useRef(null)
  const lastPinchMid = useRef(null)
  const isPanning = useRef(false)
  const panStart = useRef({ px: 0, py: 0, ox: 0, oy: 0 })
  const didMove = useRef(false)

  // Force one render so children mount
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])

  function applyTransform() {
    if (!innerRef.current) return
    const { x, y } = offsetRef.current
    const s = scaleRef.current
    innerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${s})`
  }

  function getRect() {
    return containerRef.current.getBoundingClientRect()
  }

  function onPointerDown(e) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 1) {
      // Could be pan — only if not on a card
      if (!e.target.closest('.draggable-card')) {
        isPanning.current = true
        didMove.current = false
        panStart.current = {
          px: e.clientX, py: e.clientY,
          ox: offsetRef.current.x, oy: offsetRef.current.y
        }
        containerRef.current.setPointerCapture(e.pointerId)
      }
    } else if (pointers.current.size === 2) {
      // Two fingers — switch to pinch zoom, cancel pan
      isPanning.current = false
      lastPinchDist.current = null
      lastPinchMid.current = null
    }
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2) {
      // Pinch zoom
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      const rect = getRect()

      if (lastPinchDist.current !== null) {
        const ratio = dist / lastPinchDist.current
        const oldScale = scaleRef.current
        const newScale = Math.min(Math.max(oldScale * ratio, 0.1), 8)
        const mx = midX - rect.left
        const my = midY - rect.top
        offsetRef.current = {
          x: mx - (mx - offsetRef.current.x) * (newScale / oldScale),
          y: my - (my - offsetRef.current.y) * (newScale / oldScale),
        }
        scaleRef.current = newScale
        applyTransform()
      }
      lastPinchDist.current = dist
      lastPinchMid.current = { x: midX, y: midY }

    } else if (pointers.current.size === 1 && isPanning.current) {
      // Pan
      const dx = e.clientX - panStart.current.px
      const dy = e.clientY - panStart.current.py
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didMove.current = true
      offsetRef.current = {
        x: panStart.current.ox + dx,
        y: panStart.current.oy + dy,
      }
      applyTransform()
    }
  }

  function onPointerUp(e) {
    const wasOnCanvas = isPanning.current && !e.target.closest('.draggable-card')

    if (!didMove.current && wasOnCanvas) {
      const rect = getRect()
      const pos = {
        x: (e.clientX - rect.left - offsetRef.current.x) / scaleRef.current,
        y: (e.clientY - rect.top - offsetRef.current.y) / scaleRef.current,
      }
      onClick?.(pos)
    }

    pointers.current.delete(e.pointerId)

    if (pointers.current.size < 2) {
      lastPinchDist.current = null
      lastPinchMid.current = null
    }
    if (pointers.current.size === 0) {
      isPanning.current = false
    }
  }

  function onWheel(e) {
    e.preventDefault()
    const rect = getRect()
    const ratio = e.deltaY < 0 ? 1.1 : 0.9
    const oldScale = scaleRef.current
    const newScale = Math.min(Math.max(oldScale * ratio, 0.1), 8)
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    offsetRef.current = {
      x: mx - (mx - offsetRef.current.x) * (newScale / oldScale),
      y: my - (my - offsetRef.current.y) * (newScale / oldScale),
    }
    scaleRef.current = newScale
    applyTransform()
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // After every React re-render, restore the transform that was set via direct DOM
  // (React resets inline style on re-render, which would snap the canvas back to initial position)
  useLayoutEffect(() => {
    applyTransform()
  })

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      tabIndex={0}
      style={{ touchAction: 'none', outline: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="canvas-bg" />
      <div
        ref={innerRef}
        className="canvas-inner"
        style={{ transform: `translate(${offsetRef.current.x}px, ${offsetRef.current.y}px) scale(1)` }}
      >
        {ready && children}
      </div>
    </div>
  )
}
