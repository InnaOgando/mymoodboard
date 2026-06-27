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

export default function BoardScreen({ boardId, boardStack, onOpenBoard, onBack, onHome }) {
  const [board, setBoard] = useState(null)
  const [elements, setElements] = useState([])
  const [childBoards, setChildBoards] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [pendingPos, setPendingPos] = useState({ x: 100, y: 100 })
  const [columnTarget, setColumnTarget] = useState(null)
  const [dropOverCollectionId, setDropOverCollectionId] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [undoVisible, setUndoVisible] = useState(false)
  const undoTimer = useRef(null)
  const elementsRef = useRef([])
  const scaleRef = useRef(1)
  const fileRef = useRef()
  const docRef = useRef()
  const collectionFileRef = useRef()
  const importRef = useRef()

  useEffect(() => { elementsRef.current = elements }, [elements])
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
        await addElement('image', pendingPos, meta)
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
    const b = childBoards.find(c => c.id === id)
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

  // Convert any canvas object into a new Collection containing just that object
  async function makeCollection(objectEl) {
    try {
      await deleteElement(objectEl.id)
      const items = [{ id: uid(), type: objectEl.type, content: objectEl.content, w: objectEl.w, h: objectEl.h }]
      const col = {
        id: uid(), boardId, type: 'collection',
        x: objectEl.x, y: objectEl.y,
        w: objectEl.w || 150,
        content: { items },
        createdAt: Date.now()
      }
      await saveElement(col)
      setElements(prev => [...prev.filter(e => e.id !== objectEl.id), col])
      setSelectedId(null)
    } catch (err) { console.error('makeCollection failed', err) }
  }

  // Add an image (by src URL) to a collection
  async function addImageToCollection(colId, src) {
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    const items = getCollectionItems(col.content)
    const newItem = { id: uid(), type: 'image', content: { src } }
    const updated = { ...col, content: { ...col.content, items: [...items, newItem] } }
    await saveElement(updated)
    setElements(prev => prev.map(e => e.id === colId ? updated : e))
  }

  // Eject any item from a collection back onto the canvas
  async function ejectFromCollection(colId, itemId) {
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    const items = getCollectionItems(col.content)
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const remaining = items.filter(i => i.id !== itemId)
    const ejected = {
      id: uid(), boardId, type: item.type,
      x: col.x + (col.w || 150) + 24, y: col.y,
      w: item.w || 150,
      h: item.h,
      content: item.content,
      createdAt: Date.now()
    }
    await saveElement(ejected)
    if (remaining.length === 0) {
      await deleteElement(colId)
      setElements(prev => prev.filter(e => e.id !== colId).concat(ejected))
    } else {
      const updated = { ...col, content: { items: remaining } }
      await saveElement(updated)
      setElements(prev => prev.map(e => e.id === colId ? updated : e).concat(ejected))
    }
    setSelectedId(ejected.id)
  }

  // ── Drag & Drop (canvas ↔ collection) ──────────────────────────────────────

  function hitTestCollection(cx, cy) {
    const cols = elementsRef.current.filter(e => e.type === 'collection' || e.type === 'column')
    for (const col of cols) {
      const items = getCollectionItems(col.content)
      const colW = (col.w || 150) + 40
      const colH = Math.max(items.length * 170, 60) + 80
      if (cx >= col.x - 20 && cx <= col.x + colW && cy >= col.y - 20 && cy <= col.y + colH) {
        return col.id
      }
    }
    return null
  }

  function handleObjectDragMove(objectEl, nx, ny) {
    // Don't allow dropping a collection into another collection
    if (normalizeType(objectEl.type) === 'collection') return
    const cx = nx + (objectEl.w || 150) / 2
    const cy = ny + 80
    const colId = hitTestCollection(cx, cy)
    // Don't highlight if hovering over self (for collection elements)
    setDropOverCollectionId(colId !== objectEl.id ? colId : null)
  }

  async function handleObjectDragEnd(objectEl, nx, ny) {
    setDropOverCollectionId(null)
    if (normalizeType(objectEl.type) === 'collection') return
    const cx = nx + (objectEl.w || 150) / 2
    const cy = ny + 80
    const colId = hitTestCollection(cx, cy)
    if (!colId || colId === objectEl.id) return
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

  async function removeChildBoard(id) {
    if (!confirm('Delete this board and everything in it?')) return
    await deleteBoard(id)
    setChildBoards(prev => prev.filter(b => b.id !== id))
  }

  async function handleNavAction(type, pos) {
    setPendingPos(pos || { x: 80 + Math.random() * 200, y: 80 + Math.random() * 200 })
    if (type === 'image') {
      setShowImagePicker(true)
    } else if (type === 'board') {
      const name = prompt('Board name:')
      if (!name) return
      const newBoard = {
        id: uid(), parentId: boardId, name: name.trim(),
        color: '#e8315a',
        x: pendingPos.x, y: pendingPos.y, createdAt: Date.now()
      }
      await saveBoard(newBoard)
      setChildBoards(prev => [...prev, newBoard])
    } else if (type === 'document') {
      docRef.current.click()
    } else if (type === 'palette') {
      await addElement('palette', pendingPos, {
        colors: ['#e8315a', '#f4845f', '#f7c948', '#4caf82', '#4a90d9']
      })
    } else {
      await addElement(type, pendingPos)
    }
  }

  async function handleFiles(files) {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    const docs = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.match(/\.(doc|docx)$/i))
    for (let i = 0; i < imgs.length; i++) {
      const col = i % 2
      const row = Math.floor(i / 2)
      const pos = { x: pendingPos.x + col * 162, y: pendingPos.y + row * 162 }
      try {
        const meta = await processAndUpload(imgs[i])
        await addElement('image', pos, meta)
      } catch (err) {
        console.warn('[handleFiles] processAndUpload failed:', err)
      }
    }
    for (const f of docs) {
      const pos = { x: pendingPos.x + Math.random() * 40, y: pendingPos.y + Math.random() * 40 }
      await addElement('document', pos, { name: f.name, type: f.type, src: await fileToBase64(f) })
    }
  }

  async function pasteFromClipboard() {
    const internal = sessionStorage.getItem('refmemo_copied_image')
    if (internal) { addElement('image', pendingPos, { src: internal }); return }
    if (location.protocol === 'https:' && navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'))
          if (imageType) {
            const blob = await item.getType(imageType)
            try {
              const meta = await processAndUpload(blob)
              await addElement('image', pendingPos, meta)
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

        {/* Child boards */}
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

        {/* Canvas objects */}
        {elements.map(el => (
          <DraggableCard key={el.id} x={el.x} y={el.y} scaleRef={scaleRef}
            selected={selectedId === el.id}
            onMove={(x, y) => moveElement(el.id, x, y)}
            onDragMove={(nx, ny) => handleObjectDragMove(el, nx, ny)}
            onDragEnd={(nx, ny) => handleObjectDragEnd(el, nx, ny)}
            onTap={() => {
              if (selectedId === el.id) {
                const type = normalizeType(el.type)
                if (type === 'link' && el.content.url) window.open(el.content.url, '_blank')
                else if (['idea', 'text', 'note', 'link', 'todo', 'palette'].includes(type)) setEditingId(el.id)
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

      {/* Hidden file inputs */}
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
