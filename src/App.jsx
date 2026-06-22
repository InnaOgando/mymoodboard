import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import HomeScreen from './components/HomeScreen'
import BoardScreen from './components/BoardScreen'
import AuthScreen from './components/AuthScreen'
import './App.css'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [boardStack, setBoardStack] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  function openBoard(id) { setBoardStack(prev => [...prev, id]) }
  function goBack() { setBoardStack(prev => prev.slice(0, -1)) }
  function goHome() { setBoardStack([]) }

  // Loading
  if (session === undefined) {
    return <div className="auth-screen"><div className="auth-loading">…</div></div>
  }

  // Not logged in
  if (!session) return <AuthScreen />

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
        <HomeScreen onOpenBoard={openBoard} session={session} />
      )}
    </div>
  )
}
