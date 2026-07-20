import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import HomeScreen from './components/HomeScreen'
import BoardScreen from './components/BoardScreen'
import AuthScreen from './components/AuthScreen'
import { flushPendingOps, purgeOldDeletions } from './db'
import { flushPendingImageUploads } from './ImageImportService'
import DebugPanel from './components/DebugPanel'
import UpdatePrompt from './components/UpdatePrompt'
import './App.css'

const SHOW_DEBUG = new URLSearchParams(window.location.search).get('debug') === '1'

async function syncOnline() {
  await flushPendingOps()
  await flushPendingImageUploads()
  await purgeOldDeletions()
}

function PasswordResetScreen({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { setMsg('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setMsg('Passwords do not match.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setMsg(error.message)
    } else {
      setMsg('Password updated! Signing in…')
      // Clear recovery flag and let normal auth flow take over after a short delay
      setTimeout(() => onDone(), 1500)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-title">RefMemo</div>
        <h3 style={{ marginBottom: 16 }}>New password</h3>
        <form onSubmit={handleSubmit}>
          <input className="auth-input" type="password" placeholder="New password" value={password}
            onChange={e => setPassword(e.target.value)} autoFocus />
          <input className="auth-input" type="password" placeholder="Confirm password" value={confirm}
            onChange={e => setConfirm(e.target.value)} />
          {msg && <div className="auth-message">{msg}</div>}
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? '…' : 'Save password'}
          </button>
        </form>
      </div>
    </div>
  )
}

/**
 * Detect password-recovery flow from the URL hash.
 * Supabase appends #access_token=...&type=recovery (or ?type=recovery in some flows).
 * We check BEFORE Supabase processes the hash so we can show the reset form
 * immediately, without relying on the PASSWORD_RECOVERY event timing.
 */
function detectRecoveryFromUrl() {
  const hash = window.location.hash
  if (!hash) return false
  try {
    // hash looks like: #access_token=xxx&refresh_token=yyy&type=recovery
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
    return params.get('type') === 'recovery'
  } catch {
    return false
  }
}

export default function App() {
  // isRecovery is a ref so it survives re-renders caused by setSession without being cleared
  const isRecoveryRef = useRef(detectRecoveryFromUrl())
  const [isRecovery, setIsRecovery] = useState(isRecoveryRef.current)
  const [session, setSession] = useState(undefined)
  const [boardStack, setBoardStack] = useState([])

  // Flush queued operations and pending image uploads on mount and on reconnect
  useEffect(() => {
    if (navigator.onLine) syncOnline()
    window.addEventListener('online', syncOnline)
    return () => window.removeEventListener('online', syncOnline)
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Guard: set recovery mode. Use ref so subsequent SIGNED_IN / TOKEN_REFRESHED
        // events don't accidentally clear it.
        isRecoveryRef.current = true
        setIsRecovery(true)
        setSession(s)
      } else if (event === 'USER_UPDATED') {
        // Password was changed — exit recovery mode
        isRecoveryRef.current = false
        setIsRecovery(false)
        setSession(s)
      } else if (event === 'SIGNED_OUT') {
        isRecoveryRef.current = false
        setIsRecovery(false)
        setSession(null)
        // Clear the URL hash so a page refresh doesn't re-trigger recovery
        if (window.location.hash) history.replaceState(null, '', window.location.pathname)
      } else {
        // SIGNED_IN, TOKEN_REFRESHED, INITIAL_SESSION, etc.
        // Only update session; do NOT touch isRecovery — the ref guards it.
        setSession(s)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function openBoard(id) { setBoardStack(prev => [...prev, id]) }
  function goBack() { setBoardStack(prev => prev.slice(0, -1)) }
  function goHome() { setBoardStack([]) }

  function handleRecoveryDone() {
    isRecoveryRef.current = false
    setIsRecovery(false)
    // Clear the hash so a refresh doesn't re-open the reset form
    if (window.location.hash) history.replaceState(null, '', window.location.pathname)
  }

  if (session === undefined) {
    return <div className="auth-screen"><div className="auth-loading">…</div></div>
  }

  // Show reset form if recovery detected from URL or PASSWORD_RECOVERY event,
  // and we have a session (Supabase sets a temporary session for recovery flows).
  if (isRecovery && session) return <PasswordResetScreen onDone={handleRecoveryDone} />

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
      {SHOW_DEBUG && <DebugPanel />}
      <UpdatePrompt />
    </div>
  )
}
