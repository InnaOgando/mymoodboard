import { useState, useEffect } from 'react'
import { getConfig, setConfig, saveImage } from '../db'
import { buildAuthURL, exchangeCode, fetchBoards, fetchPinsFromBoard, getBestImageUrl, blobToBase64 } from '../pinterest'

const CLIENT_ID = import.meta.env.VITE_PINTEREST_CLIENT_ID

export default function PinterestSync({ onClose, projects, activeProject }) {
  const [token, setToken] = useState('')
  const [boards, setBoards] = useState([])
  const [selectedBoards, setSelectedBoards] = useState([])
  const [targetProject, setTargetProject] = useState(activeProject?.id || '')
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState('')
  const [step, setStep] = useState('loading')

  useEffect(() => {
    init()
  }, [])

  async function init() {
    // Check if we just came back from Pinterest OAuth
    const params = new URLSearchParams(location.search)
    const code = params.get('code')
    const state = params.get('state')

    if (code && state && state === sessionStorage.getItem('pinterest_state')) {
      sessionStorage.removeItem('pinterest_state')
      history.replaceState({}, '', '/')
      setStep('exchanging')
      try {
        const accessToken = await exchangeCode(code)
        await setConfig('pinterest_token', accessToken)
        setToken(accessToken)
        await loadBoards(accessToken)
      } catch (e) {
        alert('Pinterest login failed: ' + e.message)
        setStep('connect')
      }
      return
    }

    // Check saved token
    const saved = await getConfig('pinterest_token')
    if (saved) {
      setToken(saved)
      await loadBoards(saved)
    } else {
      setStep('connect')
    }
  }

  async function loadBoards(t) {
    try {
      const list = await fetchBoards(t)
      setBoards(list)
      setStep('boards')
    } catch {
      await setConfig('pinterest_token', '')
      setStep('connect')
    }
  }

  function connectPinterest() {
    if (!CLIENT_ID) {
      alert('Pinterest Client ID not configured. Add VITE_PINTEREST_CLIENT_ID to your .env file.')
      return
    }
    location.href = buildAuthURL(CLIENT_ID)
  }

  function toggleBoard(id) {
    setSelectedBoards(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    )
  }

  async function startSync() {
    if (!targetProject) { alert('Select a project first'); return }
    if (selectedBoards.length === 0) { alert('Select at least one board'); return }
    setSyncing(true)

    let total = 0
    let done = 0

    for (const boardId of selectedBoards) {
      const board = boards.find(b => b.id === boardId)
      setProgress(`Fetching pins from "${board?.name}"…`)
      const pins = await fetchPinsFromBoard(boardId, token)
      total += pins.length

      for (const pin of pins) {
        const url = getBestImageUrl(pin)
        if (!url) { done++; continue }

        setProgress(`Downloading ${done + 1} / ${total}…`)
        const data = await blobToBase64(url)
        if (data) {
          await saveImage({
            id: `pin_${pin.id}`,
            projectId: targetProject,
            data,
            name: pin.title || pin.id,
            source: 'pinterest',
            pinUrl: pin.link || `https://pinterest.com/pin/${pin.id}`,
            boardId,
            addedAt: Date.now()
          })
        }
        done++
      }
    }

    setProgress(`Done! ${done} images synced.`)
    setSyncing(false)
    setStep('done')
  }

  async function disconnect() {
    await setConfig('pinterest_token', '')
    setToken('')
    setBoards([])
    setStep('connect')
  }

  return (
    <div className="modal-overlay" onClick={!syncing ? onClose : undefined}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <h3>Pinterest Sync</h3>

        {step === 'loading' || step === 'exchanging' ? (
          <div className="sync-step sync-progress">
            <div className="spinner" />
            <p>{step === 'exchanging' ? 'Connecting to Pinterest…' : 'Loading…'}</p>
          </div>
        ) : null}

        {step === 'connect' && (
          <div className="sync-step">
            <p className="helper">Connect your Pinterest account to sync your saved boards into your moodboard projects.</p>
            <button className="pinterest-login-btn" onClick={connectPinterest}>
              <PinIcon /> Connect Pinterest
            </button>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}

        {step === 'boards' && !syncing && (
          <div className="sync-step">
            <p className="helper">Select which boards to import and choose a project:</p>

            <label className="field-label">Import into project:</label>
            <select
              className="text-input"
              value={targetProject}
              onChange={e => setTargetProject(e.target.value)}
            >
              <option value="">— select project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <label className="field-label" style={{ marginTop: '1rem' }}>Your boards:</label>
            <div className="board-list">
              {boards.map(b => (
                <label key={b.id} className="board-item">
                  <input
                    type="checkbox"
                    checked={selectedBoards.includes(b.id)}
                    onChange={() => toggleBoard(b.id)}
                  />
                  <span>{b.name} <small>({b.pin_count} pins)</small></span>
                </label>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={disconnect}>Disconnect</button>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={startSync}>Sync Selected</button>
            </div>
          </div>
        )}

        {syncing && (
          <div className="sync-step sync-progress">
            <div className="spinner" />
            <p>{progress}</p>
            <p className="helper">This may take a few minutes. Don't close this window.</p>
          </div>
        )}

        {step === 'done' && (
          <div className="sync-step sync-progress">
            <div className="done-icon">✓</div>
            <p>{progress}</p>
            <p className="helper">Images are stored on your device and available offline.</p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
    </svg>
  )
}
