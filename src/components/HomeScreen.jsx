import { useState, useEffect, useRef } from 'react'
import { uid } from '../utils.js'
import { getBoards, saveBoard, deleteBoard, getStorageUsage, STORAGE_LIMIT_BYTES, exportAllData, importAllData } from '../db'
import { cacheAllBoardsInBackground, flushPendingImageUploads } from '../ImageImportService'
import { supabase } from '../supabase'
import Canvas from './Canvas'
import DraggableCard from './DraggableCard'
import { PRESET_COLORS } from '../colors'

function randomColor() {
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
}

const BOARD_W = 148
const BOARD_H = 130
const VP_KEY = 'refmemo_home_vp'

function saveViewport(offsetRef, scaleRef) {
  sessionStorage.setItem(VP_KEY, JSON.stringify({
    x: offsetRef.current.x,
    y: offsetRef.current.y,
    scale: scaleRef.current,
  }))
}

// Set canvas offset so existing boards are centered in the viewport.
function centerOnBoards(boards, containerRef, offsetRef, scaleRef) {
  if (!boards.length || !containerRef.current) return
  const rect = containerRef.current.getBoundingClientRect()
  const scale = scaleRef.current || 1
  const xs = boards.map(b => b.x)
  const ys = boards.map(b => b.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...boards.map(b => b.x + BOARD_W))
  const minY = Math.min(...ys)
  const maxY = Math.max(...boards.map(b => b.y + BOARD_H))
  offsetRef.current = {
    x: rect.width  / 2 - ((minX + maxX) / 2) * scale,
    y: rect.height / 2 - ((minY + maxY) / 2) * scale,
  }
}

// Place new board to the right of the rightmost board; wrap to a new row if needed.
// viewportW is the usable canvas width in canvas coordinates.
function findNextBoardPos(boards, viewportW = 800) {
  const GAP = 24
  const START = { x: 80, y: 80 }
  const MAX_ROW_X = Math.max(viewportW - BOARD_W - GAP, START.x + BOARD_W)

  if (!boards.length) return START

  const sorted = [...boards].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)

  const rows = []
  for (const b of sorted) {
    const row = rows.find(r => Math.abs(r.y - b.y) < BOARD_H * 0.8)
    if (row) { row.boards.push(b); row.y = Math.min(row.y, b.y) }
    else rows.push({ y: b.y, boards: [b] })
  }

  const lastRow = rows[rows.length - 1]
  const rightmost = lastRow.boards.reduce((m, b) => b.x > m.x ? b : m, lastRow.boards[0])
  const nextX = rightmost.x + BOARD_W + GAP

  if (nextX + BOARD_W <= MAX_ROW_X) {
    return { x: nextX, y: lastRow.y }
  }

  const lowestY = Math.max(...boards.map(b => b.y))
  return { x: START.x, y: lowestY + BOARD_H + GAP }
}

export default function HomeScreen({ onOpenBoard, session }) {
  const [boards, setBoards] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const scaleRef = useRef(1)
  const canvasContainerRef = useRef()
  const canvasOffsetRef = useRef({ x: 40, y: 40 })
  const boardsRef = useRef([])

  useEffect(() => { boardsRef.current = boards }, [boards])
  useEffect(() => { load() }, [])

  async function load() {
    // Restore saved viewport BEFORE setBoards so Canvas applies it on first render
    const saved = sessionStorage.getItem(VP_KEY)
    if (saved) {
      try {
        const { x, y, scale } = JSON.parse(saved)
        canvasOffsetRef.current = { x, y }
        scaleRef.current = scale
      } catch {}
    }

    const list = await getBoards(null, {
      onSync: boards => {
        if (!saved && boards.length) centerOnBoards(boards, canvasContainerRef, canvasOffsetRef, scaleRef)
        setBoards(boards)
        cacheAllBoardsInBackground(boards)
      }
    })

    if (!saved && list.length) centerOnBoards(list, canvasContainerRef, canvasOffsetRef, scaleRef)
    setBoards(list)
  }

  function handleOpenBoard(id) {
    saveViewport(canvasOffsetRef, scaleRef)
    onOpenBoard(id)
  }

  function getViewportW() {
    const el = canvasContainerRef.current
    if (!el) return 800
    const scale = scaleRef.current || 1
    return el.getBoundingClientRect().width / scale
  }

  async function createBoard() {
    const name = newName.trim()
    if (!name) { alert('Please type a name first'); return }
    const pos = findNextBoardPos(boardsRef.current, getViewportW())
    const board = {
      id: uid(),
      parentId: null,
      name,
      color: randomColor(),
      x: pos.x,
      y: pos.y,
      createdAt: Date.now()
    }
    setBoards(prev => [...prev, board])
    setNewName('')
    setShowNew(false)
    saveBoard(board).catch(e => console.error('[createBoard] saveBoard failed:', e))
  }

  function moveBoard(id, x, y) {
    const board = boardsRef.current.find(b => b.id === id)
    if (!board) return
    const updated = { ...board, x, y }
    setBoards(prev => prev.map(b => b.id === id ? updated : b))
    saveBoard(updated).catch(e => console.error('[moveBoard] saveBoard failed:', e))
  }

  function changeBoardColor(id, color) {
    const board = boardsRef.current.find(b => b.id === id)
    if (!board) return
    const updated = { ...board, color }
    setBoards(prev => prev.map(b => b.id === id ? updated : b))
    saveBoard(updated).catch(e => console.error('[changeBoardColor] saveBoard failed:', e))
  }

  function renameBoard(id, name) {
    const board = boardsRef.current.find(b => b.id === id)
    if (!board || !name.trim()) return
    const updated = { ...board, name: name.trim() }
    setBoards(prev => prev.map(b => b.id === id ? updated : b))
    saveBoard(updated).catch(e => console.error('[renameBoard] saveBoard failed:', e))
  }

  async function removeBoard(id) {
    if (!confirm('Delete this board and everything in it?')) return
    setBoards(prev => prev.filter(b => b.id !== id))
    setSelectedId(null)
    deleteBoard(id)
  }

  function handleCanvasClick() {
    setSelectedId(null)
  }

  const selectedBoard = boards.find(b => b.id === selectedId)

  const [usage, setUsage] = useState({ bytes: 0, limit: STORAGE_LIMIT_BYTES, ratio: 0 })
  useEffect(() => {
    let alive = true
    getStorageUsage().then(u => { if (alive) setUsage(u) })
    return () => { alive = false }
  }, [])

  const [backupMenuOpen, setBackupMenuOpen] = useState(false)
  const [backupTip, setBackupTip] = useState(false)
  const [busy, setBusy] = useState(false)
  const importRef = useRef()

  // Weekly nudge: prompt a backup if it's been over 7 days (or never).
  useEffect(() => {
    const last = Number(localStorage.getItem('refmemo_last_backup') || 0)
    if (!last || (Date.now() - last) / 86400000 >= 7) setBackupTip(true)
  }, [])

  async function handleExport() {
    setBusy(true)
    try {
      const data = await exportAllData()
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `refmemo-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 8000)
      localStorage.setItem('refmemo_last_backup', String(Date.now()))
      setBackupTip(false); setBackupMenuOpen(false)
    } catch (err) { alert('Export failed: ' + err.message) }
    setBusy(false)
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setBusy(true)
    try {
      const data = JSON.parse(await file.text())
      await importAllData(data)
      await flushPendingImageUploads()
      getBoards().then(setBoards)
      getStorageUsage().then(setUsage)
      alert('Backup restored!')
    } catch (err) { alert('Invalid file: ' + err.message) }
    e.target.value = ''
    setBusy(false); setBackupMenuOpen(false)
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <span className="app-title">RefMemo</span>
        <div className="top-bar-right">
          <div className="storage-meter" title={`${Math.round(usage.bytes / 1048576)} MB of 150 MB`}>
            <div className="storage-meter-track">
              <div className="storage-meter-fill" style={{ width: `${Math.min(100, usage.ratio * 100)}%`, background: usage.ratio >= 1 ? '#e8315a' : usage.ratio >= 0.8 ? '#f5a623' : '#3bb273' }} />
            </div>
            <span className="storage-meter-label">{Math.round(usage.bytes / 1048576)}/150 MB</span>
          </div>
          <button className="logout-btn" title="Backup / Restore" onClick={() => setBackupMenuOpen(true)}>⋯</button>
          <button className="logout-btn" title="Sign out" onClick={() => supabase.auth.signOut()}>↪</button>
        </div>
      </header>

      <Canvas onClick={handleCanvasClick} scaleRef={scaleRef} containerRef={canvasContainerRef} offsetRef={canvasOffsetRef}>
        {boards.map(board => (
          <DraggableCard
            key={board.id}
            x={board.x}
            y={board.y}
            scaleRef={scaleRef}
            selected={selectedId === board.id}
            onMove={(x, y) => moveBoard(board.id, x, y)}
            onTap={() => {
              if (selectedId === board.id) handleOpenBoard(board.id)
              else setSelectedId(board.id)
            }}
          >
            <div className={`board-icon-card ${selectedId === board.id ? 'selected' : ''}`}>
              <div className="board-color-dot" style={{ background: board.color || '#b3b8c0' }} />
              <div className="board-icon-name">{board.name}</div>
            </div>
          </DraggableCard>
        ))}
      </Canvas>

      <div className="bottom-bar home-bottom">
        <button
          className="board-manage-btn"
          disabled={!selectedId}
          onClick={() => setBoardMenuOpen(true)}
        >
          Board ▼
        </button>
        <button className="add-board-btn" onClick={() => { setSelectedId(null); setShowNew(true) }}>
          <span className="add-board-icon">⊕</span>
          <span>New Board</span>
        </button>
      </div>

      <input ref={importRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImport} />

      {/* Backup menu */}
      {backupMenuOpen && (
        <div className="modal-overlay" onClick={() => setBackupMenuOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>Backup</h3>
            <div className="board-menu-list">
              <button className="board-menu-item" disabled={busy} onClick={handleExport}>⬇︎ Export my data</button>
              <button className="board-menu-item" disabled={busy} onClick={() => importRef.current?.click()}>⬆︎ Restore from backup</button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 10, lineHeight: 1.4 }}>
              Includes all your boards, notes and images in a single file. Save it on your computer.
            </p>
          </div>
        </div>
      )}

      {/* Weekly backup reminder */}
      {backupTip && (
        <div className="modal-overlay" onClick={() => setBackupTip(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Back up your data 💾</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '8px 0 4px', lineHeight: 1.45 }}>
              We recommend exporting a copy of your boards and images once a week. Save the file on your computer.
            </p>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setBackupTip(false)}>Later</button>
              <button className="btn-primary" disabled={busy} onClick={handleExport}>Export now</button>
            </div>
          </div>
        </div>
      )}

      {/* New board modal */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>New Board</h3>
            <form onSubmit={e => { e.preventDefault(); createBoard() }}>
              <input autoFocus className="text-input" placeholder="Board name…"
                value={newName} onChange={e => setNewName(e.target.value)} />
              <div className="modal-actions" style={{ marginTop: '12px' }}>
                <button type="button" className="btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Board management menu */}
      {boardMenuOpen && selectedBoard && (
        <div className="modal-overlay" onClick={() => setBoardMenuOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>{selectedBoard.name}</h3>
            <div className="board-menu-list">
              <button className="board-menu-item" onClick={() => {
                setBoardMenuOpen(false)
                setRenameValue(selectedBoard.name)
                setShowRename(true)
              }}>
                ✎ Rename Board
              </button>
              <button className="board-menu-item" onClick={() => {
                setBoardMenuOpen(false)
                setShowColorPicker(true)
              }}>
                ● Change Board Color
              </button>
              <button className="board-menu-item board-menu-danger" onClick={() => {
                setBoardMenuOpen(false)
                removeBoard(selectedId)
              }}>
                × Delete Board
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename modal */}
      {showRename && selectedBoard && (
        <div className="modal-overlay" onClick={() => setShowRename(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Rename Board</h3>
            <form onSubmit={e => {
              e.preventDefault()
              renameBoard(selectedId, renameValue)
              setShowRename(false)
            }}>
              <input autoFocus className="text-input" value={renameValue}
                onChange={e => setRenameValue(e.target.value)} />
              <div className="modal-actions" style={{ marginTop: '12px' }}>
                <button type="button" className="btn-ghost" onClick={() => setShowRename(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Color picker modal */}
      {showColorPicker && selectedBoard && (
        <div className="modal-overlay" onClick={() => setShowColorPicker(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Board Color</h3>
            <div className="board-color-swatches" style={{ justifyContent: 'center', padding: '12px 0' }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className="board-swatch"
                  style={{
                    background: c,
                    outline: selectedBoard.color === c ? '3px solid #333' : 'none',
                    outlineOffset: '2px',
                    width: 32,
                    height: 32,
                  }}
                  onClick={() => {
                    changeBoardColor(selectedId, c)
                    setShowColorPicker(false)
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
