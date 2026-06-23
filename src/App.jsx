import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import HomeScreen from './components/HomeScreen'
import BoardScreen from './components/BoardScreen'
import AuthScreen from './components/AuthScreen'
import './App.css'

function PasswordResetScreen() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { setMsg('Password tem de ter pelo menos 6 caracteres.'); return }
    if (password !== confirm) { setMsg('Passwords não coincidem.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setMsg(error.message)
    else setMsg('Password atualizada! A entrar…')
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-title">RefMemo</div>
        <h3 style={{ marginBottom: 16 }}>Nova Password</h3>
        <form onSubmit={handleSubmit}>
          <input className="auth-input" type="password" placeholder="Nova password" value={password}
            onChange={e => setPassword(e.target.value)} autoFocus />
          <input className="auth-input" type="password" placeholder="Confirmar password" value={confirm}
            onChange={e => setConfirm(e.target.value)} />
          {msg && <div className="auth-message">{msg}</div>}
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? '…' : 'Guardar password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [isRecovery, setIsRecovery] = useState(false)
  const [boardStack, setBoardStack] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true)
      else if (event === 'USER_UPDATED') setIsRecovery(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  function openBoard(id) { setBoardStack(prev => [...prev, id]) }
  function goBack() { setBoardStack(prev => prev.slice(0, -1)) }
  function goHome() { setBoardStack([]) }

  if (session === undefined) {
    return <div className="auth-screen"><div className="auth-loading">…</div></div>
  }

  if (!session) return <AuthScreen />

  if (isRecovery) return <PasswordResetScreen />

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
