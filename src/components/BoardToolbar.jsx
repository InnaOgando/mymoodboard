import { useState } from 'react'
import { PRESET_COLORS } from '../colors'

const BG_COLORS = ['#ffffff', '#fff9c4', '#ffe0e0', '#e0f0ff', '#e0ffe8', '#f3e0ff', '#ffe8d0', '#e8e8e8']

const CREATE_LEFT  = [
  { type: 'idea',    icon: '/text.png',  label: 'Idea' },
  { type: 'link',    icon: '/link.png',  label: 'Link' },
  { type: 'palette', icon: '/color.png', label: 'Palette' },
]
const CREATE_RIGHT = [
  { type: 'todo',     icon: '/to-do.png', label: 'To Do' },
  { type: 'image',    icon: '/image.png', label: 'Image' },
  { type: 'document', icon: '/docs.png',  label: 'Doc' },
]

export default function BoardToolbar({
  selectedEl,
  selectedType,
  onAction,
  onDelete, onLock, onGroup, onCopy, onCut, onDuplicate,
  onCaption, onBgColor, onAddTitle, onEdit,
  onRename, onColor,
}) {
  const [panel, setPanel] = useState(null)
  const [captionText, setCaptionText]  = useState('')
  const [titleText,   setTitleText]    = useState('')
  const locked = !!selectedEl?.locked

  function closePanel() { setPanel(null) }
  function togglePanel(name) { setPanel(p => p === name ? null : name) }

  // ── No selection → creation toolbar ────────────────────────────────────────
  if (!selectedEl) {
    return (
      <div className="bottom-bar board-bottom" onPointerDown={e => e.stopPropagation()}>
        <div className="bottom-nav">
          {CREATE_LEFT.map(item => (
            <button key={item.type} className="nav-btn" onClick={() => onAction(item.type)}>
              <img src={item.icon} alt={item.label} className="nav-icon-img" />
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
          <button className="add-board-btn center-btn" onClick={() => onAction('board')}>
            <img src="/collection.png" alt="Board" className="nav-icon-img" />
            <span>Board</span>
          </button>
          {CREATE_RIGHT.map(item => (
            <button key={item.type} className="nav-btn" onClick={() => onAction(item.type)}>
              <img src={item.icon} alt={item.label} className="nav-icon-img" />
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Selection → contextual toolbar ─────────────────────────────────────────
  return (
    <div className="bottom-bar board-bottom" onPointerDown={e => e.stopPropagation()}>

      {/* Panels — rendered above the button row inside the same bar */}
      {panel === 'bgColor' && (
        <div className="obj-panel">
          <div className="obj-panel-colors">
            {BG_COLORS.map(c => (
              <button key={c} className="obj-panel-swatch"
                style={{ background: c, outline: selectedEl?.content?.bgColor === c ? '2px solid var(--text)' : '1px solid #ccc' }}
                onClick={() => { onBgColor?.(c); closePanel() }} />
            ))}
            <button className="obj-panel-swatch obj-panel-swatch--none"
              onClick={() => { onBgColor?.(null); closePanel() }}>×</button>
          </div>
        </div>
      )}

      {panel === 'caption' && (
        <div className="obj-panel">
          <div className="obj-panel-row">
            <input autoFocus className="obj-panel-input" value={captionText}
              onChange={e => setCaptionText(e.target.value)} placeholder="Add caption…"
              onKeyDown={e => { if (e.key === 'Enter') { onCaption?.(captionText); closePanel() } }} />
            <button className="obj-panel-done"
              onClick={() => { onCaption?.(captionText); closePanel() }}>Done</button>
          </div>
        </div>
      )}

      {panel === 'title' && (
        <div className="obj-panel">
          <div className="obj-panel-row">
            <input autoFocus className="obj-panel-input" value={titleText}
              onChange={e => setTitleText(e.target.value)} placeholder="Add title…"
              onKeyDown={e => { if (e.key === 'Enter') { onAddTitle?.(titleText); closePanel() } }} />
            <button className="obj-panel-done"
              onClick={() => { onAddTitle?.(titleText); closePanel() }}>Done</button>
          </div>
        </div>
      )}

      {panel === 'colColor' && (
        <div className="obj-panel">
          <div className="obj-panel-colors">
            {PRESET_COLORS.map(c => (
              <button key={c} className="obj-panel-swatch"
                style={{ background: c, outline: selectedEl?.content?.color === c ? '2px solid var(--text)' : '1px solid #ccc' }}
                onClick={() => { onColor?.(c); closePanel() }} />
            ))}
            <button className="obj-panel-swatch obj-panel-swatch--none"
              onClick={() => { onColor?.(null); closePanel() }}>×</button>
          </div>
        </div>
      )}

      {/* Button row — scrollable, same height as creation toolbar */}
      <div className="bottom-nav obj-toolbar">

        {selectedType === 'collection' ? (<>
          <button className="ft-btn" onClick={() => onRename?.()}>
            <span className="ft-icon">✏</span>
            <span className="ft-label">Rename</span>
          </button>
          <button className="ft-btn" onClick={() => togglePanel('colColor')}>
            <span className="ft-icon">🎨</span>
            <span className="ft-label">Color</span>
          </button>
          <div className="ft-sep" />
          <button className="ft-btn" onClick={() => onDuplicate?.()}>
            <span className="ft-icon">⧉</span>
            <span className="ft-label">Dup</span>
          </button>
          <button className="ft-btn ft-btn--danger" onClick={() => onDelete?.()}>
            <span className="ft-icon">×</span>
            <span className="ft-label">Delete</span>
          </button>
        </>) : (<>

          {/* Type-specific leading action */}
          {selectedType === 'image' && (
            <button className="ft-btn" onClick={() => { setCaptionText(selectedEl?.content?.caption || ''); togglePanel('caption') }}>
              <span className="ft-icon">✏</span>
              <span className="ft-label">Caption</span>
            </button>
          )}
          {selectedType === 'idea' && (
            <button className="ft-btn" onClick={() => togglePanel('bgColor')}>
              <span className="ft-icon" style={{ width: 18, height: 18, borderRadius: 4, display: 'inline-block', background: selectedEl?.content?.bgColor || '#fff', border: '1px solid #ccc', verticalAlign: 'middle' }} />
              <span className="ft-label">Color</span>
            </button>
          )}
          {selectedType === 'todo' && (
            <button className="ft-btn" onClick={() => { setTitleText(selectedEl?.content?.title || ''); togglePanel('title') }}>
              <span className="ft-icon">T</span>
              <span className="ft-label">Title</span>
            </button>
          )}
          {selectedType === 'palette' && (
            <button className="ft-btn" onClick={() => onEdit?.()}>
              <span className="ft-icon">🎨</span>
              <span className="ft-label">Edit</span>
            </button>
          )}
          {selectedType === 'link' && (
            <button className="ft-btn" onClick={() => onEdit?.()}>
              <span className="ft-icon">✏</span>
              <span className="ft-label">Edit</span>
            </button>
          )}

          <div className="ft-sep" />

          <button className={`ft-btn ${locked ? 'ft-btn--active' : ''}`} onClick={() => onLock?.()}>
            <span className="ft-icon">{locked ? '🔒' : '🔓'}</span>
            <span className="ft-label">{locked ? 'Locked' : 'Lock'}</span>
          </button>

          {!locked && (
            <button className="ft-btn" onClick={() => onGroup?.()}>
              <span className="ft-icon">⊞</span>
              <span className="ft-label">Group</span>
            </button>
          )}

          <button className="ft-btn" onClick={() => onCopy?.()}>
            <span className="ft-icon">⊡</span>
            <span className="ft-label">Copy</span>
          </button>

          {!locked && (
            <button className="ft-btn" onClick={() => onCut?.()}>
              <span className="ft-icon">✂</span>
              <span className="ft-label">Cut</span>
            </button>
          )}

          <button className="ft-btn" onClick={() => onDuplicate?.()}>
            <span className="ft-icon">⧉</span>
            <span className="ft-label">Dup</span>
          </button>

          {!locked && (
            <button className="ft-btn ft-btn--danger" onClick={() => onDelete?.()}>
              <span className="ft-icon">×</span>
              <span className="ft-label">Delete</span>
            </button>
          )}
        </>)}
      </div>
    </div>
  )
}
