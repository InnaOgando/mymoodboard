import { useState, useEffect, useRef } from 'react'
import { uid, openUrl, stableFiles } from '../utils.js'
import { getBoard, getBoards, saveBoard, deleteBoard, getElements, saveElement, deleteElement, exportAllData, importAllData, getStorageUsage } from '../db'
import Canvas from './Canvas'
import DraggableCard from './DraggableCard'
import ImagePicker from './ImagePicker'
import ObjectRenderer, { normalizeType } from './ObjectRenderer'
import { getCollectionItems } from './objects/CollectionObject'
import { processAndUpload, deleteImageIfOrphaned } from '../storage.js'
import { cacheImagesInBackground } from '../ImageImportService'
import homeIcon       from '../assets/home.svg'
import BoardToolbar from './BoardToolbar'
import { PRESET_COLORS, readableTextColor } from '../colors'

const randomColor = () => PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
import ImagePreview from './ImagePreview'
import CollectionGallery from './CollectionGallery'

// ── Viewport-aware placement ──────────────────────────────────────────────────
// Computes the current visible canvas area so new objects always land in view.
// canvasContainerRef and canvasOffsetRef are passed to <Canvas> and written by it.

function makeViewportBounds(containerRef, offsetRef, scaleRef) {
  const container = containerRef.current
  if (!container) return { x: 80, y: 80, w: 800, h: 600 }
  const rect = container.getBoundingClientRect()
  const scale = scaleRef.current || 1
  const { x: ox, y: oy } = offsetRef.current
  return {
    x: -ox / scale,
    y: -oy / scale,
    w: rect.width  / scale,
    h: rect.height / scale,
  }
}

// Scan the current viewport L→R, top-to-bottom and return the first empty slot.
// Never places an object outside the user's visible area.
function findFreePosition(existingElements, childBoards, viewportBounds, objW = 170, objH = 190) {
  const GAP = 20
  const MARGIN = 40

  const allBoxes = [
    ...existingElements.map(el => ({ x: el.x, y: el.y, w: el.w || objW, h: el.h || objH })),
    ...childBoards.map(b => ({ x: b.x, y: b.y, w: 180, h: 150 })),
  ]

  function overlaps(px, py) {
    return allBoxes.some(o =>
      px < o.x + o.w + GAP && px + objW > o.x - GAP &&
      py < o.y + o.h + GAP && py + objH > o.y - GAP
    )
  }

  const startX = viewportBounds.x + MARGIN
  const startY = viewportBounds.y + MARGIN
  const endX   = viewportBounds.x + viewportBounds.w - MARGIN - objW
  const endY   = viewportBounds.y + viewportBounds.h - MARGIN - objH

  let y = startY
  while (y <= endY) {
    let x = startX
    while (x <= endX) {
      if (!overlaps(x, y)) return { x: Math.round(x), y: Math.round(y) }
      x += objW + GAP
    }
    y += objH + GAP
  }

  // Visible area full — keep the SAME reading order (left -> right, top -> bottom)
  // and continue scanning into rows just below the visible area until a truly free
  // slot is found. Never overlaps; the item lands in the next available space
  // beside current work, not a blind vertical stack.
  const MAX_SCAN_Y = startY + 100000
  for (let yy = startY; yy < MAX_SCAN_Y; yy += objH + GAP) {
    for (let xx = startX; xx <= endX; xx += objW + GAP) {
      if (!overlaps(xx, yy)) return { x: Math.round(xx), y: Math.round(yy) }
    }
  }

  // Absolute last resort (should never be reached): just below the lowest box.
  const lowestBottom = allBoxes.reduce((max, o) => Math.max(max, o.y + o.h), startY)
  console.warn('[placement] findFreePosition hard fallback — extended scan exhausted.')
  return { x: Math.round(startX), y: Math.round(lowestBottom + GAP) }
}

export default function BoardScreen({ boardId, boardStack, onOpenBoard, onBack, onHome }) {
  const [board, setBoard] = useState(null)
  const [elements, setElements] = useState([])
  const [childBoards, setChildBoards] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedBoardIds, setSelectedBoardIds] = useState([])
  const [selectedBoardId, setSelectedBoardId] = useState(null)
  const [boardRename, setBoardRename] = useState(false)
  const [boardRenameValue, setBoardRenameValue] = useState('')
  const [boardColorOpen, setBoardColorOpen] = useState(false)

  const [showImagePicker, setShowImagePicker] = useState(false)
  const [dropOverCollectionId, _setDropOverCollectionId] = useState(null)
  const [dropOverBoardId, _setDropOverBoardId] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [undoVisible, setUndoVisible] = useState(false)
  const [storageMsg, setStorageMsg] = useState(null)
  const [previewEl, setPreviewEl] = useState(null)       // image preview modal
  const [galleryEl, setGalleryEl] = useState(null)       // collection gallery modal

  // Ref mirrors for state used inside async callbacks / event handlers
  const elementsRef = useRef([])
  const childBoardsRef = useRef([])
  // Ref for dropOverCollectionId so onTap can read it synchronously (iOS fix)
  const dropOverCollectionRef = useRef(null)
  const dropOverBoardRef = useRef(null)
  // Refs mirror select-mode state for synchronous reads inside drag handlers
  const selectModeRef = useRef(false)
  const selectedIdsRef = useRef([])
  const selectedBoardIdsRef = useRef([])
  const groupDragRef = useRef(null)

  const undoTimer = useRef(null)
  const scaleRef = useRef(1)
  // Collection heights measured from DOM once at drag-start; cleared at drag-end.
  // Avoids repeated DOM queries during continuous pointermove.
  const collectionHeightsCache = useRef({})
  // Exposed to Canvas so we can compute viewport bounds for placement
  const canvasContainerRef = useRef()
  const canvasOffsetRef = useRef({ x: 40, y: 40 })
  const fileRef = useRef()
  const docRef = useRef()
  const importRef = useRef()

  function setDropOverCollectionId(id) {
    dropOverCollectionRef.current = id
    _setDropOverCollectionId(id)
  }

  function setDropOverBoardId(id) {
    dropOverBoardRef.current = id
    _setDropOverBoardId(id)
  }

  useEffect(() => { elementsRef.current = elements }, [elements])
  useEffect(() => { childBoardsRef.current = childBoards }, [childBoards])
  useEffect(() => { selectModeRef.current = selectMode }, [selectMode])
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])
  useEffect(() => { selectedBoardIdsRef.current = selectedBoardIds }, [selectedBoardIds])
  useEffect(() => { load() }, [boardId])

  function getViewport() {
    return makeViewportBounds(canvasContainerRef, canvasOffsetRef, scaleRef)
  }

  // Logs full placement trace and whether the element lands inside the visible screen.
  function logPlacement(source, vp, pos, el) {
    const offset = { ...canvasOffsetRef.current }
    const scale  = scaleRef.current
    const container = canvasContainerRef.current
    const cw = container?.clientWidth  ?? 0
    const ch = container?.clientHeight ?? 0

    // Canvas-to-screen transform: screenX = canvasX * scale + offsetX
    const screenX = el.x * scale + offset.x
    const screenY = el.y * scale + offset.y
    const screenX2 = screenX + (el.w || 150) * scale
    const screenY2 = screenY + (el.h || 150) * scale

    const inViewport = screenX2 > 0 && screenX < cw && screenY2 > 0 && screenY < ch
    const dx = inViewport ? 0 : Math.max(0 - screenX2, screenX - cw, 0)
    const dy = inViewport ? 0 : Math.max(0 - screenY2, screenY - ch, 0)

    console.group(`[placement] ${source}`)
    console.log('canvas state  | offset:', JSON.stringify(offset), '| scale:', scale, '| containerOk:', !!container, `(${cw}×${ch})`)
    console.log('viewport      |', JSON.stringify(vp))
    console.log('findFree →    |', JSON.stringify(pos))
    console.log('stored el     | x:', el.x, 'y:', el.y, '| el matches pos:', el.x === pos.x && el.y === pos.y)
    console.log('screen pos    | top-left:', `(${Math.round(screenX)}, ${Math.round(screenY)})`, '→ bottom-right:', `(${Math.round(screenX2)}, ${Math.round(screenY2)})`)
    console.log('in viewport   |', inViewport, inViewport ? '' : `| dx=${Math.round(dx)} dy=${Math.round(dy)} px outside`)
    console.groupEnd()
  }

  // Shared helper — the single image-from-blob placement path.
  // Captures viewport BEFORE any async work so pan/zoom during upload is irrelevant.
  async function addImageFromBlob(blob, source = 'unknown') {
    // Capture the viewport BEFORE any async work so pan/zoom during upload is irrelevant.
    const vp = getViewport()
    try {
      const usage = await getStorageUsage()
      if (usage.bytes >= usage.limit) {
        setStorageMsg('Storage full (150 MB). Delete images to add more.')
        setTimeout(() => setStorageMsg(null), 6000)
        return
      }
      const meta = await processAndUpload(blob)
      // Find the slot using the image's REAL height so it never overlaps neighbours.
      const dispH = meta.width ? Math.round(150 * meta.height / meta.width) : 150
      const pos = findFreePosition(elementsRef.current, childBoardsRef.current, vp, 150, dispH)
      const el = await addElement('image', pos, meta)
      if (el) logPlacement(source, vp, pos, el)
      const after = await getStorageUsage()
      if (after.ratio >= 0.8) {
        setStorageMsg(`You've used ${Math.round(after.bytes / 1048576)} MB of 150 MB.`)
        setTimeout(() => setStorageMsg(null), 5000)
      }
    } catch (err) {
      console.warn('[placement] addImageFromBlob processAndUpload failed:', err)
      setStorageMsg("That image couldn't be added — try a screenshot of it instead.")
      setTimeout(() => setStorageMsg(null), 8000)
    }
  }

  // Desktop paste (Cmd+V)
  useEffect(() => {
    async function handlePaste(e) {
      const items = Array.from(e.clipboardData?.items || [])
      const imgItem = items.find(i => i.type.startsWith('image/'))
      if (!imgItem) return
      e.preventDefault()
      await addImageFromBlob(imgItem.getAsFile(), 'cmd-v')
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [boardId])

  async function load() {
    const b = await getBoard(boardId)
    setBoard(b)
    const els = await getElements(boardId, {
      onSync: fresh => {
        setElements(fresh)
        cacheImagesInBackground(fresh)
      }
    })
    setElements(els)
    const children = await getBoards(boardId, { onSync: setChildBoards })
    setChildBoards(children)
  }

  async function addElement(type, pos, content = {}, { skipRemote = false } = {}) {
    const IMG_W = 150
    const el = {
      id: uid(),
      boardId,
      type,
      x: pos.x,
      y: pos.y,
      w: type === 'image' ? IMG_W : undefined,
      // Store the real display height (image drawn at IMG_W wide) so placement
      // math knows each image's true footprint and rows never overlap.
      h: type === 'image' && content.width
        ? Math.round(IMG_W * content.height / content.width)
        : undefined,
      content,
      createdAt: Date.now()
    }
    // Sync ref immediately so the next findFreePosition call sees this element
    // (the useEffect that mirrors state→ref only runs after the next render)
    elementsRef.current = [...elementsRef.current, el]
    setElements(prev => [...prev, el])
    const editableTypes = ['idea', 'text', 'note', 'link', 'todo']
    if (editableTypes.includes(type)) setEditingId(el.id)
    saveElement(el, { skipRemote }).catch(e => console.error('[addElement] saveElement failed:', e))
    return el
  }

  async function moveElement(id, x, y) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, x, y } : el))
    const el = elementsRef.current.find(e => e.id === id)
    if (el) await saveElement({ ...el, x, y })
  }

  async function moveChildBoard(id, x, y) {
    setChildBoards(prev => prev.map(b => b.id === id ? { ...b, x, y } : b))
    const b = childBoardsRef.current.find(c => c.id === id)
    if (b) await saveBoard({ ...b, x, y })
  }

  async function updateContent(id, content) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, content } : el))
    const el = elementsRef.current.find(e => e.id === id)
    if (el) await saveElement({ ...el, content })
  }

  async function removeElement(id) {
    const el = elementsRef.current.find(e => e.id === id)
    setElements(prev => prev.filter(e => e.id !== id))
    setSelectedId(null)
    // Show undo toast immediately — before any async work so it's never blocked
    if (el) {
      setUndoStack(prev => [...prev.slice(-19), el])
      setUndoVisible(true)
      clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setUndoVisible(false), 5000)
    }
    await deleteElement(id).catch(e => console.warn('[db] deleteElement error:', e))
    if (el?.type === 'image' && el.content?.src?.startsWith('http')) {
      deleteImageIfOrphaned(el.content.src, id)
    }
  }

  async function undo() {
    const el = undoStack[undoStack.length - 1]
    if (!el) return
    setElements(prev => [...prev, el])
    setUndoStack(prev => prev.slice(0, -1))
    if (undoStack.length <= 1) setUndoVisible(false)
    saveElement(el).catch(e => console.error('[undo] saveElement failed:', e))
  }

  async function resizeElement(id, w, h) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, w, h } : el))
    const el = elementsRef.current.find(e => e.id === id)
    if (el) await saveElement({ ...el, w, h })
  }

  // ── Collection operations ───────────────────────────────────────────────────

  async function makeCollection(objectEl) {
    try {
      const items = [{ id: uid(), type: objectEl.type, content: objectEl.content, w: objectEl.w, h: objectEl.h }]
      const col = {
        id: uid(), boardId, type: 'collection',
        x: objectEl.x, y: objectEl.y,
        w: Math.max(objectEl.w || 260, 260),
        content: { items },
        createdAt: Date.now()
      }
      setElements(prev => [...prev.filter(e => e.id !== objectEl.id), col])
      setSelectedId(null)
      deleteElement(objectEl.id).catch(e => console.error('[makeCollection] deleteElement failed:', e))
      saveElement(col).catch(e => console.error('[makeCollection] saveElement failed:', e))
    } catch (err) { console.error('makeCollection failed', err) }
  }

  async function ejectFromCollection(colId, itemId) {
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    const items = getCollectionItems(col.content)
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const remaining = items.filter(i => i.id !== itemId)

    const ejW = item.w || 150
    const ejH = item.h || 170
    const ejectPos = findFreePosition(
      elementsRef.current.filter(e => e.id !== colId),
      childBoardsRef.current,
      getViewport(),
      ejW, ejH
    )
    const ejected = {
      id: uid(), boardId, type: item.type,
      x: ejectPos.x, y: ejectPos.y,
      w: ejW, h: item.h,
      content: item.content,
      createdAt: Date.now()
    }

    if (remaining.length === 0) {
      setElements(prev => prev.filter(e => e.id !== colId).concat(ejected))
      deleteElement(colId).catch(e => console.error('[eject] deleteElement failed:', e))
    } else {
      const updated = { ...col, content: { ...col.content, items: remaining } }
      setElements(prev => prev.map(e => e.id === colId ? updated : e).concat(ejected))
      saveElement(updated).catch(e => console.error('[eject] saveElement(col) failed:', e))
    }
    saveElement(ejected).catch(e => console.error('[eject] saveElement(ejected) failed:', e))
    setSelectedId(ejected.id)
  }

  // ── Lock / Copy / Cut / Paste / Duplicate ──────────────────────────────────

  function toggleLock(id) {
    const el = elementsRef.current.find(e => e.id === id)
    if (!el) return
    const updated = { ...el, locked: !el.locked }
    setElements(prev => prev.map(e => e.id === id ? updated : e))
    saveElement(updated).catch(e => console.error('[toggleLock]', e))
  }

  async function duplicateElement(el) {
    const vp = getViewport()
    const pos = findFreePosition(elementsRef.current, childBoardsRef.current, vp, el.w || 150, el.h || 150)
    const dup = { ...el, id: uid(), x: pos.x, y: pos.y, createdAt: Date.now() }
    if (dup.type === 'collection') {
      dup.content = { ...dup.content, items: (dup.content.items || []).map(item => ({ ...item, id: uid() })) }
    }
    elementsRef.current = [...elementsRef.current, dup]
    setElements(prev => [...prev, dup])
    setSelectedId(dup.id)
    saveElement(dup).catch(e => console.error('[duplicate]', e))
    logPlacement('duplicate', vp, pos, dup)
  }


  function setElementCaption(id, caption) {
    const el = elementsRef.current.find(e => e.id === id)
    if (!el) return
    const updated = { ...el, content: { ...el.content, caption } }
    setElements(prev => prev.map(e => e.id === id ? updated : e))
    saveElement(updated).catch(e => console.error('[caption]', e))
  }

  function setElementBgColor(id, bgColor) {
    const el = elementsRef.current.find(e => e.id === id)
    if (!el) return
    const updated = { ...el, content: { ...el.content, bgColor } }
    setElements(prev => prev.map(e => e.id === id ? updated : e))
    saveElement(updated).catch(e => console.error('[bgColor]', e))
  }

  function setTodoTitle(id, title) {
    const el = elementsRef.current.find(e => e.id === id)
    if (!el) return
    const updated = { ...el, content: { ...el.content, title } }
    setElements(prev => prev.map(e => e.id === id ? updated : e))
    saveElement(updated).catch(e => console.error('[todoTitle]', e))
  }

  function renameCollection(id) {
    const col = elementsRef.current.find(e => e.id === id)
    if (!col) return
    const next = prompt('Collection name:', col.content.name || 'Collection')
    if (next !== null) updateContent(id, { ...col.content, name: next.trim() || 'Collection' })
  }

  function setCollectionColor(id, color) {
    const col = elementsRef.current.find(e => e.id === id)
    if (!col) return
    updateContent(id, { ...col.content, color: color ?? undefined })
  }

  // Drop a canvas element into a collection (shared logic for drag-end and tap-fallback)
  async function dropIntoCollection(objectEl, colId) {
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) {
      console.warn('[drop] collection not found in elementsRef:', colId, elementsRef.current.map(e => e.id))
      return
    }
    try {
      const items = getCollectionItems(col.content)
      const newItem = { id: uid(), type: objectEl.type, content: objectEl.content, w: objectEl.w, h: objectEl.h }
      const updated = { ...col, content: { items: [...items, newItem] } }
      // Update UI immediately — do not await DB before showing the change
      setElements(prev => prev.filter(e => e.id !== objectEl.id).map(e => e.id === colId ? updated : e))
      setSelectedId(colId)
      saveElement(updated).catch(e => console.error('[drop] saveElement failed:', e))
      deleteElement(objectEl.id).catch(e => console.error('[drop] deleteElement failed:', e))
    } catch (err) {
      console.error('[drop] dropIntoCollection failed:', err)
    }
  }

  // ── Drag & Drop (canvas ↔ collection) ──────────────────────────────────────

  function buildCollectionHeightsCache() {
    const cache = {}
    const cols = elementsRef.current.filter(e => e.type === 'collection' || e.type === 'column')
    for (const col of cols) {
      const domEl = document.querySelector(`[data-el-id="${col.id}"]`)
      if (domEl) cache[col.id] = domEl.clientHeight
    }
    collectionHeightsCache.current = cache
  }

  function hitTestCollection(cx, cy) {
    const MARGIN = 20
    const cols = elementsRef.current.filter(e => e.type === 'collection' || e.type === 'column')
    for (const col of cols) {
      const colW = col.w || 260
      const colH = collectionHeightsCache.current[col.id] ?? 200
      if (
        cx >= col.x - MARGIN && cx <= col.x + colW + MARGIN &&
        cy >= col.y - MARGIN && cy <= col.y + colH + MARGIN
      ) {
        return col.id
      }
    }
    return null
  }

  function hitTestChildBoard(cx, cy) {
    const MARGIN = 20
    const BW = 180, BH = 150
    for (const b of childBoardsRef.current) {
      if (
        cx >= b.x - MARGIN && cx <= b.x + BW + MARGIN &&
        cy >= b.y - MARGIN && cy <= b.y + BH + MARGIN
      ) {
        return b.id
      }
    }
    return null
  }

  function handleObjectDragStart(item) {
    buildCollectionHeightsCache()
    const isBoard = !!item.isBoard
    const anchorSelected = isBoard
      ? selectedBoardIdsRef.current.includes(item.id)
      : selectedIdsRef.current.includes(item.id)
    // Select mode: if dragging a selected item, snapshot the whole group's start
    // positions (objects AND boards) so they all move together by the same delta.
    if (selectModeRef.current && anchorSelected) {
      const starts = {}
      for (const it of elementsRef.current) {
        if (selectedIdsRef.current.includes(it.id)) starts[it.id] = { x: it.x, y: it.y, isBoard: false }
      }
      for (const b of childBoardsRef.current) {
        if (selectedBoardIdsRef.current.includes(b.id)) starts[b.id] = { x: b.x, y: b.y, isBoard: true }
      }
      groupDragRef.current = {
        anchorId: item.id,
        anchor: { x: item.x, y: item.y },
        starts,
        hasBoards: selectedBoardIdsRef.current.length > 0,
      }
    } else {
      groupDragRef.current = null
    }
  }

  function handleObjectDragMove(item, nx, ny) {
    const isBoard = !!item.isBoard
    const isCol = !isBoard && normalizeType(item.type) === 'collection'
    // Move the rest of the selected group (objects AND boards) by the same delta.
    const g = groupDragRef.current
    if (g && g.anchorId === item.id) {
      const dx = nx - g.anchor.x
      const dy = ny - g.anchor.y
      setElements(prev => prev.map(el => {
        if (el.id === item.id) return el
        const st = g.starts[el.id]
        return (st && !st.isBoard) ? { ...el, x: st.x + dx, y: st.y + dy } : el
      }))
      setChildBoards(prev => prev.map(b => {
        if (b.id === item.id) return b
        const st = g.starts[b.id]
        return (st && st.isBoard) ? { ...b, x: st.x + dx, y: st.y + dy } : b
      }))
    }
    // Collection/board drop targets: only for an element anchor whose group has
    // no boards (boards can't be dropped into a collection).
    if (isBoard || (g && g.hasBoards)) {
      setDropOverCollectionId(null)
      setDropOverBoardId(null)
      return
    }
    const cx = nx + (item.w || 150) / 2
    const cy = ny + (item.h || 150) / 2
    const colId = isCol ? null : hitTestCollection(cx, cy)
    setDropOverCollectionId(colId && colId !== item.id ? colId : null)
    const boardHit = colId ? null : hitTestChildBoard(cx, cy)
    setDropOverBoardId(boardHit)
  }

  async function handleObjectDragEnd(item, nx, ny) {
    setDropOverCollectionId(null)
    setDropOverBoardId(null)
    const g = groupDragRef.current
    const isBoard = !!item.isBoard
    const isCol = !isBoard && normalizeType(item.type) === 'collection'
    collectionHeightsCache.current = {}

    // Group drag (select mode): the dragged item is part of the selection.
    if (g && g.anchorId === item.id) {
      groupDragRef.current = null
      // Collection/board drop only for a pure-object group with an object anchor.
      if (!isBoard && !g.hasBoards) {
        const cx = nx + (item.w || 150) / 2
        const cy = ny + (item.h || 150) / 2
        const colId = isCol ? null : hitTestCollection(cx, cy)
        const boardHit = colId ? null : hitTestChildBoard(cx, cy)
        if (colId && colId !== item.id) { await dropSelectedIntoCollection(colId); return }
        if (boardHit) { await dropSelectedIntoBoard(boardHit); return }
      }
      // Otherwise tidy the whole selection (objects + boards) into a grid.
      arrangeSelectedIntoGrid(nx, ny, g)
      return
    }

    // Single (non-group) object drag → drop into collection/board.
    if (!isBoard) {
      const cx = nx + (item.w || 150) / 2
      const cy = ny + (item.h || 150) / 2
      const colId = isCol ? null : hitTestCollection(cx, cy)
      const boardHit = colId ? null : hitTestChildBoard(cx, cy)
      if (colId && colId !== item.id) { await dropIntoCollection(item, colId); return }
      if (boardHit) { await dropIntoBoard(item, boardHit); return }
    }
  }

  // ── Multi-select (select mode) ──────────────────────────────────────────────
  function enterSelectMode() {
    setSelectMode(true)
    setSelectedIds([])
    setSelectedBoardIds([])
    setSelectedId(null)
    setEditingId(null)
    setSelectedBoardId(null)
  }
  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds([])
    setSelectedBoardIds([])
  }
  function toggleSelectId(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleSelectBoardId(id) {
    setSelectedBoardIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  async function deleteSelected() {
    const ids = [...selectedIdsRef.current]
    const bids = [...selectedBoardIdsRef.current]
    if (bids.length && !confirm(`Delete ${bids.length} board(s) and everything inside?`)) return
    setSelectedIds([])
    setSelectedBoardIds([])
    for (const id of ids) await removeElement(id)
    for (const id of bids) {
      setChildBoards(prev => prev.filter(b => b.id !== id))
      deleteBoard(id).catch(e => console.error('[deleteSelected] deleteBoard failed:', e))
    }
  }
  async function dropSelectedIntoCollection(colId) {
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    const ids = selectedIdsRef.current.filter(id => id !== colId)
    const movers = elementsRef.current.filter(e => ids.includes(e.id) && normalizeType(e.type) !== 'collection')
    if (!movers.length) return
    const items = getCollectionItems(col.content)
    const newItems = movers.map(m => ({ id: uid(), type: m.type, content: m.content, w: m.w, h: m.h }))
    const updated = { ...col, content: { items: [...items, ...newItems] } }
    const moverIds = new Set(movers.map(m => m.id))
    setElements(prev => prev.filter(e => !moverIds.has(e.id)).map(e => e.id === colId ? updated : e))
    setSelectedId(colId)
    saveElement(updated).catch(e => console.error('[drop-many] saveElement failed:', e))
    movers.forEach(m => deleteElement(m.id).catch(e => console.error('[drop-many] deleteElement failed:', e)))
    exitSelectMode()
  }

  // Move a single object into a nested (child) board by reassigning its boardId.
  async function dropIntoBoard(objectEl, targetBoardId) {
    if (!targetBoardId || targetBoardId === boardId) return
    setElements(prev => prev.filter(e => e.id !== objectEl.id))
    setSelectedId(null)
    saveElement({ ...objectEl, boardId: targetBoardId })
      .catch(e => console.error('[drop-board] saveElement failed:', e))
  }

  // Move all selected objects into a nested (child) board.
  async function dropSelectedIntoBoard(targetBoardId) {
    if (!targetBoardId || targetBoardId === boardId) return
    const ids = selectedIdsRef.current
    const movers = elementsRef.current.filter(e => ids.includes(e.id))
    if (!movers.length) return
    const moverIds = new Set(movers.map(m => m.id))
    setElements(prev => prev.filter(e => !moverIds.has(e.id)))
    movers.forEach(m => saveElement({ ...m, boardId: targetBoardId })
      .catch(e => console.error('[drop-board-many] saveElement failed:', e)))
    exitSelectMode()
  }

  // Tidy the selected objects into a 3-column grid, anchored at the group's
  // current (dragged) top-left. Triggered when the selection is dropped on
  // empty canvas — turns a scattered pile into an organized block.
  function arrangeSelectedIntoGrid(anchorNx, anchorNy, g) {
    const COLS = 3
    const GAP = 24
    const elIds = selectedIdsRef.current
    const bdIds = selectedBoardIdsRef.current
    const all = [
      ...elementsRef.current.filter(e => elIds.includes(e.id)).map(m => ({ ref: m, isBoard: false, w: m.w || 150, h: m.h || 150 })),
      ...childBoardsRef.current.filter(b => bdIds.includes(b.id)).map(b => ({ ref: b, isBoard: true, w: 180, h: 150 })),
    ]
    if (!all.length) return
    const dx = anchorNx - g.anchor.x
    const dy = anchorNy - g.anchor.y
    // Single item: nothing to tidy — just persist its move.
    if (all.length < 2) {
      const only = all[0]
      const st = g.starts[only.ref.id]
      if (st) {
        const moved = { ...only.ref, x: st.x + dx, y: st.y + dy }
        if (only.isBoard) saveBoard(moved).catch(e => console.error('[arrange] saveBoard failed:', e))
        else saveElement(moved).catch(e => console.error('[arrange] saveElement failed:', e))
      }
      return
    }
    // Order by current (dragged) reading order: top-to-bottom, left-to-right.
    const withPos = all.map(m => {
      const st = g.starts[m.ref.id]
      return { ...m, cx: st ? st.x + dx : m.ref.x, cy: st ? st.y + dy : m.ref.y }
    })
    withPos.sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx))
    const cellW = Math.max(...all.map(m => m.w)) + GAP
    const cellH = Math.max(...all.map(m => m.h)) + GAP
    const originX = Math.min(...withPos.map(p => p.cx))
    const originY = Math.min(...withPos.map(p => p.cy))
    const updEls = [], updBds = []
    withPos.forEach((p, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const moved = { ...p.ref, x: originX + col * cellW, y: originY + row * cellH }
      if (p.isBoard) updBds.push(moved); else updEls.push(moved)
    })
    if (updEls.length) {
      const byId = new Map(updEls.map(u => [u.id, u]))
      setElements(prev => prev.map(e => byId.get(e.id) || e))
      updEls.forEach(u => saveElement(u).catch(e => console.error('[arrange] saveElement failed:', e)))
    }
    if (updBds.length) {
      const byId = new Map(updBds.map(u => [u.id, u]))
      setChildBoards(prev => prev.map(b => byId.get(b.id) || b))
      updBds.forEach(u => saveBoard(u).catch(e => console.error('[arrange] saveBoard failed:', e)))
    }
    setSelectedIds([])
    setSelectedBoardIds([])
  }

  async function removeChildBoard(id) {
    if (!confirm('Delete this board and everything in it?')) return
    setChildBoards(prev => prev.filter(b => b.id !== id))
    deleteBoard(id).catch(e => console.error('[removeChildBoard] deleteBoard failed:', e))
  }

  function renameChildBoard(id, name) {
    if (!name.trim()) return
    const b = childBoardsRef.current.find(c => c.id === id)
    if (!b) return
    const updated = { ...b, name: name.trim() }
    setChildBoards(prev => prev.map(c => c.id === id ? updated : c))
    saveBoard(updated).catch(e => console.error('[renameChildBoard] saveBoard failed:', e))
  }

  function changeChildBoardColor(id, color) {
    const b = childBoardsRef.current.find(c => c.id === id)
    if (!b) return
    const updated = { ...b, color }
    setChildBoards(prev => prev.map(c => c.id === id ? updated : c))
    saveBoard(updated).catch(e => console.error('[changeChildBoardColor] saveBoard failed:', e))
  }

  // Open/act on an object. Triggered by double-tap OR by tapping an already-
  // selected object (reliable on touch — same pattern as boards).
  function activateElement(el) {
    if (el.locked) return
    const type = normalizeType(el.type)
    if (type === 'image') setPreviewEl(el)
    else if (type === 'collection') setGalleryEl(el)
    else if (type === 'link') openUrl(el.content?.url?.trim())
    else if (['idea', 'text', 'note', 'todo'].includes(type)) setEditingId(el.id)
  }

  async function handleNavAction(type) {
    const vp = getViewport()
    if (type === 'image') {
      setShowImagePicker(true)
    } else if (type === 'board') {
      const name = prompt('Board name:')
      if (!name) return
      const bPos = findFreePosition(elementsRef.current, childBoardsRef.current, vp, 148, 130)
      const newBoard = {
        id: uid(), parentId: boardId, name: name.trim(),
        color: randomColor(),
        x: bPos.x, y: bPos.y, createdAt: Date.now()
      }
      setChildBoards(prev => [...prev, newBoard])
      saveBoard(newBoard).catch(e => console.error('[handleNavAction] saveBoard failed:', e))
    } else if (type === 'document') {
      docRef.current.click()
    } else if (type === 'palette') {
      const freePos = findFreePosition(elementsRef.current, childBoardsRef.current, vp, 200, 90)
      await addElement('palette', freePos, {
        colors: [randomColor()]
      })
    } else {
      const freePos = findFreePosition(elementsRef.current, childBoardsRef.current, vp)
      await addElement(type, freePos)
    }
  }

  async function handleFiles(files) {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    const docs = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.match(/\.(doc|docx)$/i))
    console.log('[placement] handleFiles imgs=' + imgs.length + ' docs=' + docs.length)
    const vp = getViewport()

    // ── Bulk image layout ──────────────────────────────────────────────────
    // A COMPACT 3-column band that fills the VISIBLE empty space first, then,
    // when it can't grow down (blocked by existing content), RELOCATES to the
    // RIGHT — a fresh 3-column band just past the occupied columns, resuming at
    // the same start row — and grows downward there. Reading order (left→right,
    // then next row down). Keeps real proportions. Never overlaps.
    const IMG_W = 150
    const GAP = 20
    const MARGIN = 40
    const BULK_COLS = 3            // band is always this many columns wide
    const colStep = IMG_W + GAP

    // Obstacles: everything already on the board.
    const boxes = [
      ...elementsRef.current.map(el => ({ x: el.x, y: el.y, w: el.w || IMG_W, h: el.h || IMG_W })),
      ...childBoardsRef.current.map(b => ({ x: b.x, y: b.y, w: 148, h: 130 })),
    ]

    // Does a row of `hs` heights placed at (left, top) hit any obstacle?
    const rowOverlap = (left, top, hs) => {
      for (let k = 0; k < hs.length; k++) {
        const x = left + k * colStep, h = hs[k]
        for (const o of boxes) {
          if (x < o.x + o.w + GAP && x + IMG_W > o.x - GAP &&
              top < o.y + o.h + GAP && top + h > o.y - GAP) return true
        }
      }
      return false
    }
    // First band X to the right where a row at `top` is free (past occupied columns).
    const nextBandRight = (left, top, hs) => {
      let L = left, g = 0
      do { L += colStep; g++; if (g > 1000) break } while (rowOverlap(L, top, hs))
      return L
    }

    // First free Y at/below `from` for a band at `left` (jumps below obstacles).
    // The band may extend past the right edge of the screen — only the first
    // column needs to be in view — so this works even on a narrow phone where a
    // full 3-column band is wider than the visible width.
    const firstFreeY = (left, from, hs) => {
      let y = from, moved = true, g = 0
      while (moved) {
        moved = false
        for (const o of boxes) {
          for (let k = 0; k < hs.length; k++) {
            const cx = left + k * colStep, h = hs[k]
            if (cx < o.x + o.w + GAP && cx + IMG_W > o.x - GAP &&
                y < o.y + o.h + GAP && y + h > o.y - GAP) { y = o.y + o.h + GAP; moved = true }
          }
        }
        if (++g > 10000) break
      }
      return y
    }

    const preUsage = await getStorageUsage()
    if (preUsage.bytes >= preUsage.limit) {
      setStorageMsg('Storage full (150 MB). Delete images to add more.')
      setTimeout(() => setStorageMsg(null), 6000)
      return
    }

    // Optimise all images first so we know every real height before laying out.
    const metas = []
    for (const img of imgs) {
      try { metas.push(await processAndUpload(img)) }
      catch (err) { console.warn('[placement] handleFiles processAndUpload failed:', err); metas.push(null) }
    }
    const good = metas.filter(Boolean)
    const failedCount = imgs.length - good.length
    if (failedCount > 0) {
      setStorageMsg(`${failedCount} image${failedCount > 1 ? 's' : ''} couldn't be added — try adding a screenshot of ${failedCount > 1 ? 'them' : 'it'} instead.`)
      setTimeout(() => setStorageMsg(null), 8000)
    }
    const heights = good.map(m => (m.width ? Math.round(IMG_W * m.height / m.width) : IMG_W))
    if (good.length === 0) return

    // Group images into rows of BULK_COLS.
    const rows = []
    for (let k = 0; k < heights.length; k += BULK_COLS) rows.push(heights.slice(k, k + BULK_COLS))

    // ANCHOR: read the VISIBLE viewport and drop the band into the HIGHEST free
    // spot in view (reading order: top rows first, then leftmost). We test every
    // band-left column whose first column is on screen and pick the one whose
    // first row is free nearest the top. The band itself may run past the right
    // edge — that is fine and expected. Only when the visible columns are full
    // does the free spot land just below the content in view (never the far
    // bottom of the whole canvas).
    const visLeft = vp.x + MARGIN
    const visTop = vp.y + MARGIN
    const visRight = vp.x + vp.w - MARGIN
    const probeRow = rows[0]

    const candidateXs = []
    for (let x = visLeft; x <= Math.max(visLeft, visRight - IMG_W); x += colStep) candidateXs.push(x)
    if (candidateXs.length === 0) candidateXs.push(visLeft)

    let bandLeft = candidateXs[0]
    let startRowTop = firstFreeY(candidateXs[0], visTop, probeRow)
    for (const x of candidateXs) {
      const y = firstFreeY(x, visTop, probeRow)
      if (y < startRowTop) { startRowTop = y; bandLeft = x }
    }

    const placements = []              // { x, y } per image, in original order
    let rowTop = startRowTop
    let r = 0, guard = 0
    while (r < rows.length) {
      const hs = rows[r]
      const rowH = Math.max(...hs)
      if (rowOverlap(bandLeft, rowTop, hs)) {
        // Can't grow down here -> relocate the band to the RIGHT, just past the
        // occupied columns, back at the start row; then keep growing down.
        bandLeft = nextBandRight(bandLeft, startRowTop, hs)
        rowTop = startRowTop
        if (++guard > 100000) break
        continue
      }
      for (let k = 0; k < hs.length; k++) {
        const x = bandLeft + k * colStep
        placements.push({ x: Math.round(x), y: Math.round(rowTop) })
        boxes.push({ x, y: rowTop, w: IMG_W, h: hs[k] })
      }
      rowTop += rowH + GAP
      r++
    }

    // Create the elements at their computed positions.
    for (let k = 0; k < good.length; k++) {
      const pos = placements[k]
      if (!pos) continue
      const el = await addElement('image', pos, good[k])
      if (el) logPlacement('Photos/file-picker', vp, pos, el)
    }

    for (const f of docs) {
      const pos = findFreePosition(elementsRef.current, childBoardsRef.current, vp)
      await addElement('document', pos, { name: f.name, type: f.type, src: await fileToBase64(f) })
    }
  }

  async function pasteFromClipboard() {
    const notify = (m) => { setStorageMsg(m); setTimeout(() => setStorageMsg(null), 3000) }
    if (location.protocol === 'https:' && navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'))
          if (imageType) {
            const blob = await item.getType(imageType)
            await addImageFromBlob(blob, 'screenshot-btn')
            return
          }
        }
        notify('No image in clipboard. Copy a screenshot first.')
      } catch (err) {
        notify('Could not read the clipboard.')
      }
      return
    }
    notify('Clipboard not available on this browser.')
  }

  async function handleExport() {
    const data = await exportAllData()
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `refmemo-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      await importAllData(data)
      await load()
      alert('Backup restored!')
    } catch { alert('Invalid file.') }
    e.target.value = ''
  }

  if (!board) return null

  return (
    <div className="screen">
      <header className="top-bar">
        <button className="home-btn" onClick={onHome} title="Home">
          <img src={homeIcon} alt="home" style={{ width: 20, height: 20, objectFit: 'contain' }} />
        </button>
        <span className="board-title">{board.name}</span>
        {boardStack.length > 1 ? (
          <button className="back-btn" onClick={onBack} title="Back">‹</button>
        ) : (
          <span className="top-bar-spacer" />
        )}
      </header>

      <Canvas
        onClick={() => {
          // Tap on empty canvas closes select mode (native feel) instead of forcing Cancel
          if (selectMode) { exitSelectMode(); return }
          setSelectedId(null); setEditingId(null); setSelectedBoardId(null)
        }}
        scaleRef={scaleRef}
        offsetRef={canvasOffsetRef}
        containerRef={canvasContainerRef}
      >

        {childBoards.map(b => (
          <DraggableCard key={b.id} x={b.x} y={b.y} scaleRef={scaleRef}
            alwaysDraggable
            selected={selectMode ? selectedBoardIds.includes(b.id) : selectedBoardId === b.id}
            checked={selectMode && selectedBoardIds.includes(b.id)}
            onMove={(x, y) => moveChildBoard(b.id, x, y)}
            onDragStart={() => handleObjectDragStart({ id: b.id, x: b.x, y: b.y, isBoard: true })}
            onDragMove={(nx, ny) => handleObjectDragMove({ id: b.id, x: b.x, y: b.y, isBoard: true }, nx, ny)}
            onDragEnd={(nx, ny) => handleObjectDragEnd({ id: b.id, x: b.x, y: b.y, isBoard: true }, nx, ny)}
            onTap={() => {
              if (selectMode) { toggleSelectBoardId(b.id); return }
              if (selectedBoardId === b.id) onOpenBoard(b.id)
              else { setSelectedBoardId(b.id); setSelectedId(null); setEditingId(null) }
            }}
          >
            <div
              className={`board-icon-card board-icon-card--child ${(selectMode ? selectedBoardIds.includes(b.id) : selectedBoardId === b.id) ? 'selected' : ''} ${dropOverBoardId === b.id ? 'drop-target' : ''}`}
              style={{ background: b.color || '#b3b8c0', color: readableTextColor(b.color || '#b3b8c0') }}
            >
              <div className="board-icon-name">{b.name}</div>
            </div>
          </DraggableCard>
        ))}

        {elements.map(el => (
          <DraggableCard key={el.id} elId={el.id} x={el.x} y={el.y} scaleRef={scaleRef}
            selected={selectMode ? selectedIds.includes(el.id) : selectedId === el.id}
            checked={selectMode && selectedIds.includes(el.id)}
            locked={!!el.locked}
            onMove={(x, y) => moveElement(el.id, x, y)}
            onDragStart={() => handleObjectDragStart(el)}
            onDragMove={(nx, ny) => handleObjectDragMove(el, nx, ny)}
            onDragEnd={(nx, ny) => handleObjectDragEnd(el, nx, ny)}
            onTap={() => {
              // Select mode: tap toggles multi-selection instead of opening.
              if (selectMode) { toggleSelectId(el.id); return }
              // iOS short-drag fix: complete a pending drop onto a child board.
              const pendingBoardId = dropOverBoardRef.current
              if (pendingBoardId) {
                setDropOverBoardId(null)
                dropIntoBoard(el, pendingBoardId)
                return
              }
              // iOS short-drag fix: if we were hovering a collection during this
              // pointer interaction (detected via ref), complete the drop now.
              const pendingColId = dropOverCollectionRef.current
              if (pendingColId && normalizeType(el.type) !== 'collection') {
                setDropOverCollectionId(null)
                dropIntoCollection(el, pendingColId)
                return
              }
              // Tap to select; tap again on the already-selected object opens it
              // (reliable on touch). Double-tap below also works.
              if (selectedId === el.id) {
                activateElement(el)
              } else {
                setSelectedId(el.id)
                setEditingId(null)
                setSelectedBoardId(null)
              }
            }}
            onDoubleTap={() => { if (!selectMode) activateElement(el) }}
          >
            <ObjectRenderer
              el={el}
              selected={selectedId === el.id}
              editing={editingId === el.id}
              onUpdate={content => updateContent(el.id, content)}
              onDelete={() => removeElement(el.id)}
              onStopEdit={() => setEditingId(null)}
              onEdit={() => setEditingId(el.id)}
              onResize={(w, h) => resizeElement(el.id, w, h)}
              onMakeCollection={() => makeCollection(el)}
              onEjectItem={itemId => ejectFromCollection(el.id, itemId)}
              isDropTarget={dropOverCollectionId === el.id}
              scaleRef={scaleRef}
            />
          </DraggableCard>
        ))}
      </Canvas>

      {/* Board management bar when a child board is selected; else the object toolbar */}
      {selectedBoardId ? (
        <div className="bottom-bar board-bottom" onPointerDown={e => e.stopPropagation()}>
          <div className="bottom-nav" style={{ justifyContent: 'space-around' }}>
            <button className="nav-btn" onClick={() => { const b = childBoards.find(c => c.id === selectedBoardId); setBoardRenameValue(b?.name || ''); setBoardRename(true) }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>✎</span>
              <span className="nav-label">Rename</span>
            </button>
            <button className="nav-btn" onClick={() => setBoardColorOpen(true)}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>🎨</span>
              <span className="nav-label">Color</span>
            </button>
            <button className="nav-btn" onClick={() => { removeChildBoard(selectedBoardId); setSelectedBoardId(null) }}>
              <span style={{ fontSize: 18, lineHeight: 1, color: '#e05555' }}>×</span>
              <span className="nav-label">Delete</span>
            </button>
          </div>
        </div>
      ) : (() => {
        const selEl  = selectedId ? elements.find(e => e.id === selectedId) : null
        const selType = selEl ? normalizeType(selEl.type) : null
        return (
          <BoardToolbar
            key={selectedId || 'create'}
            selectedEl={selEl}
            selectedType={selType}
            selectMode={selectMode}
            selectedCount={selectedIds.length + selectedBoardIds.length}
            onEnterSelect={enterSelectMode}
            onExitSelect={exitSelectMode}
            onDeleteSelected={deleteSelected}
            onAction={handleNavAction}
            onDelete={() => removeElement(selectedId)}
            onLock={() => toggleLock(selectedId)}
            onGroup={() => { if (selEl) makeCollection(selEl) }}
            onDuplicate={() => { if (selEl) duplicateElement(selEl) }}
            onCaption={caption => setElementCaption(selectedId, caption)}
            onBgColor={color => setElementBgColor(selectedId, color)}
            onAddTitle={title => setTodoTitle(selectedId, title)}
            onEdit={() => setEditingId(selectedId)}
            onRename={() => renameCollection(selectedId)}
            onColor={color => setCollectionColor(selectedId, color)}
          />
        )
      })()}

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={async e => { const files = await stableFiles(Array.from(e.target.files)); e.target.value = ''; handleFiles(files) }} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx" multiple style={{ display: 'none' }}
        onChange={async e => { const files = await stableFiles(Array.from(e.target.files)); e.target.value = ''; handleFiles(files) }} />
      <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />

      {showImagePicker && (
        <ImagePicker
          onFiles={files => { setShowImagePicker(false); handleFiles(files) }}
          onPaste={() => { setShowImagePicker(false); pasteFromClipboard() }}
          onClose={() => setShowImagePicker(false)}
        />
      )}

      {boardRename && (() => {
        const sb = childBoards.find(b => b.id === selectedBoardId)
        if (!sb) return null
        return (
          <div className="modal-overlay" onClick={() => setBoardRename(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>Rename Board</h3>
              <form onSubmit={e => { e.preventDefault(); renameChildBoard(selectedBoardId, boardRenameValue); setBoardRename(false) }}>
                <input autoFocus className="text-input" value={boardRenameValue} onChange={e => setBoardRenameValue(e.target.value)} />
                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="btn-ghost" onClick={() => setBoardRename(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">Save</button>
                </div>
              </form>
            </div>
          </div>
        )
      })()}

      {boardColorOpen && (() => {
        const sb = childBoards.find(b => b.id === selectedBoardId)
        if (!sb) return null
        return (
          <div className="modal-overlay" onClick={() => setBoardColorOpen(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>Board Color</h3>
              <div className="board-color-swatches" style={{ justifyContent: 'center', padding: '12px 0' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} className="board-swatch"
                    style={{ background: c, outline: sb.color === c ? '3px solid #333' : 'none', outlineOffset: 2, width: 32, height: 32 }}
                    onClick={() => { changeChildBoardColor(selectedBoardId, c); setBoardColorOpen(false) }} />
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {undoVisible && (
        <div className="undo-toast">
          <span>Item deleted</span>
          <button className="undo-btn" onClick={undo}>Undo</button>
          <button className="undo-close" onPointerDown={e => e.stopPropagation()} onClick={() => setUndoVisible(false)}>×</button>
        </div>
      )}

      {storageMsg && (
        <div className="undo-toast">
          <span>{storageMsg}</span>
          <button className="undo-close" onPointerDown={e => e.stopPropagation()} onClick={() => setStorageMsg(null)}>×</button>
        </div>
      )}

      {/* Image Preview modal */}
      {previewEl && (
        <ImagePreview el={previewEl} onClose={() => setPreviewEl(null)} />
      )}

      {/* Collection Gallery modal */}
      {galleryEl && (
        <CollectionGallery el={galleryEl} onClose={() => setGalleryEl(null)} />
      )}
    </div>
  )
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
