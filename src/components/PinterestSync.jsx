import { useState, useEffect } from 'react'
import { getConfig, setConfig, saveElement } from '../db'
import { fetchBoards, fetchPinsFromBoard, getBestImageUrl, blobToBase64 } from '../pinterest'

// pickMode: just browse pins and call onPickImage(base64) for a single image
// normal mode: sync whole boards as elements into a board canvas
export default function PinterestSync({ onClose, boardId, pickMode = false, onPickImage }) {
  const [token, setToken] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [boards, setBoards] = useState([])
  const [selectedBoards, setSelectedBoards] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState('')
  const [step, setStep] = useState('loading')

  useEffect(() => { init() }, [])

  async function init() {
    const saved = await getConfig('pinterest_token')
    if (saved) { setToken(saved); await loadPinterestBoards(saved) }
    else setStep('token')
  }

  async function loadPinterestBoards(t) {
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
    await loadPinterestBoards(tokenInput.trim())
  }

  function toggleBoard(id) {
    setSelectedBoards(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    )
  }

  async function startSync() {
    if (!boardId) { alert('No board selected'); return }
    if (selectedBoards.length === 0) { alert('Select at least one Pinterest board'); return }
    setSyncing(true)

    let total = 0; let done = 0
    let x = 20; let y = 20

    for (const pid of selectedBoards) {
      const pb = boards.find(b => b.id === pid)
      setProgress(`Fetching pins from "${pb?.name}"…`)
      const pins = await fetchPinsFromBoard(pid, token)
      total += pins.length

      for (const pin of pins) {
        const url = getBestImageUrl(pin)
        if (!url) { done++; continue }
        setProgress(`Downloading ${done + 1} / ${total}…`)
        const data = await blobToBase64(url)
        if (data) {
          await saveElement({
            id: `pin_${pin.id}`,
            boardId,
            type: 'image',
            x, y,
            width: 200,
            content: { src: data, pinUrl: pin.link },
            createdAt: Date.now()
          })
          x += 220; if (x > 1800) { x = 20; y += 240 }
        }
        done++
      }
    }

    setProgress(`Done! ${done} images added to your board.`)
    setSyncing(false)
    setStep('done')
  }

  async function disconnect() {
    await setConfig('pinterest_token', '')
    setToken(''); setTokenInput(''); setBoards([]); setStep('token')
  }

  return (
    <div className="modal-overlay" onClick={!syncing ? onClose : undefined}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <h3>Pinterest</h3>

        {step === 'loading' && (
          <div className="sync-step sync-progress"><div className="spinner" /></div>
        )}

        {step === 'token' && (
          <div className="sync-step">
            <p className="helper">Paste your Pinterest access token to connect.</p>
            <ol className="instructions">
              <li>Go to <strong>developers.pinterest.com</strong> → your app <strong>Refnest</strong></li>
              <li>Click <strong>"Gerar ficha"</strong> → copy the token</li>
              <li>Paste below</li>
            </ol>
            <input className="text-input" placeholder="Paste token…" value={tokenInput}
              onChange={e => setTokenInput(e.target.value)} type="password" />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleConnect}>Connect</button>
            </div>
          </div>
        )}

        {step === 'boards' && !syncing && (
          <div className="sync-step">
            <p className="helper">
              {pickMode ? 'Select a board to browse pins:' : 'Select Pinterest boards to import:'}
            </p>
            <div className="board-list">
              {boards.map(b => (
                <label key={b.id} className="board-item">
                  <input type="checkbox" checked={selectedBoards.includes(b.id)}
                    onChange={() => toggleBoard(b.id)} />
                  <span>{b.name} <small>({b.pin_count} pins)</small></span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={disconnect}>Disconnect</button>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={startSync}>
                {pickMode ? 'Browse' : 'Sync to Board'}
              </button>
            </div>
          </div>
        )}

        {syncing && (
          <div className="sync-step sync-progress">
            <div className="spinner" />
            <p>{progress}</p>
            <p className="helper">Don't close this window.</p>
          </div>
        )}

        {step === 'done' && (
          <div className="sync-step sync-progress">
            <div className="done-icon">✓</div>
            <p>{progress}</p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
