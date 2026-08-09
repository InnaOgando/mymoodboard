import { useState } from 'react'
import { supabase } from '../supabase'
import { STORAGE_LIMIT_BYTES } from '../db'
import backupIcon  from '../assets/backup.svg'
import restoreIcon from '../assets/restore.svg'
import exitIcon    from '../assets/exit.svg'
import renameIcon  from '../assets/rename-edit.svg'
import deleteIcon  from '../assets/delete-x.svg'

const APP_VERSION = 'v1.0'
const PRIVACY_URL = '/privacy-policy'
// Apple's standard EULA — swap for your own Terms page when you have one.
const TERMS_URL   = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'

function initials(name, email) {
  const src = (name || email || '?').trim()
  const parts = src.split(/[\s@._-]+/).filter(Boolean)
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2)
  return letters.toUpperCase()
}

export default function SettingsScreen({ session, usage, onClose, onExport, onRestore, onSignOut }) {
  const user = session?.user
  const [view, setView] = useState('main') // 'main' | 'account'
  const name = user?.user_metadata?.name || ''
  const email = user?.email || ''
  const mb = Math.round((usage?.bytes || 0) / 1048576)
  const limitMb = Math.round(STORAGE_LIMIT_BYTES / 1048576)
  const ratio = usage?.ratio || 0

  return (
    <div className="settings-screen">
      {view === 'main'
        ? <MainView
            name={name} email={email} initials={initials(name, email)}
            mb={mb} limitMb={limitMb} ratio={ratio}
            onClose={onClose} onExport={onExport} onRestore={onRestore}
            onSignOut={onSignOut} onAccount={() => setView('account')}
          />
        : <AccountView
            name={name} email={email}
            onBack={() => setView('main')} onClose={onClose} onSignOut={onSignOut}
          />
      }
    </div>
  )
}

function MainView({ name, email, initials, mb, limitMb, ratio, onClose, onExport, onRestore, onSignOut, onAccount }) {
  return (
    <>
      <div className="settings-topbar">
        <span className="settings-title">Settings</span>
        <button className="settings-done" onClick={onClose}>Done</button>
      </div>

      <div className="settings-scroll">
        <div className="settings-profile">
          <div className="settings-profile-text">
            <div className="settings-name">{name || email.split('@')[0]}</div>
            <div className="settings-email">{email}</div>
            <div className="settings-version">RefMemo {APP_VERSION}</div>
          </div>
          <div className="settings-avatar">{initials}</div>
        </div>

        <div className="settings-list">
          <button className="settings-row" onClick={onAccount}>
            <img className="settings-row-icon" src={renameIcon} alt="" />
            <span>Account settings</span>
            <span className="settings-chevron">&#8250;</span>
          </button>
        </div>

        <div className="settings-list">
          <button className="settings-row" onClick={onExport}>
            <img className="settings-row-icon" src={backupIcon} alt="" />
            <span>Export my data</span>
          </button>
          <button className="settings-row" onClick={onRestore}>
            <img className="settings-row-icon" src={restoreIcon} alt="" />
            <span>Restore my data</span>
          </button>
        </div>

        <div className="settings-list">
          <a className="settings-row" href={PRIVACY_URL} target="_blank" rel="noreferrer">
            <span>Privacy Policy</span>
            <span className="settings-chevron">&#8250;</span>
          </a>
          <a className="settings-row" href={TERMS_URL} target="_blank" rel="noreferrer">
            <span>Terms of Use</span>
            <span className="settings-chevron">&#8250;</span>
          </a>
        </div>

        <div className="settings-list">
          <button className="settings-row settings-row--accent" onClick={onSignOut}>
            <img className="settings-row-icon" src={exitIcon} alt="" />
            <span>Log out</span>
          </button>
        </div>

        <div className="settings-plan">
          <div className="settings-plan-title">You're on the Free plan</div>
          <div className="storage-meter-track" style={{ width: '100%' }}>
            <div className="storage-meter-fill" style={{
              width: `${Math.min(100, ratio * 100)}%`,
              background: ratio >= 1 ? '#e8315a' : ratio >= 0.8 ? '#f5a623' : '#3bb273',
            }} />
          </div>
          <div className="settings-plan-usage">{mb} / {limitMb} MB used</div>
        </div>
      </div>
    </>
  )
}

function AccountView({ name, email, onBack, onClose, onSignOut }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [editName, setEditName] = useState(false)
  const [nameVal, setNameVal] = useState(name)
  const [editEmail, setEditEmail] = useState(false)
  const [emailVal, setEmailVal] = useState(email)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  async function saveName() {
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ data: { name: nameVal.trim() } })
    setBusy(false); setEditName(false)
    flash(error ? error.message : 'Name updated.')
  }

  async function saveEmail() {
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ email: emailVal.trim() })
    setBusy(false); setEditEmail(false)
    flash(error ? error.message : 'Check your inbox to confirm the new email.')
  }

  async function resetPassword() {
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setBusy(false)
    flash(error ? error.message : 'Password reset email sent.')
  }

  async function deleteAccount() {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('delete-account', { body: {} })
    setBusy(false)
    if (error || !data?.ok) { flash('Could not delete account. Please try again.'); return }
    await supabase.auth.signOut()
    onSignOut?.()
  }

  return (
    <>
      <div className="settings-topbar">
        <button className="settings-back" onClick={onBack}>&#8249;</button>
        <span className="settings-title">Account settings</span>
        <button className="settings-done" onClick={onClose}>Done</button>
      </div>

      <div className="settings-scroll">
        {msg && <div className="settings-msg">{msg}</div>}

        <div className="settings-field">
          <span className="settings-field-label">Name</span>
          {editName ? (
            <div className="settings-field-edit">
              <input className="settings-input" value={nameVal} autoFocus
                onChange={e => setNameVal(e.target.value)} placeholder="Your name" />
              <button className="settings-link" disabled={busy} onClick={saveName}>Save</button>
            </div>
          ) : (
            <>
              <span className="settings-field-value">{name || '—'}</span>
              <button className="settings-link" onClick={() => { setNameVal(name); setEditName(true) }}>Change</button>
            </>
          )}
        </div>

        <div className="settings-field">
          <span className="settings-field-label">Email</span>
          {editEmail ? (
            <div className="settings-field-edit">
              <input className="settings-input" value={emailVal} autoFocus type="email"
                onChange={e => setEmailVal(e.target.value)} placeholder="you@email.com" />
              <button className="settings-link" disabled={busy} onClick={saveEmail}>Save</button>
            </div>
          ) : (
            <>
              <span className="settings-field-value">{email}</span>
              <button className="settings-link" onClick={() => { setEmailVal(email); setEditEmail(true) }}>Change</button>
            </>
          )}
        </div>

        <div className="settings-field">
          <span className="settings-field-label">Password</span>
          <span className="settings-field-value">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span>
          <button className="settings-link" disabled={busy} onClick={resetPassword}>Reset</button>
        </div>

        <div className="settings-danger">
          <div className="settings-danger-title">Danger zone</div>
          {!confirmDelete ? (
            <button className="settings-delete" onClick={() => setConfirmDelete(true)}>
              <img className="settings-row-icon" src={deleteIcon} alt="" />
              Delete your account
            </button>
          ) : (
            <div className="settings-danger-confirm">
              <p>This permanently deletes your account and all boards. This cannot be undone.</p>
              <div className="settings-danger-actions">
                <button className="btn-ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button className="btn-danger" disabled={busy} onClick={deleteAccount}>Delete forever</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
