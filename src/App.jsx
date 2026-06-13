import { useState, useEffect } from 'react'
import HomeScreen from './components/HomeScreen'
import BoardScreen from './components/BoardScreen'
import './App.css'

export default function App() {
  // stack of board IDs — [] means home, [..., id] means inside boards
  const [boardStack, setBoardStack] = useState([])

  function openBoard(id) {
    setBoardStack(prev => [...prev, id])
  }

  function goBack() {
    setBoardStack(prev => prev.slice(0, -1))
  }

  function goHome() {
    setBoardStack([])
  }

  const currentBoard = boardStack[boardStack.length - 1] ?? null

  return (
    <div className="app">
      {currentBoard ? (
        <BoardScreen
          boardId={currentBoard}
          boardStack={boardStack}
          onOpenBoard={openBoard}
          onBack={goBack}
          onHome={goHome}
        />
      ) : (
        <HomeScreen onOpenBoard={openBoard} />
      )}
    </div>
  )
}
