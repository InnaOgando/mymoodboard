import { useState, useEffect, useRef } from 'react'
import { uid } from '../utils.js'
import { getBoards, saveBoard, deleteBoard } from '../db'
import { supabase } from '../supabase'
import Canvas from './Canvas'
import DraggableCard from './DraggableCard'

export default function HomeScreen({ onOpenBoard, session }) {
  const [boards, setBoards] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPos, setNewPos] = useState({ x: 100, y: 100 })
  const scaleRef = useRef(1)
  const boardsRef = useRef([])

  useEffect(() => { boardsRef.current = boards }, [boards])
  useEffect(() => { load() }, [])

  async function load() {
    const list = await getBoards(null)
    setBoards(list)
  }

  async function createBoard() {
    const name = newName.trim()
    if (!name) { alert('Please type a name first'); return }
    const board = {
      id: uid(),
      parentId: null,
      name,
      x: newPos.x,
      y: newPos.y,
      createdAt: Date.now()
    }
    await saveBoard(board)
    setBoards(prev => [...prev, board])
    setNewName('')
    setShowNew(false)
  }

  async function moveBoard(id, x, y) {
    const board = boardsRef.current.find(b => b.id === id)
    if (!board) return
    const updated = { ...board, x, y }
    await saveBoard(updated)
    setBoards(prev => prev.map(b => b.id === id ? updated : b))
  }

  async function removeBoard(id) {
    if (!confirm('Delete this board and everything in it?')) return
    setBoards(prev => prev.filter(b => b.id !== id))
    setSelectedId(null)
    deleteBoard(id) // fire and forget
  }

  function handleCanvasClick(pos) {
    if (selectedId) { setSelectedId(null); return }
    setNewPos(pos)
    setShowNew(true)
  }

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
              if (selectedId === board.id) {
                onOpenBoard(board.id)
              } else {
                setSelectedId(board.id)
              }
            }}
          >
            <div className={`board-icon-card ${selectedId === board.id ? 'selected' : ''}`}>
              <div className="board-icon-emoji">📋</div>
              <div className="board-icon-name">{board.name}</div>
              {selectedId === board.id && (
                <button
                  className="card-delete-btn"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); removeBoard(board.id) }}
                >×</button>
              )}
            </div>
          </DraggableCard>
        ))}
      </Canvas>

      <div className="bottom-bar home-bottom">
        <button className="add-board-btn" onClick={() => { setSelectedId(null); setNewPos({ x: 120, y: 120 }); setShowNew(true) }}>
          <span className="add-board-icon">⊕</span>
          <span>New Board</span>
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
