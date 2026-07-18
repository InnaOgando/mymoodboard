import { useState } from 'react'
import { supabase } from '../supabase'

export default function AuthScreen() {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setError('Wrong email or password.')
  }

  async function handleRegister(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({ email: email.trim(), password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setMessage('Account created! Check your email to confirm.')
  }

  async function handleReset(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setMessage('Reset email sent. Check your inbox.')
  }

  function switchMode(m) { setMode(m); setError(''); setMessage('') }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">🗂</div>
        <h1 className="auth-title">RefMemo</h1>
        <p className="auth-sub">Visual reference boards</p>

        {message ? (
          <div className="auth-message">
            <p>{message}</p>
            <button className="auth-resend" onClick={() => setMessage('')}>Back</button>
          </div>
        ) : (
          <>
            <div className="auth-tabs">
              <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>Log in</button>
              <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => switchMode('register')}>Sign up</button>
            </div>

            <form className="auth-form" onSubmit={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleReset}>
              <input className="auth-input" type="email" placeholder="Email" value={email}
                onChange={e => setEmail(e.target.value)} required autoFocus />

              {mode !== 'reset' && (
                <input className="auth-input" type="password" placeholder="Password" value={password}
                  onChange={e => setPassword(e.target.value)} required />
              )}

              {mode === 'register' && (
                <input className="auth-input" type="password" placeholder="Confirm password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} required />
              )}

              {error && <p className="auth-error">{error}</p>}

              <button className="auth-btn" type="submit" disabled={loading}>
                {loading ? '…' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : 'Send reset'}
              </button>
            </form>

            {mode === 'login' && (
              <button className="auth-link" onClick={() => switchMode('reset')}>Forgot password</button>
            )}
            {mode === 'reset' && (
              <button className="auth-link" onClick={() => switchMode('login')}>Back to login</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
