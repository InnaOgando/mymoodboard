import { useState, useEffect, useRef } from 'react'
import { uid } from '../utils.js'
import { getBoard, getBoards, saveBoard, deleteBoard, getElements, saveElement, deleteElement, exportAllData, importAllData } from '../db'
import Canvas from './Canvas'
import DraggableCard from './DraggableCard'
import BottomNav from './BottomNav'
import ImagePicker from './ImagePicker'
import ObjectRenderer, { normalizeType } from './ObjectRenderer'
import { getCollectionItems } from './objects/CollectionObject'
import { processAndUpload, deleteImageIfOrphaned } from '../storage.js'
import FloatingToolbar from './FloatingToolbar'
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
    ...childBoards.map(b => ({ x: b.x, y: b.y, w: 148, h: 130 })),
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

  // Viewport full — overflow downward from start
  return { x: Math.round(startX), y: Math.round(startY + viewportBounds.h) }
}

export default function BoardScreen({ boardId, boardStack, onOpenBoard, onBack, onHome }) {
  const [board, setBoard] = useState(null)
  const [elements, setElements] = useState([])
  const [childBoards, setChildBoards] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [dropOverCollectionId, _setDropOverCollectionId] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [undoVisible, setUndoVisible] = useState(false)
  const [previewEl, setPreviewEl] = useState(null)       // image preview modal
  const [galleryEl, setGalleryEl] = useState(null)       // collection gallery modal

  // Ref mirrors for state used inside async callbacks / event handlers
  const elementsRef = useRef([])
  const childBoardsRef = useRef([])
  // Ref for dropOverCollectionId so onTap can read it synchronously (iOS fix)
  const dropOverCollectionRef = useRef(null)

  const undoTimer = useRef(null)
  const scaleRef = useRef(1)
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

  useEffect(() => { elementsRef.current = elements }, [elements])
  useEffect(() => { childBoardsRef.current = childBoards }, [childBoards])
  useEffect(() => { load() }, [boardId])

  function getViewport() {
    return makeViewportBounds(canvasContainerRef, canvasOffsetRef, scaleRef)
  }

  // Desktop paste (Cmd+V)
  useEffect(() => {
    async function handlePaste(e) {
      const items = Array.from(e.clipboardData?.items || [])
      const imgItem = items.find(i => i.type.startsWith('image/'))
      if (!imgItem) return
      e.preventDefault()
      const blob = imgItem.getAsFile()
      try {
        const meta = await processAndUpload(blob)
        const pos = findFreePosition(elementsRef.current, childBoardsRef.current, getViewport(), 160, 200)
        await addElement('image', pos, meta)
      } catch (err) {
        console.warn('[paste] processAndUpload failed:', err)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [boardId])

  async function load() {
    const b = await getBoard(boardId)
    setBoard(b)
    const els = await getElements(boardId, { onSync: setElements })
    setElements(els)
    const children = await getBoards(boardId, { onSync: setChildBoards })
    setChildBoards(children)
  }

  async function addElement(type, pos, content = {}, { skipRemote = false } = {}) {
    const el = {
      id: uid(),
      boardId,
      type,
      x: pos.x,
      y: pos.y,
      w: type === 'image' ? 150 : undefined,
      content,
      createdAt: Date.now()
    }
    // Sync ref immediately so the next findFreePosition call sees this element
    // (the useEffect that mirrors state→ref only runs after the next render)
    elementsRef.current = [...elementsRef.current, el]
    setElements(prev => [...prev, el])
    const editableTypes = ['idea', 'text', 'note', 'link', 'todo', 'palette']
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

  async function duplicateCollection(col) {
    const newCol = {
      id: uid(), boardId, type: 'collection',
      x: col.x + 40, y: col.y + 40,
      w: col.w,
      content: { ...col.content, items: getCollectionItems(col.content).map(item => ({ ...item, id: uid() })) },
      createdAt: Date.now()
    }
    setElements(prev => [...prev, newCol])
    setSelectedId(newCol.id)
    saveElement(newCol).catch(e => console.error('[duplicateCollection] saveElement failed:', e))
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
  }

  function copyElement(el) {
    const { id: _id, boardId: _bid, ...rest } = el
    sessionStorage.setItem('refmemo_clipboard', JSON.stringify(rest))
  }

  function cutElement(el) {
    copyElement(el)
    removeElement(el.id)
    setSelectedId(null)
  }

  async function pasteElement() {
    const json = sessionStorage.getItem('refmemo_clipboard')
    if (!json) return
    try {
      const template = JSON.parse(json)
      const vp = getViewport()
      const w = template.w || 150
      const h = template.h || 150
      const pos = findFreePosition(elementsRef.current, childBoardsRef.current, vp, w, h)
      const el = { ...template, id: uid(), boardId, x: pos.x, y: pos.y, createdAt: Date.now() }
      elementsRef.current = [...elementsRef.current, el]
      setElements(prev => [...prev, el])
      setSelectedId(el.id)
      saveElement(el).catch(e => console.error('[paste]', e))
    } catch (e) { console.error('[paste] failed', e) }
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

  function hitTestCollection(cx, cy) {
    const cols = elementsRef.current.filter(e => e.type === 'collection' || e.type === 'column')
    for (const col of cols) {
      const items = getCollectionItems(col.content)
      const colW = col.w || 260
      // Collection renders as a flex column. Heights vary by content type.
      // Use a generous per-item estimate (images can be tall) plus header.
      const HEADER = 44
      const PER_ITEM = 180
      const colH = HEADER + Math.max(1, items.length) * PER_ITEM
      if (cx >= col.x && cx <= col.x + colW && cy >= col.y && cy <= col.y + colH) {
        return col.id
      }
    }
    return null
  }

  function handleObjectDragMove(objectEl, nx, ny) {
    if (normalizeType(objectEl.type) === 'collection') return
    const cx = nx + (objectEl.w || 150) / 2
    const cy = ny + 80
    const colId = hitTestCollection(cx, cy)
    setDropOverCollectionId(colId !== objectEl.id ? colId : null)
  }

  async function handleObjectDragEnd(objectEl, nx, ny) {
    setDropOverCollectionId(null)
    if (normalizeType(objectEl.type) === 'collection') return
    const cx = nx + (objectEl.w || 150) / 2
    const cy = ny + 80
    const colId = hitTestCollection(cx, cy)
    if (!colId || colId === objectEl.id) return
    await dropIntoCollection(objectEl, colId)
  }

  async function removeChildBoard(id) {
    if (!confirm('Delete this board and everything in it?')) return
    setChildBoards(prev => prev.filter(b => b.id !== id))
    deleteBoard(id).catch(e => console.error('[removeChildBoard] deleteBoard failed:', e))
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
        color: '#e8315a',
        x: bPos.x, y: bPos.y, createdAt: Date.now()
      }
      setChildBoards(prev => [...prev, newBoard])
      saveBoard(newBoard).catch(e => console.error('[handleNavAction] saveBoard failed:', e))
    } else if (type === 'document') {
      docRef.current.click()
    } else if (type === 'palette') {
      const freePos = findFreePosition(elementsRef.current, childBoardsRef.current, vp, 200, 90)
      await addElement('palette', freePos, {
        colors: ['#e8315a', '#f4845f', '#f7c948', '#4caf82', '#4a90d9']
      })
    } else {
      const freePos = findFreePosition(elementsRef.current, childBoardsRef.current, vp)
      await addElement(type, freePos)
    }
  }

  async function handleFiles(files) {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    const docs = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.match(/\.(doc|docx)$/i))
    const vp = getViewport()

    // addElement updates elementsRef.current synchronously, so each iteration
    // sees the previously placed image and avoids overlap automatically.
    for (const img of imgs) {
      const pos = findFreePosition(elementsRef.current, childBoardsRef.current, vp, 160, 200)
      try {
        const meta = await processAndUpload(img)
        await addElement('image', pos, meta)
      } catch (err) {
        console.warn('[handleFiles] processAndUpload failed:', err)
      }
    }
    for (const f of docs) {
      const pos = findFreePosition(elementsRef.current, childBoardsRef.current, vp)
      await addElement('document', pos, { name: f.name, type: f.type, src: await fileToBase64(f) })
    }
  }

  async function pasteFromClipboard() {
    const vp = getViewport()
    const internal = sessionStorage.getItem('refmemo_copied_image')
    if (internal) {
      const pos = findFreePosition(elementsRef.current, childBoardsRef.current, vp, 160, 200)
      addElement('image', pos, { src: internal })
      return
    }
    if (location.protocol === 'https:' && navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'))
          if (imageType) {
            const blob = await item.getType(imageType)
            try {
              const meta = await processAndUpload(blob)
              const pos = findFreePosition(elementsRef.current, childBoardsRef.current, vp, 160, 200)
              await addElement('image', pos, meta)
            } catch (err) {
              console.warn('[pasteFromClipboard] processAndUpload failed:', err)
            }
            return
          }
        }
        fileRef.current.click()
      } catch {
        fileRef.current.click()
      }
      return
    }
    fileRef.current.click()
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
      alert('Backup restaurado!')
    } catch { alert('Ficheiro inválido.') }
    e.target.value = ''
  }

  if (!board) return null

  return (
    <div className="screen">
      <header className="top-bar">
        <button className="back-btn" onClick={onBack}>‹</button>
        <span className="board-title">{board.name}</span>
        <button className="paste-img-btn" onClick={pasteFromClipboard} title="Add screenshot">
          <img src="/screenshot.png" alt="screenshot" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        </button>
        <button className="backup-btn" onClick={handleExport} title="Exportar backup">⬇︎</button>
        <button className="backup-btn" onClick={() => importRef.current.click()} title="Restaurar backup">⬆︎</button>
        <button className="home-btn" onClick={onHome}>
          <img src="/home.png" alt="home" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        </button>
      </header>

      <Canvas
        onClick={() => { setSelectedId(null); setEditingId(null) }}
        scaleRef={scaleRef}
        offsetRef={canvasOffsetRef}
        containerRef={canvasContainerRef}
      >

        {childBoards.map(b => (
          <DraggableCard key={b.id} x={b.x} y={b.y} scaleRef={scaleRef}
            alwaysDraggable
            onMove={(x, y) => moveChildBoard(b.id, x, y)}
            onTap={() => onOpenBoard(b.id)}
          >
            <div className="board-icon-card">
              <div className="board-color-dot" style={{ background: b.color || '#e8315a' }} />
              <div className="board-icon-name">{b.name}</div>
              <button className="card-delete-btn"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); removeChildBoard(b.id) }}>×</button>
            </div>
          </DraggableCard>
        ))}

        {elements.map(el => (
          <DraggableCard key={el.id} x={el.x} y={el.y} scaleRef={scaleRef}
            selected={selectedId === el.id}
            locked={!!el.locked}
            onMove={(x, y) => moveElement(el.id, x, y)}
            onDragMove={(nx, ny) => handleObjectDragMove(el, nx, ny)}
            onDragEnd={(nx, ny) => handleObjectDragEnd(el, nx, ny)}
            onTap={() => {
              // iOS short-drag fix: if we were hovering a collection during this
              // pointer interaction (detected via ref), complete the drop now.
              const pendingColId = dropOverCollectionRef.current
              if (pendingColId && normalizeType(el.type) !== 'collection') {
                setDropOverCollectionId(null)
                dropIntoCollection(el, pendingColId)
                return
              }

              if (selectedId === el.id && !el.locked) {
                // Second tap behaviour varies by type
                const type = normalizeType(el.type)
                if (type === 'image') {
                  setPreviewEl(el)
                } else if (type === 'collection') {
                  setGalleryEl(el)
                } else if (type === 'palette') {
                  setEditingId(el.id)
                } else if (['idea', 'text', 'note', 'link', 'todo'].includes(type)) {
                  setEditingId(el.id)
                }
              } else {
                setSelectedId(el.id)
                setEditingId(null)
              }
            }}
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
              onDuplicate={() => duplicateCollection(el)}
              isDropTarget={dropOverCollectionId === el.id}
              scaleRef={scaleRef}
            />
          </DraggableCard>
        ))}
      </Canvas>

      <BottomNav onAction={handleNavAction} />

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { handleFiles(Array.from(e.target.files)); e.target.value = '' }} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx" multiple style={{ display: 'none' }}
        onChange={e => { handleFiles(Array.from(e.target.files)); e.target.value = '' }} />
      <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />

      {showImagePicker && (
        <ImagePicker
          onFiles={files => { setShowImagePicker(false); handleFiles(files) }}
          onClose={() => setShowImagePicker(false)}
        />
      )}

      {undoVisible && (
        <div className="undo-toast">
          <span>Item apagado</span>
          <button className="undo-btn" onClick={undo}>Desfazer</button>
          <button className="undo-close" onPointerDown={e => e.stopPropagation()} onClick={() => setUndoVisible(false)}>×</button>
        </div>
      )}

      {/* Contextual bottom toolbar — shown when any non-collection object is selected */}
      {selectedId && (() => {
        const selEl = elementsRef.current.find(e => e.id === selectedId)
        if (!selEl) return null
        const selType = normalizeType(selEl.type)
        if (selType === 'collection') return null
        return (
          <FloatingToolbar
            key={selectedId}
            el={selEl}
            type={selType}
            onDelete={() => removeElement(selectedId)}
            onLock={() => toggleLock(selectedId)}
            onGroup={() => { const el = elementsRef.current.find(e => e.id === selectedId); if (el) makeCollection(el) }}
            onCopy={() => { const el = elementsRef.current.find(e => e.id === selectedId); if (el) copyElement(el) }}
            onCut={() => { const el = elementsRef.current.find(e => e.id === selectedId); if (el) cutElement(el) }}
            onDuplicate={() => { const el = elementsRef.current.find(e => e.id === selectedId); if (el) duplicateElement(el) }}
            onCaption={caption => setElementCaption(selectedId, caption)}
            onBgColor={color => setElementBgColor(selectedId, color)}
            onAddTitle={title => setTodoTitle(selectedId, title)}
          />
        )
      })()}

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
