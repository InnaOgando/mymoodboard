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

// ── Smart placement ───────────────────────────────────────────────────────────
// Find a non-overlapping canvas position near `hint`.
function findFreePosition(existingElements, childBoards, hint, objW = 170, objH = 190) {
  const GAP = 24
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

  // Try hint first
  if (!overlaps(hint.x, hint.y)) return hint

  // Spiral outward in a grid pattern
  for (let row = 0; row <= 6; row++) {
    for (let col = -3; col <= 6; col++) {
      const x = Math.max(20, hint.x + col * (objW + GAP))
      const y = Math.max(20, hint.y + row * (objH + GAP))
      if (!overlaps(x, y)) return { x, y }
    }
  }

  return { x: hint.x, y: hint.y + (objH + GAP) * 4 }
}

export default function BoardScreen({ boardId, boardStack, onOpenBoard, onBack, onHome }) {
  const [board, setBoard] = useState(null)
  const [elements, setElements] = useState([])
  const [childBoards, setChildBoards] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [pendingPos, setPendingPos] = useState({ x: 80, y: 80 })
  const [columnTarget, setColumnTarget] = useState(null)
  const [dropOverCollectionId, _setDropOverCollectionId] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [undoVisible, setUndoVisible] = useState(false)

  // Ref mirrors for state used inside async callbacks / event handlers
  const elementsRef = useRef([])
  const childBoardsRef = useRef([])
  // Ref for dropOverCollectionId so onTap can read it synchronously (iOS fix)
  const dropOverCollectionRef = useRef(null)

  const undoTimer = useRef(null)
  const scaleRef = useRef(1)
  const fileRef = useRef()
  const docRef = useRef()
  const collectionFileRef = useRef()
  const importRef = useRef()

  function setDropOverCollectionId(id) {
    dropOverCollectionRef.current = id
    _setDropOverCollectionId(id)
  }

  useEffect(() => { elementsRef.current = elements }, [elements])
  useEffect(() => { childBoardsRef.current = childBoards }, [childBoards])
  useEffect(() => { load() }, [boardId])

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
        const pos = findFreePosition(elementsRef.current, childBoardsRef.current, pendingPos, 160, 200)
        await addElement('image', pos, meta)
      } catch (err) {
        console.warn('[paste] processAndUpload failed:', err)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [pendingPos, boardId])

  async function load() {
    const b = await getBoard(boardId)
    setBoard(b)
    const els = await getElements(boardId)
    setElements(els)
    const children = await getBoards(boardId)
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
    await saveElement(el, { skipRemote })
    setElements(prev => [...prev, el])
    const editableTypes = ['idea', 'text', 'note', 'link', 'todo']
    if (editableTypes.includes(type)) setEditingId(el.id)
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
    await deleteElement(id)
    if (el?.type === 'image' && el.content?.src?.startsWith('http')) {
      deleteImageIfOrphaned(el.content.src, id)
    }
    if (el) {
      setUndoStack(prev => [...prev.slice(-19), el])
      setUndoVisible(true)
      clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setUndoVisible(false), 5000)
    }
  }

  async function undo() {
    const el = undoStack[undoStack.length - 1]
    if (!el) return
    await saveElement(el)
    setElements(prev => [...prev, el])
    setUndoStack(prev => prev.slice(0, -1))
    if (undoStack.length <= 1) setUndoVisible(false)
  }

  async function resizeElement(id, w, h) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, w, h } : el))
    const el = elementsRef.current.find(e => e.id === id)
    if (el) await saveElement({ ...el, w, h })
  }

  // ── Collection operations ───────────────────────────────────────────────────

  async function makeCollection(objectEl) {
    try {
      await deleteElement(objectEl.id)
      const items = [{ id: uid(), type: objectEl.type, content: objectEl.content, w: objectEl.w, h: objectEl.h }]
      const col = {
        id: uid(), boardId, type: 'collection',
        x: objectEl.x, y: objectEl.y,
        w: Math.max(objectEl.w || 260, 260),
        content: { items },
        createdAt: Date.now()
      }
      await saveElement(col)
      setElements(prev => [...prev.filter(e => e.id !== objectEl.id), col])
      setSelectedId(null)
    } catch (err) { console.error('makeCollection failed', err) }
  }

  async function addImageToCollection(colId, src) {
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    const items = getCollectionItems(col.content)
    const newItem = { id: uid(), type: 'image', content: { src } }
    const updated = { ...col, content: { items: [...items, newItem] } }
    await saveElement(updated)
    setElements(prev => prev.map(e => e.id === colId ? updated : e))
  }

  async function ejectFromCollection(colId, itemId) {
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    const items = getCollectionItems(col.content)
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const remaining = items.filter(i => i.id !== itemId)

    const ejected = {
      id: uid(), boardId, type: item.type,
      x: col.x + (col.w || 150) + 32, y: col.y,
      w: item.w || 150,
      h: item.h,
      content: item.content,
      createdAt: Date.now()
    }
    await saveElement(ejected)

    // Always keep the collection alive even when empty (so user can drag back).
    // An empty collection shows "Drag objects here" and can be deleted explicitly.
    const updated = { ...col, content: { items: remaining } }
    await saveElement(updated)
    setElements(prev => prev.map(e => e.id === colId ? updated : e).concat(ejected))
    setSelectedId(ejected.id)
  }

  // Drop a canvas element into a collection (shared logic for drag-end and tap-fallback)
  async function dropIntoCollection(objectEl, colId) {
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    const items = getCollectionItems(col.content)
    const newItem = { id: uid(), type: objectEl.type, content: objectEl.content, w: objectEl.w, h: objectEl.h }
    const updated = { ...col, content: { items: [...items, newItem] } }
    await saveElement(updated)
    await deleteElement(objectEl.id)
    setElements(prev => prev.filter(e => e.id !== objectEl.id).map(e => e.id === colId ? updated : e))
    setSelectedId(colId)
  }

  // ── Drag & Drop (canvas ↔ collection) ──────────────────────────────────────

  function hitTestCollection(cx, cy) {
    const cols = elementsRef.current.filter(e => e.type === 'collection' || e.type === 'column')
    for (const col of cols) {
      const items = getCollectionItems(col.content)
      const colW = col.w || 260
      // Match the CSS grid: 120px thumbs, 4px gap, 16px total horizontal padding
      const THUMB = 120, GAP = 4, PAD = 16
      const gridCols = Math.max(1, Math.floor((colW - PAD + GAP) / (THUMB + GAP)))
      const gridRows = Math.ceil(Math.max(1, items.length) / gridCols)
      const colH = gridRows * (THUMB + GAP) + 50 // 50px covers header + bottom pad
      if (cx >= col.x - 20 && cx <= col.x + colW + 20 && cy >= col.y - 20 && cy <= col.y + colH) {
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
    await deleteBoard(id)
    setChildBoards(prev => prev.filter(b => b.id !== id))
  }

  async function handleNavAction(type, pos) {
    const hint = pos || pendingPos
    if (type === 'image') {
      setPendingPos(hint)
      setShowImagePicker(true)
    } else if (type === 'board') {
      const name = prompt('Board name:')
      if (!name) return
      const bPos = findFreePosition(elementsRef.current, childBoardsRef.current, hint, 148, 130)
      const newBoard = {
        id: uid(), parentId: boardId, name: name.trim(),
        color: '#e8315a',
        x: bPos.x, y: bPos.y, createdAt: Date.now()
      }
      await saveBoard(newBoard)
      setChildBoards(prev => [...prev, newBoard])
    } else if (type === 'document') {
      setPendingPos(hint)
      docRef.current.click()
    } else if (type === 'palette') {
      const freePos = findFreePosition(elementsRef.current, childBoardsRef.current, hint, 200, 90)
      await addElement('palette', freePos, {
        colors: ['#e8315a', '#f4845f', '#f7c948', '#4caf82', '#4a90d9']
      })
    } else {
      const freePos = findFreePosition(elementsRef.current, childBoardsRef.current, hint)
      await addElement(type, freePos)
    }
  }

  async function handleFiles(files) {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    const docs = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.match(/\.(doc|docx)$/i))

    // Track newly-added elements so each subsequent image avoids the previous ones
    const added = []
    for (const img of imgs) {
      const allExisting = [...elementsRef.current, ...added]
      const pos = findFreePosition(allExisting, childBoardsRef.current, pendingPos, 160, 200)
      try {
        const meta = await processAndUpload(img)
        const el = await addElement('image', pos, meta)
        added.push(el)
      } catch (err) {
        console.warn('[handleFiles] processAndUpload failed:', err)
      }
    }
    for (const f of docs) {
      const pos = findFreePosition(elementsRef.current, childBoardsRef.current, pendingPos)
      await addElement('document', pos, { name: f.name, type: f.type, src: await fileToBase64(f) })
    }
  }

  async function pasteFromClipboard() {
    const internal = sessionStorage.getItem('refmemo_copied_image')
    if (internal) {
      const pos = findFreePosition(elementsRef.current, childBoardsRef.current, pendingPos, 160, 200)
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
              const pos = findFreePosition(elementsRef.current, childBoardsRef.current, pendingPos, 160, 200)
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

      <Canvas onClick={pos => { setPendingPos(pos); setSelectedId(null); setEditingId(null) }} scaleRef={scaleRef}>

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

              if (selectedId === el.id) {
                const type = normalizeType(el.type)
                if (type === 'link' && el.content.url) window.open(el.content.url, '_blank')
                else if (['idea', 'text', 'note', 'link', 'todo'].includes(type)) setEditingId(el.id)
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
              onAddImage={() => { setColumnTarget(el.id); collectionFileRef.current.click() }}
              onEjectItem={itemId => ejectFromCollection(el.id, itemId)}
              isDropTarget={dropOverCollectionId === el.id}
              scaleRef={scaleRef}
            />
          </DraggableCard>
        ))}
      </Canvas>

      <BottomNav onAction={handleNavAction} setPendingPos={setPendingPos} />

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { handleFiles(Array.from(e.target.files)); e.target.value = '' }} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx" multiple style={{ display: 'none' }}
        onChange={e => { handleFiles(Array.from(e.target.files)); e.target.value = '' }} />
      <input ref={collectionFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={async e => {
          const colId = columnTarget
          if (!colId) return
          setColumnTarget(null)
          for (const file of Array.from(e.target.files)) {
            try {
              const meta = await processAndUpload(file)
              await addImageToCollection(colId, meta.src)
            } catch (err) {
              console.warn('[collectionFileRef] processAndUpload failed:', err)
            }
          }
          e.target.value = ''
        }} />
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
