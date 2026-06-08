import { useState, useEffect } from 'react'
import { getConfig, setConfig, saveImage } from '../db'
import { fetchBoards, fetchPinsFromBoard, getBestImageUrl, blobToBase64 } from '../pinterest'

export default function PinterestSync({ onClose, projects, activeProject }) {
  const [token, setToken] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [boards, setBoards] = useState([])
  const [selectedBoards, setSelectedBoards] = useState([])
  const [targetProject, setTargetProject] = useState(activeProject?.id || '')
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState('')
  const [step, setStep] = useState('loading')

  useEffect(() => { init() }, [])

  async function init() {
    const saved = await getConfig('pinterest_token')
    if (saved) {
      setToken(saved)
      await loadBoards(saved)
    } else {
      setStep('token')
    }
  }

  async function loadBoards(t) {
    try {
      const list = await fetchBoards(t)
      setBoards(list)
      setStep('boards')
    } catch {
      await setConfig('pinterest_token', '')
      setStep('token')
    }
  }

  async function handleConnect() {
    if (!tokenInput.trim()) return
    await setConfig('pinterest_token', tokenInput.trim())
    setToken(tokenInput.trim())
    await loadBoards(tokenInput.trim())
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
    setTokenInput('')
    setBoards([])
    setStep('token')
  }

  return (
    <div className="modal-overlay" onClick={!syncing ? onClose : undefined}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <h3>Pinterest Sync</h3>

        {step === 'loading' && (
          <div className="sync-step sync-progress">
            <div className="spinner" />
            <p>Loading…</p>
          </div>
        )}

        {step === 'token' && (
          <div className="sync-step">
            <p className="helper">Paste your Pinterest access token to connect your boards.</p>
            <ol className="instructions">
              <li>Go to <strong>developers.pinterest.com</strong> → your app <strong>Refnest</strong></li>
              <li>Click <strong>"Gerar ficha"</strong> → copy the token</li>
              <li>Paste it below</li>
            </ol>
            <input
              className="text-input"
              placeholder="Paste your access token…"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              type="password"
            />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleConnect}>Connect</button>
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
