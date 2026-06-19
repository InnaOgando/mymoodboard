import { useState, useEffect, useRef, useCallback } from 'react'
import { uid } from '../utils.js'
import { getBoard, getBoards, saveBoard, deleteBoard, getElements, saveElement, deleteElement } from '../db'
import Canvas from './Canvas'
import DraggableCard from './DraggableCard'
import BottomNav from './BottomNav'
import ImagePicker from './ImagePicker'
import { compressImage } from '../compress.js'

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
  const [undoStack, setUndoStack] = useState([])   // [{el}, ...]
  const [undoVisible, setUndoVisible] = useState(false)
  const undoTimer = useRef(null)
  const elementsRef = useRef([])  // always-current elements for async callbacks
  const scaleRef = useRef(1)
  const fileRef = useRef()
  const docRef = useRef()
  const columnFileRef = useRef()

  // Keep elementsRef in sync so drag callbacks always see fresh elements
  useEffect(() => { elementsRef.current = elements }, [elements])

  useEffect(() => { load() }, [boardId])

  // Paste image from clipboard (Share → Copy → RefNest → tap board → paste)
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

  async function addElement(type, pos, content = {}) {
    const el = {
      id: uid(),
      boardId,
      type,
      x: pos.x,
      y: pos.y,
      width: type === 'image' ? 200 : 180,
      content,
      createdAt: Date.now()
    }
    await saveElement(el)
    setElements(prev => [...prev, el])
    if (type === 'note' || type === 'text' || type === 'link' || type === 'todo') {
      setEditingId(el.id)
    }
    return el
  }

  async function moveElement(id, x, y) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, x, y } : el))
    const el = elements.find(e => e.id === id)
    if (el) await saveElement({ ...el, x, y })
  }

  async function moveChildBoard(id, x, y) {
    setChildBoards(prev => prev.map(b => b.id === id ? { ...b, x, y } : b))
    const b = childBoards.find(c => c.id === id)
    if (b) await saveBoard({ ...b, x, y })
  }

  async function updateContent(id, content) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, content } : el))
    const el = elements.find(e => e.id === id)
    if (el) await saveElement({ ...el, content })
  }

  async function removeElement(id) {
    const el = elementsRef.current.find(e => e.id === id)
    await deleteElement(id)
    setElements(prev => prev.filter(e => e.id !== id))
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
    const el = elements.find(e => e.id === id)
    if (el) await saveElement({ ...el, w, h })
  }

  async function colorElement(id, color) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, content: { ...el.content, bgColor: color } } : el))
    const el = elements.find(e => e.id === id)
    if (el) await saveElement({ ...el, content: { ...el.content, bgColor: color } })
  }

  async function makeColumn(imageEl) {
    try {
    // Remove original image element and create a column with it
    await deleteElement(imageEl.id)
    const col = {
      id: uid(),
      boardId,
      type: 'column',
      x: imageEl.x,
      y: imageEl.y,
      w: imageEl.w || 200,
      content: { images: [{ id: uid(), src: imageEl.content.src }] },
      createdAt: Date.now()
    }
    await saveElement(col)
    setElements(prev => [...prev.filter(e => e.id !== imageEl.id), col])
    setSelectedId(col.id)
    } catch(err) { console.error('makeColumn failed', err) }
  }

  async function addImageToColumn(colId, src) {
    const col = elements.find(e => e.id === colId)
    if (!col) return
    const updated = { ...col, content: { ...col.content, images: [...(col.content.images || []), { id: uid(), src }] } }
    await saveElement(updated)
    setElements(prev => prev.map(e => e.id === colId ? updated : e))
  }

  async function removeImageFromColumn(colId, imgId) {
    const col = elements.find(e => e.id === colId)
    if (!col) return
    const images = col.content.images.filter(i => i.id !== imgId)
    if (images.length === 0) { await removeElement(colId); return }
    const updated = { ...col, content: { ...col.content, images } }
    await saveElement(updated)
    setElements(prev => prev.map(e => e.id === colId ? updated : e))
  }

  function hitTestColumn(cx, cy) {
    // Use elementsRef so this always sees the latest elements (no stale closure)
    const cols = elementsRef.current.filter(e => e.type === 'column')
    for (const col of cols) {
      const colW = (col.w || 220) + 40  // +40px generous margin
      const numImages = (col.content.images || []).length
      const colH = numImages * 220 + 80 // generous estimate
      if (cx >= col.x - 20 && cx <= col.x + colW && cy >= col.y - 20 && cy <= col.y + colH) {
        return col.id
      }
    }
    return null
  }

  function handleImageDragMove(imageEl, nx, ny) {
    const cx = nx + (imageEl.w || 200) / 2
    const cy = ny + 80
    setDropOverColumnId(hitTestColumn(cx, cy))
  }

  async function handleImageDragEnd(imageEl, nx, ny) {
    setDropOverColumnId(null)
    const cx = nx + (imageEl.w || 200) / 2
    const cy = ny + 80
    const colId = hitTestColumn(cx, cy)
    if (!colId) return
    const col = elementsRef.current.find(e => e.id === colId)
    if (!col) return
    try {
      await deleteElement(imageEl.id)
      const updated = {
        ...col,
        content: { ...col.content, images: [...(col.content.images || []), { id: uid(), src: imageEl.content.src }] }
      }
      await saveElement(updated)
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
        id: uid(),
        parentId: boardId,
        name: name.trim(),
        x: pendingPos.x,
        y: pendingPos.y,
        createdAt: Date.now()
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

  async function handleImageSave(imageData) {
    await addElement('image', pendingPos, { src: imageData })
    setShowImagePicker(false)
  }

  async function handleFiles(files) {
    for (const file of files) {
      const isImage = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf'
      const isDoc = file.name.match(/\.(doc|docx)$/i)

      if (isImage) {
        const data = await compressImage(file)
        await addElement('image', { x: pendingPos.x + Math.random() * 40, y: pendingPos.y + Math.random() * 40 }, { src: data })
      } else if (isPdf || isDoc) {
        await addElement('document', { x: pendingPos.x + Math.random() * 40, y: pendingPos.y + Math.random() * 40 }, {
          name: file.name,
          type: file.type,
          src: await fileToBase64(file)
        })
      }
    }
    await load()
  }

  async function pasteFromClipboard() {
    // Try clipboard API (works on HTTPS / desktop)
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith('image/'))
        if (imgType) {
          const blob = await item.getType(imgType)
          const data = await compressImage(blob)
          await addElement('image', pendingPos, { src: data })
          return
        }
      }
    } catch {}
    // Fallback: open photo picker (iOS saves screenshots to Photos)
    fileRef.current.click()
  }

  if (!board) return null

  return (
    <div className="screen">
      <header className="top-bar">
        <button className="back-btn" onClick={onBack}>‹</button>
        <span className="board-title">{board.name}</span>
        <button className="paste-img-btn" onClick={pasteFromClipboard} title="Add screenshot">📷</button>
        <button className="home-btn" onClick={onHome}>⌂</button>
      </header>

      <Canvas onClick={pos => { setPendingPos(pos); setSelectedId(null); setEditingId(null) }} scaleRef={scaleRef}>
        {/* Child board icons */}
        {childBoards.map(b => (
          <DraggableCard key={b.id} x={b.x} y={b.y} scaleRef={scaleRef}
            alwaysDraggable
            onMove={(x, y) => moveChildBoard(b.id, x, y)}
            onTap={() => onOpenBoard(b.id)}
          >
            <div className="board-icon-card">
              <div className="board-icon-emoji">📋</div>
              <div className="board-icon-name">{b.name}</div>
              <button className="card-delete-btn"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); removeChildBoard(b.id) }}
              >×</button>
            </div>
          </DraggableCard>
        ))}

        {/* Elements */}
        {elements.map(el => (
          <DraggableCard key={el.id} x={el.x} y={el.y} scaleRef={scaleRef}
            selected={selectedId === el.id}
            onMove={(x, y) => moveElement(el.id, x, y)}
            onDragMove={el.type === 'image' ? (nx, ny) => handleImageDragMove(el, nx, ny) : undefined}
            onDragEnd={el.type === 'image' ? (nx, ny) => handleImageDragEnd(el, nx, ny) : undefined}
            onTap={() => {
              if (selectedId === el.id) {
                if (el.type === 'link' && el.content.url) {
                  window.open(el.content.url, '_blank')
                } else if (el.type === 'color' || el.type === 'text' || el.type === 'note' || el.type === 'todo' || el.type === 'link') {
                  setEditingId(el.id)
                }
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
              onDelete={() => { removeElement(el.id); setSelectedId(null) }}
              onStopEdit={() => setEditingId(null)}
              onEdit={() => setEditingId(el.id)}
              onResize={(w, h) => resizeElement(el.id, w, h)}
              onColor={color => colorElement(el.id, color)}
              onMakeColumn={() => makeColumn(el)}
              onAddColumnImage={() => { setColumnTarget(el.id); columnFileRef.current.click() }}
              onRemoveColumnImage={imgId => removeImageFromColumn(el.id, imgId)}
              isDropTarget={dropOverColumnId === el.id}
              scaleRef={scaleRef}
            />
          </DraggableCard>
        ))}
      </Canvas>

      <BottomNav onAction={handleNavAction} setPendingPos={setPendingPos} />

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => handleFiles(Array.from(e.target.files))} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,image/*" multiple style={{ display: 'none' }}
        onChange={e => handleFiles(Array.from(e.target.files))} />
      <input ref={columnFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={async e => {
          if (!columnTarget) return
          for (const file of Array.from(e.target.files)) {
            const src = await compressImage(file)
            await addImageToColumn(columnTarget, src)
          }
          setColumnTarget(null)
          e.target.value = ''
        }} />

      {showImagePicker && (
        <ImagePicker
          onSave={handleImageSave}
          onClose={() => setShowImagePicker(false)}
          boardId={boardId}
        />
      )}

      {undoVisible && (
        <div className="undo-toast">
          <span>Item apagado</span>
          <button className="undo-btn" onClick={undo}>Desfazer</button>
          <button className="undo-close" onClick={() => setUndoVisible(false)}>×</button>
        </div>
      )}
    </div>
  )
}

function ElementCard({ el, selected, editing, onUpdate, onDelete, onStopEdit, onEdit, onResize, onColor, onMakeColumn, onAddColumnImage, onRemoveColumnImage, isDropTarget, scaleRef }) {
  const props = { el, selected, editing, onUpdate, onDelete, onStopEdit, onEdit, onResize, onColor, onMakeColumn, onAddColumnImage, onRemoveColumnImage, isDropTarget, scaleRef }
  switch (el.type) {
    case 'image': return <ImageCard {...props} />
    case 'note': return <TextCard {...props} />
    case 'text': return <TextCard {...props} />
    case 'link': return <LinkCard {...props} />
    case 'todo': return <TodoCard {...props} />
    case 'document': return <DocumentCard {...props} />
    case 'column': return <ColumnCard {...props} />
    case 'color': return <ColorCard {...props} />
    default: return null
  }
}

function ImageCard({ el, selected, onDelete, onResize, onMakeColumn, scaleRef }) {
  const w = el.w || 200

  async function copyImage(e) {
    e.stopPropagation()
    try {
      const res = await fetch(el.content.src)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/jpeg': blob })])
    } catch {
      try {
        const res = await fetch(el.content.src)
        const blob = await res.blob()
        await navigator.share({ files: [new File([blob], 'image.jpg', { type: 'image/jpeg' })] })
      } catch {}
    }
  }

  async function shareImage(e) {
    e.stopPropagation()
    try {
      const res = await fetch(el.content.src)
      const blob = await res.blob()
      await navigator.share({ files: [new File([blob], 'image.jpg', { type: 'image/jpeg' })] })
    } catch {}
  }

  return (
    <div style={{ position: 'relative', width: w }}>
      {selected && (
        <div className="img-popup-menu" onPointerDown={e => e.stopPropagation()}>
          <button className="img-popup-btn" onClick={e => { e.stopPropagation(); onMakeColumn?.() }}>+ Column</button>
          <button className="img-popup-btn" onClick={copyImage}>Copy</button>
          <button className="img-popup-btn" onClick={shareImage}>Share</button>
          <button className="img-popup-btn img-popup-delete" onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        </div>
      )}
      <div className={`el-card el-image ${selected ? 'selected' : ''}`} style={{ width: w }}>
        <img src={el.content.src} alt="" draggable={false} style={{ width: '100%', height: 'auto', display: 'block' }} />
        {selected && <ResizeHandle w={w} h={null} onResize={(nw) => onResize(nw, null)} minW={80} scaleRef={scaleRef} />}
      </div>
    </div>
  )
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16)
  const g = parseInt(hex.slice(3,5), 16)
  const b = parseInt(hex.slice(5,7), 16)
  return { r, g, b }
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s, l = (max + min) / 2
  if (max === min) { h = s = 0 } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      default: h = ((r - g) / d + 4) / 6
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function ColorCard({ el, selected, onUpdate, onDelete }) {
  const color = el.content.color || '#e8315a'
  const { r, g, b } = hexToRgb(color)
  const { h, s, l } = rgbToHsl(r, g, b)
  const isDark = l < 50
  const textColor = isDark ? '#fff' : '#111'

  return (
    <div
      className={`el-card el-color-card ${selected ? 'selected' : ''}`}
      style={{ background: color }}
    >
      <div className="drag-handle" style={{ background: 'rgba(0,0,0,0.12)' }}>
        <span className="handle-dots" style={{ color: textColor, opacity: 0.6 }}>⠿</span>
        {selected && <button className="handle-delete" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      {/* input[type=color] is in DraggableCard INTERACTIVE set — tap goes straight to native picker */}
      <div className="color-card-swatch-row">
        <input
          type="color"
          value={color}
          className="color-card-input-native"
          onChange={e => onUpdate({ ...el.content, color: e.target.value })}
        />
        <span className="color-card-tap-hint" style={{ color: textColor }}>tap circle to pick</span>
      </div>
      <div className="color-card-codes" style={{ color: textColor }}>
        <div className="color-code-row"><span className="color-code-label">HEX</span><span className="color-code-val">{color.toUpperCase()}</span></div>
        <div className="color-code-row"><span className="color-code-label">RGB</span><span className="color-code-val">{r}, {g}, {b}</span></div>
        <div className="color-code-row"><span className="color-code-label">HSL</span><span className="color-code-val">{h}°, {s}%, {l}%</span></div>
      </div>
    </div>
  )
}

function ColumnCard({ el, selected, isDropTarget, onDelete, onResize, onAddColumnImage, onRemoveColumnImage, scaleRef }) {
  const w = el.w || 220
  const images = el.content.images || []

  return (
    <div className={`el-card el-column ${selected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''}`} style={{ width: w }}>
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        <span className="column-label">Column</span>
        {selected && (
          <>
            <button className="img-action-btn col-add-btn" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onAddColumnImage?.() }}>+ Add</button>
            <button className="handle-delete" onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
          </>
        )}
      </div>
      <div className="column-images">
        {images.map(img => (
          <div key={img.id} className="column-img-wrap">
            <img src={img.src} alt="" draggable={false} style={{ width: '100%', display: 'block' }} />
            {selected && (
              <button className="col-img-remove" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onRemoveColumnImage?.(img.id) }}>×</button>
            )}
          </div>
        ))}
      </div>
      {selected && <ResizeHandle w={w} h={null} onResize={(nw) => onResize(nw, null)} minW={100} scaleRef={scaleRef} />}
    </div>
  )
}

function NoteCard({ el, selected, editing, onUpdate, onDelete, onStopEdit }) {
  const ref = useRef()
  useEffect(() => {
    if (editing && ref.current) setTimeout(() => ref.current?.focus(), 50)
  }, [editing])

  return (
    <div className={`el-card el-note ${selected ? 'selected' : ''}`}>
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        {selected && <button className="handle-delete" onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      <textarea
        ref={ref}
        className="card-textarea"
        value={el.content.text || ''}
        onChange={e => onUpdate({ ...el.content, text: e.target.value })}
        placeholder="Write a note…"
      />
    </div>
  )
}

function TextCard({ el, selected, editing, onUpdate, onDelete, onResize, scaleRef }) {
  const ref = useRef()
  const fontSize = el.content.fontSize || 20
  const w = el.w || 220
  const h = el.h || 120

  useEffect(() => {
    if (editing && ref.current) setTimeout(() => ref.current?.focus(), 50)
  }, [editing])

  return (
    <div
      className={`el-card el-text ${selected ? 'selected' : ''} ${editing ? 'editing' : ''}`}
      style={{ width: w, height: h }}
    >
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        {selected && <button className="handle-delete" onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      <textarea
        ref={ref}
        className="card-textarea card-textarea-text"
        style={{ fontSize: `${fontSize}px`, height: h - 28 }}
        value={el.content.text || ''}
        onChange={e => onUpdate({ ...el.content, text: e.target.value })}
        placeholder="Tap to type…"
      />
      {selected && <ResizeHandle w={w} h={h} onResize={onResize} minW={120} minH={60} scaleRef={scaleRef} />}
    </div>
  )
}

function LinkCard({ el, selected, editing, onUpdate, onDelete, onStopEdit, onEdit, onResize, scaleRef }) {
  const ref = useRef()
  useEffect(() => {
    if (editing && ref.current) setTimeout(() => ref.current?.focus(), 50)
  }, [editing])

  async function pasteUrl() {
    try {
      const text = await navigator.clipboard.readText()
      onUpdate({ ...el.content, url: text })
    } catch { ref.current?.focus() }
  }

  const w = el.w || 260

  return (
    <div className={`el-card el-link ${selected ? 'selected' : ''}`} style={{ width: w }}>
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        {selected && <button className="handle-edit" onClick={e => { e.stopPropagation(); onEdit?.() }}>✎</button>}
        {selected && <button className="handle-delete" onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      {editing ? (
        <div className="link-edit-col">
          <div className="link-edit-row">
            <input
              ref={ref}
              className="card-input"
              value={el.content.url || ''}
              onChange={e => onUpdate({ ...el.content, url: e.target.value })}
              placeholder="https://…"
            />
            <button className="paste-btn" onMouseDown={e => e.preventDefault()} onClick={pasteUrl}>📋</button>
          </div>
          <button className="btn-primary" style={{marginTop:6}} onMouseDown={e => e.preventDefault()} onClick={onStopEdit}>Done</button>
        </div>
      ) : (
        <div className="card-link-display">
          {el.content.url
            ? <a className="card-link-text" href={el.content.url} target="_blank" rel="noreferrer">🔗 {shortUrl(el.content.url)}</a>
            : <span className="placeholder">Tap to add link</span>
          }
        </div>
      )}
      {selected && <ResizeHandle w={w} h={null} onResize={(nw) => onResize(nw, null)} minW={160} scaleRef={scaleRef} />}
    </div>
  )
}

function shortUrl(url) {
  try {
    const u = new URL(url)
    const path = u.pathname.length > 20 ? u.pathname.slice(0, 20) + '…' : u.pathname
    return u.hostname.replace('www.', '') + path
  } catch { return url.length > 40 ? url.slice(0, 40) + '…' : url }
}

function TodoCard({ el, selected, editing, onUpdate, onDelete, onStopEdit, onResize, scaleRef }) {
  const items = el.content.items?.length ? el.content.items : [{ text: '', done: false }]
  const w = el.w || 260

  function toggleItem(i) {
    const updated = items.map((item, idx) => {
      if (idx !== i) return item
      const t = typeof item === 'object' ? item : { text: item, done: false }
      return { ...t, done: !t.done }
    })
    onUpdate({ ...el.content, items: updated })
  }

  function updateItem(i, text) {
    const updated = items.map((item, idx) => {
      if (idx !== i) return item
      const t = typeof item === 'object' ? item : { text: item, done: false }
      return { ...t, text }
    })
    onUpdate({ ...el.content, items: updated })
  }

  function addItem() {
    onUpdate({ ...el.content, items: [...items, { text: '', done: false }] })
  }

  function removeItem(i) {
    const updated = items.filter((_, idx) => idx !== i)
    onUpdate({ ...el.content, items: updated.length ? updated : [{ text: '', done: false }] })
  }

  return (
    <div className={`el-card el-todo ${selected ? 'selected' : ''}`} style={{ width: w }}>
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        {selected && <button className="handle-delete" onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      {items.map((item, i) => {
        const text = typeof item === 'object' ? item.text : item
        const done = typeof item === 'object' ? item.done : false
        return (
          <div key={i} className="todo-item">
            <input type="checkbox" checked={done} onChange={() => toggleItem(i)} />
            <input
              className={`todo-input ${done ? 'done' : ''}`}
              value={text}
              onChange={e => updateItem(i, e.target.value)}
              placeholder="Task…"
            />
            {editing && (
              <button className="todo-remove" onClick={() => removeItem(i)}>×</button>
            )}
          </div>
        )
      })}
      <button className="todo-add" onClick={addItem}>+ Add item</button>
      {selected && <ResizeHandle w={w} h={null} onResize={(nw) => onResize(nw, null)} minW={160} scaleRef={scaleRef} />}
    </div>
  )
}

function DocumentCard({ el, selected, onDelete }) {
  const isPdf = el.content.type === 'application/pdf'

  function openDoc(e) {
    e.stopPropagation()
    if (!el.content.src) return
    const byteStr = atob(el.content.src.split(',')[1])
    const mime = el.content.type || 'application/octet-stream'
    const ab = new ArrayBuffer(byteStr.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i)
    const blob = new Blob([ab], { type: mime })
    const blobUrl = URL.createObjectURL(blob)
    // Use <a> click — more reliable than window.open on iOS Safari
    const a = document.createElement('a')
    a.href = blobUrl
    a.target = '_blank'
    a.rel = 'noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
  }

  return (
    <div className={`el-card el-document ${selected ? 'selected' : ''}`}>
      <div className="drag-handle">
        <span className="handle-dots">⠿</span>
        {selected && <button className="handle-delete" onClick={e => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      <div className="doc-icon">{isPdf ? '📄' : '📝'}</div>
      <div className="doc-name">{el.content.name}</div>
      {el.content.src && (
        <button className="doc-open" onPointerDown={e => e.stopPropagation()} onClick={openDoc}>
          Open
        </button>
      )}
    </div>
  )
}

function ResizeHandle({ w, h, onResize, minW = 100, minH = 60, scaleRef }) {
  const startPtr = useRef(null)

  function onPointerDown(e) {
    e.stopPropagation()
    e.preventDefault()
    startPtr.current = { x: e.clientX, y: e.clientY, w, h }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!startPtr.current) return
    const s = scaleRef?.current ?? 1
    const dx = (e.clientX - startPtr.current.x) / s
    const dy = (e.clientY - startPtr.current.y) / s
    const newW = Math.max(minW, (startPtr.current.w || 220) + dx)
    const newH = h !== null ? Math.max(minH, (startPtr.current.h || 120) + dy) : null
    onResize(newW, newH)
  }

  function onPointerUp() { startPtr.current = null }

  return (
    <div
      className="resize-handle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
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
