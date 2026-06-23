import { useState, useEffect, useRef } from 'react'
import { uid } from '../utils.js'
import { getBoard, getBoards, saveBoard, deleteBoard, getElements, saveElement, deleteElement, exportAllData, importAllData } from '../db'
import Canvas from './Canvas'
import DraggableCard from './DraggableCard'
import BottomNav from './BottomNav'
import ImagePicker from './ImagePicker'
import { compressImage } from '../compress.js'
import { uploadImage, deleteImage } from '../storage.js'

export default function BoardScreen({ boardId, boardStack, onOpenBoard, onBack, onHome }) {
  const [board, setBoard] = useState(null)
  const [elements, setElements] = useState([])
  const [childBoards, setChildBoards] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [pendingPos, setPendingPos] = useState({ x: 100, y: 100 })
  const [columnTarget, setColumnTarget] = useState(null)
  const [dropOverColumnId, setDropOverColumnId] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [undoVisible, setUndoVisible] = useState(false)
  const undoTimer = useRef(null)
  const elementsRef = useRef([])
  const scaleRef = useRef(1)
  const fileRef = useRef()
  const docRef = useRef()
  const columnFileRef = useRef()
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
      const data = await compressImage(blob)
      await addElement('image', pendingPos, { src: data })
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
    if (['note', 'text', 'link', 'todo'].includes(type)) setEditingId(el.id)
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
      deleteImage(el.content.src)
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

  async function colorElement(id, color) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, content: { ...el.content, bgColor: color } } : el))
    const el = elementsRef.current.find(e => e.id === id)
    if (el) await saveElement({ ...el, content: { ...el.content, bgColor: color } })
  }

  async function makeColumn(imageEl) {
    try {
      await deleteElement(imageEl.id)
      const col = {
        id: uid(), boardId, type: 'column',
        x: imageEl.x, y: imageEl.y,
        w: imageEl.w || 150,
        content: { images: [{ id: uid(), src: imageEl.content.src }] },
        createdAt: Date.now()
      }
      await saveElement(col)
      setElements(prev => [...prev.filter(e => e.id !== imageEl.id), col])
      setSelectedId(null)
    } catch (err) { console.error('makeColumn failed', err) }
  }

  async function addImageToColumn(colId, src) {
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    const updated = { ...col, content: { ...col.content, images: [...(col.content.images || []), { id: uid(), src }] } }
    await saveElement(updated)
    setElements(prev => prev.map(e => e.id === colId ? updated : e))
  }

  async function ejectImageFromColumn(colId, imgId) {
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    const img = (col.content.images || []).find(i => i.id === imgId)
    if (!img) return
    const images = col.content.images.filter(i => i.id !== imgId)
    const ejected = {
      id: uid(), boardId, type: 'image',
      x: col.x + (col.w || 150) + 24, y: col.y,
      w: col.w || 150,
      content: { src: img.src }, createdAt: Date.now()
    }
    await saveElement(ejected)
    if (images.length === 0) {
      await deleteElement(colId)
      setElements(prev => prev.filter(e => e.id !== colId).concat(ejected))
    } else {
      const updated = { ...col, content: { ...col.content, images } }
      await saveElement(updated)
      setElements(prev => prev.map(e => e.id === colId ? updated : e).concat(ejected))
    }
    setSelectedId(ejected.id)
  }

  function hitTestColumn(cx, cy) {
    const cols = elementsRef.current.filter(e => e.type === 'column')
    for (const col of cols) {
      const colW = (col.w || 150) + 40
      const colH = (col.content.images || []).length * 170 + 80
      if (cx >= col.x - 20 && cx <= col.x + colW && cy >= col.y - 20 && cy <= col.y + colH) {
        return col.id
      }
    }
    return null
  }

  function handleImageDragMove(imageEl, nx, ny) {
    const cx = nx + (imageEl.w || 150) / 2
    const cy = ny + 80
    setDropOverColumnId(hitTestColumn(cx, cy))
  }

  async function handleImageDragEnd(imageEl, nx, ny) {
    setDropOverColumnId(null)
    const cx = nx + (imageEl.w || 150) / 2
    const cy = ny + 80
    const colId = hitTestColumn(cx, cy)
    if (!colId) return
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    try {
      const updated = {
        ...col,
        content: { ...col.content, images: [...(col.content.images || []), { id: uid(), src: imageEl.content.src }] }
      }
      await saveElement(updated)
      await deleteElement(imageEl.id)
      setElements(prev => prev.filter(e => e.id !== imageEl.id).map(e => e.id === colId ? updated : e))
      setSelectedId(colId)
    } catch (err) { console.error('drop into column failed', err) }
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
        x: pendingPos.x, y: pendingPos.y, createdAt: Date.now()
      }
      await saveBoard(newBoard)
      setChildBoards(prev => [...prev, newBoard])
    } else if (type === 'document') {
      docRef.current.click()
    } else if (type === 'color') {
      await addElement('color', pendingPos, { color: '#e8315a' })
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
      // Add immediately with base64, skip Supabase DB until we have the Storage URL
      const data = await compressImage(imgs[i])
      const el = await addElement('image', pos, { src: data }, { skipRemote: true })
      // Upload to Storage in background, then save URL to Supabase DB
      const file = imgs[i]
      uploadImage(file).then(url => updateContent(el.id, { src: url })).catch(() => {
        // Storage failed — sync base64 to Supabase DB as fallback
        saveElement(elementsRef.current.find(e => e.id === el.id) || el)
      })
    }
    for (const f of docs) {
      const pos = { x: pendingPos.x + Math.random() * 40, y: pendingPos.y + Math.random() * 40 }
      await addElement('document', pos, { name: f.name, type: f.type, src: await fileToBase64(f) })
    }
  }

  async function pasteFromClipboard() {
    const internal = sessionStorage.getItem('refmemo_copied_image')
    if (internal) { addElement('image', pendingPos, { src: internal }); return }
    // On HTTPS: try clipboard API (reads screenshot without going through Photos)
    if (location.protocol === 'https:' && navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'))
          if (imageType) {
            const blob = await item.getType(imageType)
            const data = await compressImage(blob)
            const el = await addElement('image', pendingPos, { src: data }, { skipRemote: true })
            uploadImage(blob).then(url => updateContent(el.id, { src: url })).catch(() => {
              saveElement(elementsRef.current.find(e => e.id === el.id) || el)
            })
            return
          }
        }
        // No image in clipboard
        fileRef.current.click()
      } catch {
        // Permission denied — fall back to file picker
        fileRef.current.click()
      }
      return
    }
    // HTTP local: file picker only
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
        <button className="paste-img-btn" onClick={pasteFromClipboard} title="Add screenshot"><img src="/screenshot.png" alt="screenshot" style={{width:22,height:22,objectFit:"contain"}} /></button>
        <button className="backup-btn" onClick={handleExport} title="Exportar backup">⬇︎</button>
        <button className="backup-btn" onClick={() => importRef.current.click()} title="Restaurar backup">⬆︎</button>
        <button className="home-btn" onClick={onHome}><img src="/home.png" alt="home" style={{width:22,height:22,objectFit:"contain"}} /></button>
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
            onDragMove={el.type === 'image' ? (nx, ny) => handleImageDragMove(el, nx, ny) : undefined}
            onDragEnd={el.type === 'image' ? (nx, ny) => handleImageDragEnd(el, nx, ny) : undefined}
            onTap={() => {
              if (selectedId === el.id) {
                if (el.type === 'link' && el.content.url) window.open(el.content.url, '_blank')
                else if (['color', 'text', 'note', 'todo', 'link'].includes(el.type)) setEditingId(el.id)
              } else {
                setSelectedId(el.id)
                setEditingId(null)
              }
            }}
          >
            <ElementCard
              el={el}
              selected={selectedId === el.id}
              editing={editingId === el.id}
              onUpdate={content => updateContent(el.id, content)}
              onDelete={() => removeElement(el.id)}
              onStopEdit={() => setEditingId(null)}
              onEdit={() => setEditingId(el.id)}
              onResize={(w, h) => resizeElement(el.id, w, h)}
              onColor={color => colorElement(el.id, color)}
              onMakeColumn={() => makeColumn(el)}
              onAddColumnImage={() => { setColumnTarget(el.id); columnFileRef.current.click() }}
              onRemoveColumnImage={imgId => ejectImageFromColumn(el.id, imgId)}
              isDropTarget={dropOverColumnId === el.id}
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
      <input ref={columnFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={async e => {
          const colId = columnTarget
          if (!colId) return
          setColumnTarget(null)
          for (const file of Array.from(e.target.files)) {
            const src = await compressImage(file)
            await addImageToColumn(colId, src)
            uploadImage(file).then(url => {
              const col = elementsRef.current.find(c => c.id === colId)
              if (!col) return
              const imgs = (col.content.images || [])
              const idx = imgs.findIndex(i => i.src === src)
              if (idx === -1) return
              const updated = { ...col, content: { ...col.content, images: imgs.map((i, n) => n === idx ? { ...i, src: url } : i) } }
              saveElement(updated)
              setElements(prev => prev.map(e => e.id === colId ? updated : e))
            }).catch(() => {})
          }
          e.target.value = ''
        }} />
      <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }}
        onChange={handleImport} />

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

// ── Cards ─────────────────────────────────────────────────────────────────────

function ElementCard({ el, selected, editing, onUpdate, onDelete, onStopEdit, onEdit, onResize, onColor, onMakeColumn, onAddColumnImage, onRemoveColumnImage, isDropTarget, scaleRef }) {
  const props = { el, selected, editing, onUpdate, onDelete, onStopEdit, onEdit, onResize, onColor, onMakeColumn, onAddColumnImage, onRemoveColumnImage, isDropTarget, scaleRef }
  switch (el.type) {
    case 'image':    return <ImageCard {...props} />
    case 'column':   return <ColumnCard {...props} />
    case 'color':    return <ColorCard {...props} />
    case 'text':
    case 'note':     return <TextCard {...props} />
    case 'link':     return <LinkCard {...props} />
    case 'todo':     return <TodoCard {...props} />
    case 'document': return <DocumentCard {...props} />
    default: return null
  }
}

function ImageCard({ el, selected, onDelete, onResize, onMakeColumn, scaleRef }) {
  const w = el.w || 150

  return (
    <div style={{ position: 'relative', width: w }}>
      {selected && (
        <div className="img-popup-menu" onPointerDown={e => e.stopPropagation()}>
          <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onMakeColumn?.() }}>+ Column</button>
          <button className="img-popup-btn img-popup-delete" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        </div>
      )}
      <div className={`el-card el-image ${selected ? 'selected' : ''}`} style={{ width: w }}>
        <img src={el.content.src} alt="" draggable={false} style={{ width: '100%', height: 'auto', display: 'block' }} />
        {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={60} scaleRef={scaleRef} />}
      </div>
    </div>
  )
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function ColorCard({ el, selected, onUpdate, onDelete }) {
  const color = el.content.color || '#e8315a'
  const { r, g, b } = hexToRgb(color)
  const isDark = (r * 299 + g * 587 + b * 114) / 1000 < 128
  const textColor = isDark ? '#fff' : '#111'
  return (
    <div className={`el-card el-color-card ${selected ? 'selected' : ''}`} style={{ background: color }}>
      <div className="color-card-row">
        <input type="color" value={color} className="color-card-input-native"
          onChange={e => onUpdate({ ...el.content, color: e.target.value })} />
        <div className="color-card-codes" style={{ color: textColor }}>
          <div className="color-code-row"><span className="color-code-label">HEX</span><span className="color-code-val">{color.toUpperCase()}</span></div>
          <div className="color-code-row"><span className="color-code-label">RGB</span><span className="color-code-val">{r}, {g}, {b}</span></div>
        </div>
        {selected && <button className="color-card-del" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
    </div>
  )
}

function ColumnCard({ el, selected, isDropTarget, onDelete, onResize, onAddColumnImage, onRemoveColumnImage, scaleRef }) {
  const w = el.w || 150
  const images = el.content.images || []
  return (
    <div className={`el-card el-column ${selected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''}`} style={{ width: w }}>
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        <span className="column-label">Column</span>
        {selected && <>
          <button className="img-action-btn col-add-btn" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onAddColumnImage?.() }}>+ Add</button>
          <button className="handle-delete" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        </>}
      </div>
      <div className="column-images">
        {images.map(img => (
          <div key={img.id} className="column-img-wrap">
            <img src={img.src} alt="" draggable={false} style={{ width: '100%', display: 'block' }} />
            {selected && (
              <button className="col-img-eject" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onRemoveColumnImage?.(img.id) }}>↗</button>
            )}
          </div>
        ))}
      </div>
      {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={80} scaleRef={scaleRef} />}
    </div>
  )
}

function TextCard({ el, selected, editing, onUpdate, onDelete, onResize, scaleRef }) {
  const ref = useRef()
  const w = el.w || 220
  const h = el.h || 120
  useEffect(() => { if (editing) setTimeout(() => ref.current?.focus(), 50) }, [editing])
  return (
    <div className={`el-card el-text ${selected ? 'selected' : ''}`} style={{ width: w, height: h }}>
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        {selected && <button className="handle-delete" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      <textarea ref={ref} className="card-textarea card-textarea-text"
        style={{ fontSize: `${el.content.fontSize || 18}px`, height: h - 28 }}
        value={el.content.text || ''}
        onChange={e => onUpdate({ ...el.content, text: e.target.value })}
        placeholder="Tap to type…" />
      {selected && <ResizeHandle w={w} h={h} onResize={onResize} minW={120} minH={60} scaleRef={scaleRef} />}
    </div>
  )
}

function LinkCard({ el, selected, editing, onUpdate, onDelete, onStopEdit, onEdit, onResize, scaleRef }) {
  const ref = useRef()
  const w = el.w || 260
  useEffect(() => { if (editing) setTimeout(() => ref.current?.focus(), 50) }, [editing])
  return (
    <div className={`el-card el-link ${selected ? 'selected' : ''}`} style={{ width: w }}>
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        {selected && <button className="handle-edit" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onEdit?.() }}>✎</button>}
        {selected && <button className="handle-delete" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      {editing ? (
        <div className="link-edit-col">
          <div className="link-edit-row">
            <input ref={ref} className="card-input" value={el.content.url || ''}
              onChange={e => onUpdate({ ...el.content, url: e.target.value })} placeholder="https://…" />
            <button className="paste-btn" onMouseDown={e => e.preventDefault()}
              onClick={async () => { try { onUpdate({ ...el.content, url: await navigator.clipboard.readText() }) } catch {} }}><img src="/link.png" alt="paste" style={{width:18,height:18,objectFit:"contain"}} /></button>
          </div>
          <button className="btn-primary" style={{ marginTop: 6 }} onMouseDown={e => e.preventDefault()} onClick={onStopEdit}>Done</button>
        </div>
      ) : (
        <div className="card-link-display">
          {el.content.url
            ? <a className="card-link-text" href={el.content.url} target="_blank" rel="noreferrer"><img src="/link.png" alt="link" style={{width:14,height:14,objectFit:"contain",marginRight:4,verticalAlign:"middle"}} />{shortUrl(el.content.url)}</a>
            : <span className="placeholder">Tap to add link</span>}
        </div>
      )}
      {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={160} scaleRef={scaleRef} />}
    </div>
  )
}

function shortUrl(url) {
  try {
    const u = new URL(url)
    const p = u.pathname.length > 20 ? u.pathname.slice(0, 20) + '…' : u.pathname
    return u.hostname.replace('www.', '') + p
  } catch { return url.length > 40 ? url.slice(0, 40) + '…' : url }
}

function TodoCard({ el, selected, editing, onUpdate, onDelete, onResize, scaleRef }) {
  const items = el.content.items?.length ? el.content.items : [{ text: '', done: false }]
  const w = el.w || 260
  function toggle(i) { onUpdate({ ...el.content, items: items.map((t, idx) => idx !== i ? t : { ...t, done: !t.done }) }) }
  function updateItem(i, text) { onUpdate({ ...el.content, items: items.map((t, idx) => idx !== i ? t : { ...t, text }) }) }
  function addItem() { onUpdate({ ...el.content, items: [...items, { text: '', done: false }] }) }
  function removeItem(i) { const u = items.filter((_, idx) => idx !== i); onUpdate({ ...el.content, items: u.length ? u : [{ text: '', done: false }] }) }
  return (
    <div className={`el-card el-todo ${selected ? 'selected' : ''}`} style={{ width: w }}>
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        {selected && <button className="handle-delete" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      {items.map((item, i) => (
        <div key={i} className="todo-item">
          <input type="checkbox" checked={!!item.done} onChange={() => toggle(i)} />
          <input className={`todo-input ${item.done ? 'done' : ''}`} value={item.text || ''}
            onChange={e => updateItem(i, e.target.value)} placeholder="Task…" />
          {editing && <button className="todo-remove" onClick={() => removeItem(i)}>×</button>}
        </div>
      ))}
      <button className="todo-add" onClick={addItem}>+ Add item</button>
      {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={160} scaleRef={scaleRef} />}
    </div>
  )
}

function DocumentCard({ el, selected, onDelete }) {
  function openDoc(e) {
    e.stopPropagation()
    if (!el.content.src) return
    const byteStr = atob(el.content.src.split(',')[1])
    const ab = new ArrayBuffer(byteStr.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i)
    const blob = new Blob([ab], { type: el.content.type || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.target = '_blank'; a.rel = 'noreferrer'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
  return (
    <div className={`el-card el-document ${selected ? 'selected' : ''}`}>
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        {selected && <button className="handle-delete" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      <div className="doc-icon">{el.content.type === 'application/pdf' ? '📄' : '📝'}</div>
      <div className="doc-name">{el.content.name}</div>
      {el.content.src && <button className="doc-open" onPointerDown={e => e.stopPropagation()} onClick={openDoc}>Open</button>}
    </div>
  )
}

function ResizeHandle({ w, h, onResize, minW = 80, minH = 60, scaleRef }) {
  const startPtr = useRef(null)
  return (
    <div className="resize-handle"
      onPointerDown={e => {
        e.stopPropagation(); e.preventDefault()
        startPtr.current = { x: e.clientX, y: e.clientY, w, h }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        if (!startPtr.current) return
        const s = scaleRef?.current ?? 1
        const nw = Math.max(minW, (startPtr.current.w || 150) + (e.clientX - startPtr.current.x) / s)
        const nh = h !== null ? Math.max(minH, (startPtr.current.h || 120) + (e.clientY - startPtr.current.y) / s) : null
        onResize(nw, nh)
      }}
      onPointerUp={() => { startPtr.current = null }}
    />
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
