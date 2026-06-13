import { useState, useEffect } from 'react'
import { uid } from '../utils.js'
import { getBoards, saveBoard, deleteBoard } from '../db'
import Canvas from './Canvas'
import DraggableCard from './DraggableCard'

export default function HomeScreen({ onOpenBoard }) {
  const [boards, setBoards] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPos, setNewPos] = useState({ x: 100, y: 100 })
  const [scale, setScale] = useState(1)

  useEffect(() => { load() }, [])

  async function load() {
    const list = await getBoards(null)
    setBoards(list)
  }

  async function createBoard() {
    const name = newName.trim()
    if (!name) { alert('Please type a name first'); return }
    try {
      const board = {
        id: uid(),
        parentId: null,
        name,
        x: newPos.x,
        y: newPos.y,
        createdAt: Date.now()
      }
      await saveBoard(board)
      setNewName('')
      setShowNew(false)
      await load()
    } catch (e) {
      alert('Error creating board: ' + e.message)
    }
  }

  async function moveBoard(id, x, y) {
    const board = boards.find(b => b.id === id)
    if (!board) return
    const updated = { ...board, x, y }
    await saveBoard(updated)
    setBoards(prev => prev.map(b => b.id === id ? updated : b))
  }

  async function removeBoard(id) {
    if (!confirm('Delete this board and everything in it?')) return
    await deleteBoard(id)
    await load()
  }

  function handleCanvasClick(pos) {
    setNewPos(pos)
    setShowNew(true)
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <span className="app-title">RefNest</span>
      </header>

      <Canvas onClick={handleCanvasClick}>
        {boards.map(board => (
          <DraggableCard
            key={board.id}
            x={board.x}
            y={board.y}
            scale={scale}
            onMove={(x, y) => moveBoard(board.id, x, y)}
            onTap={() => onOpenBoard(board.id)}
          >
            <div className="board-icon-card">
              <div className="board-icon-emoji">📋</div>
              <div className="board-icon-name">{board.name}</div>
              <button
                className="card-delete-btn"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); removeBoard(board.id) }}
              >×</button>
            </div>
          </DraggableCard>
        ))}
      </Canvas>

      <div className="bottom-bar home-bottom">
        <button className="add-board-btn" onClick={() => { setNewPos({ x: 120, y: 120 }); setShowNew(true) }}>
          <span className="add-board-icon">⊕</span>
          <span>Board</span>
        </button>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>New Board</h3>
            <form onSubmit={e => { e.preventDefault(); createBoard() }}>
              <input
                autoFocus
                className="text-input"
                placeholder="Board name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <div className="modal-actions" style={{ marginTop: '12px' }}>
                <button type="button" className="btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
