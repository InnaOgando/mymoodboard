import { useState, useRef, useLayoutEffect } from 'react'

// Pixels of movement before a pointerdown becomes a drag (not a tap)
const MOVE_THRESHOLD = 6

/**
 * SortableGrid
 *
 * Shared by CollectionObject and PaletteObject.
 * Renders items in a responsive fixed-cell grid.
 * When `disabled` is false, supports drag-to-reorder via pointer events.
 *
 * Props:
 *   items        - array of { id, ... }
 *   renderItem   - (item, index, { isDragged }) => ReactNode
 *   onReorder    - (newItems) => void
 *   onItemTap    - (index) => void  (fired when pointer up with no drag)
 *   cellSize     - width AND height of each cell (default 120)
 *   gap          - gap between cells (default 4)
 *   padTop/Right/Bottom/Left - inner padding
 *   disabled     - when true, no drag; pointer events fall through to parent
 */
export default function SortableGrid({
  items,
  renderItem,
  onReorder,
  onItemTap,
  cellSize = 120,
  gap = 4,
  padTop = 6,
  padRight = 8,
  padBottom = 8,
  padLeft = 8,
  disabled = false,
}) {
  const containerRef = useRef()
  const [numCols, setNumCols] = useState(1)
  // dragRef holds mutable drag tracking data (not state, to avoid extra renders)
  const dragRef = useRef(null)
  // dragState drives visual positions — needs to be React state for re-renders
  const [dragState, setDragState] = useState(null)
  // dragState = { index, insertIndex, dx, dy }  (dx/dy in container-local px)

  // ── Measure columns ───────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const measure = () => {
      const w = containerRef.current.offsetWidth
      const innerW = w - padLeft - padRight
      const cols = Math.max(1, Math.floor((innerW + gap) / (cellSize + gap)))
      setNumCols(cols)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [cellSize, gap, padLeft, padRight])

  // ── Grid math ─────────────────────────────────────────────────────────────
  function gridPos(index, cols) {
    const c = cols ?? numCols
    const col = index % c
    const row = Math.floor(index / c)
    return {
      x: padLeft + col * (cellSize + gap),
      y: padTop + row * (cellSize + gap),
    }
  }

  // CSS transform scale between screen px and container-local px
  function getScale() {
    if (!containerRef.current) return 1
    const rect = containerRef.current.getBoundingClientRect()
    return rect.width / (containerRef.current.offsetWidth || 1)
  }

  // Which cell is the pointer over? Returns an index in [0, items.length-1]
  function findInsertIndex(screenX, screenY) {
    const rect = containerRef.current.getBoundingClientRect()
    const scale = getScale()
    const localX = (screenX - rect.left) / scale - padLeft
    const localY = (screenY - rect.top) / scale - padTop
    const col = Math.max(0, Math.min(numCols - 1, Math.round(localX / (cellSize + gap))))
    const row = Math.max(0, Math.round(localY / (cellSize + gap)))
    return Math.min(items.length - 1, Math.max(0, row * numCols + col))
  }

  // Compute display order when item at `dragIdx` is shifted to `insertIdx`.
  // Returns an array where result[displayPosition] = originalIndex.
  function computeOrder(dragIdx, insertIdx) {
    const order = items.map((_, i) => i)
    order.splice(dragIdx, 1)
    order.splice(insertIdx, 0, dragIdx)
    return order
  }

  // CSS transform for a non-dragged item to shift it to its new display position
  function shiftTransform(originalIdx, dragIdx, insertIdx) {
    if (originalIdx === dragIdx) return null
    const order = computeOrder(dragIdx, insertIdx)
    const displayIdx = order.indexOf(originalIdx)
    const target = gridPos(displayIdx)
    const current = gridPos(originalIdx)
    const dx = target.x - current.x
    const dy = target.y - current.y
    if (dx === 0 && dy === 0) return null
    return `translate(${dx}px, ${dy}px)`
  }

  // ── Pointer handlers ──────────────────────────────────────────────────────
  function onItemPointerDown(e, index) {
    if (disabled) return
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = {
      index,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      pointerId: e.pointerId,
    }
    // Capture to container so move/up always arrive here
    containerRef.current?.setPointerCapture(e.pointerId)
  }

  function onContainerPointerMove(e) {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const rawDx = e.clientX - d.startX
    const rawDy = e.clientY - d.startY
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy)
    if (!d.moved && dist > MOVE_THRESHOLD) d.moved = true
    if (!d.moved) return
    const scale = getScale()
    const localDx = rawDx / scale
    const localDy = rawDy / scale
    const insertIndex = findInsertIndex(e.clientX, e.clientY)
    setDragState({ index: d.index, insertIndex, dx: localDx, dy: localDy })
  }

  function onContainerPointerUp(e) {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    if (!d.moved) {
      onItemTap?.(d.index)
    } else if (dragState && dragState.index !== dragState.insertIndex) {
      const newItems = [...items]
      const [moved] = newItems.splice(dragState.index, 1)
      newItems.splice(dragState.insertIndex, 0, moved)
      onReorder(newItems)
    }
    dragRef.current = null
    setDragState(null)
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  const numRows = Math.ceil(Math.max(1, items.length) / numCols)
  // Fixed container height prevents collapse when the dragged item "lifts"
  const containerHeight = padTop + numRows * cellSize + (numRows - 1) * gap + padBottom

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', height: containerHeight, overflow: 'visible' }}
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerUp}
      onPointerCancel={onContainerPointerUp}
    >
      {items.map((item, index) => {
        const pos = gridPos(index)
        const isDragged = dragState?.index === index

        const itemStyle = {
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          width: cellSize,
          height: cellSize,
          boxSizing: 'border-box',
          touchAction: 'none',
          userSelect: 'none',
          willChange: 'transform',
        }

        if (isDragged && dragState) {
          itemStyle.transform = `translate(${dragState.dx}px, ${dragState.dy}px)`
          itemStyle.zIndex = 100
          itemStyle.boxShadow = '0 8px 24px rgba(0,0,0,0.22)'
          itemStyle.borderRadius = 8
          itemStyle.opacity = 0.96
          itemStyle.transition = 'none'
          itemStyle.cursor = 'grabbing'
        } else {
          const t = dragState ? shiftTransform(index, dragState.index, dragState.insertIndex) : null
          if (t) itemStyle.transform = t
          itemStyle.transition = 'transform 0.14s ease'
          itemStyle.cursor = disabled ? 'default' : 'grab'
        }

        return (
          <div
            key={item.id ?? index}
            style={itemStyle}
            onPointerDown={disabled ? undefined : e => onItemPointerDown(e, index)}
          >
            {renderItem(item, index, { isDragged: !!isDragged && !!dragState })}
          </div>
        )
      })}
    </div>
  )
}
