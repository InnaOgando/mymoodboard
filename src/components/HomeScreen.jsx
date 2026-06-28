import { useState, useEffect, useRef } from 'react'
import { uid } from '../utils.js'
import { getBoards, saveBoard, deleteBoard } from '../db'
import { supabase } from '../supabase'
import Canvas from './Canvas'
import DraggableCard from './DraggableCard'
import { PRESET_COLORS } from '../colors'

function randomColor() {
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
}

// Place new board to the right of the rightmost board; wrap to a new row if needed
function findNextBoardPos(boards) {
  const BOARD_W = 148
  const BOARD_H = 130
  const GAP = 24
  const MAX_ROW_X = 640
  const START = { x: 80, y: 80 }

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
  const boardsRef = useRef([])

  useEffect(() => { boardsRef.current = boards }, [boards])
  useEffect(() => { load() }, [])

  async function load() {
    const list = await getBoards(null, { onSync: setBoards })
    setBoards(list)
  }

  async function createBoard() {
    const name = newName.trim()
    if (!name) { alert('Please type a name first'); return }
    const pos = findNextBoardPos(boardsRef.current)
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

  return (
    <div className="screen">
      <header className="top-bar">
        <span className="app-title">RefMemo</span>
        <button className="logout-btn" title="Sair" onClick={() => supabase.auth.signOut()}>↪</button>
      </header>

      <Canvas onClick={handleCanvasClick} scaleRef={scaleRef}>
        {boards.map(board => (
          <DraggableCard
            key={board.id}
            x={board.x}
            y={board.y}
            scaleRef={scaleRef}
            selected={selectedId === board.id}
            onMove={(x, y) => moveBoard(board.id, x, y)}
            onTap={() => {
              if (selectedId === board.id) onOpenBoard(board.id)
              else setSelectedId(board.id)
            }}
          >
            <div className={`board-icon-card ${selectedId === board.id ? 'selected' : ''}`}>
              <div className="board-color-dot" style={{ background: board.color || '#e8315a' }} />
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
