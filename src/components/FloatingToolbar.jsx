import { useState } from 'react'
import { PRESET_COLORS } from '../colors'

// Colours available for Idea background
const BG_COLORS = ['#ffffff', '#fff9c4', '#ffe0e0', '#e0f0ff', '#e0ffe8', '#f3e0ff', '#ffe8d0', '#e8e8e8']

export default function FloatingToolbar({
  el,
  type,
  onDelete,
  onLock,
  onGroup,
  onCopy,
  onCut,
  onDuplicate,
  onCaption,
  onBgColor,
  onAddTitle,
}) {
  const [panel, setPanel] = useState(null) // 'bgColor' | 'caption' | 'title' | null
  const [captionText, setCaptionText] = useState(el?.content?.caption || '')
  const [titleText, setTitleText] = useState(el?.content?.title || '')
  const locked = !!el?.locked

  function closePanel() { setPanel(null) }

  function handleBgColor(color) {
    onBgColor?.(color)
    closePanel()
  }

  function handleCaption() {
    onCaption?.(captionText)
    closePanel()
  }

  function handleTitle() {
    onAddTitle?.(titleText)
    closePanel()
  }

  const isCollection = type === 'collection'
  if (isCollection) return null  // collections keep their own ⋯ menu

  return (
    <div className="floating-toolbar-wrap" onPointerDown={e => e.stopPropagation()}>

      {/* Panel — bg color picker */}
      {panel === 'bgColor' && (
        <div className="ft-panel">
          <div className="ft-panel-colors">
            {BG_COLORS.map(c => (
              <button
                key={c}
                className="ft-panel-swatch"
                style={{ background: c, outline: el?.content?.bgColor === c ? '2px solid var(--text)' : '1px solid #ccc' }}
                onClick={() => handleBgColor(c)}
              />
            ))}
            <button className="ft-panel-swatch ft-panel-swatch--none"
              onClick={() => handleBgColor(null)}>×</button>
          </div>
        </div>
      )}

      {/* Panel — caption input */}
      {panel === 'caption' && (
        <div className="ft-panel">
          <div className="ft-panel-row">
            <input
              autoFocus
              className="ft-panel-input"
              value={captionText}
              onChange={e => setCaptionText(e.target.value)}
              placeholder="Add caption…"
              onKeyDown={e => { if (e.key === 'Enter') handleCaption() }}
            />
            <button className="ft-panel-done" onClick={handleCaption}>Done</button>
          </div>
        </div>
      )}

      {/* Panel — todo title input */}
      {panel === 'title' && (
        <div className="ft-panel">
          <div className="ft-panel-row">
            <input
              autoFocus
              className="ft-panel-input"
              value={titleText}
              onChange={e => setTitleText(e.target.value)}
              placeholder="Add title…"
              onKeyDown={e => { if (e.key === 'Enter') handleTitle() }}
            />
            <button className="ft-panel-done" onClick={handleTitle}>Done</button>
          </div>
        </div>
      )}

      {/* Main toolbar row */}
      <div className="floating-toolbar">

        {/* Type-specific leading action */}
        {type === 'image' && (
          <button className="ft-btn" title="Caption"
            onClick={() => { setCaptionText(el?.content?.caption || ''); setPanel(p => p === 'caption' ? null : 'caption') }}>
            <span className="ft-icon">✏</span>
            <span className="ft-label">Caption</span>
          </button>
        )}
        {type === 'idea' && (
          <button className="ft-btn" title="Background color"
            onClick={() => setPanel(p => p === 'bgColor' ? null : 'bgColor')}>
            <span className="ft-icon" style={{ width: 18, height: 18, borderRadius: 4, display: 'inline-block', background: el?.content?.bgColor || '#fff', border: '1px solid #ccc', verticalAlign: 'middle' }} />
            <span className="ft-label">Color</span>
          </button>
        )}
        {type === 'todo' && (
          <button className="ft-btn" title="Add title"
            onClick={() => { setTitleText(el?.content?.title || ''); setPanel(p => p === 'title' ? null : 'title') }}>
            <span className="ft-icon">T</span>
            <span className="ft-label">Title</span>
          </button>
        )}

        {/* Separator */}
        <div className="ft-sep" />

        {/* Common actions */}
        <button className={`ft-btn ${locked ? 'ft-btn--active' : ''}`} title={locked ? 'Unlock' : 'Lock'}
          onClick={() => onLock?.()}>
          <span className="ft-icon">{locked ? '🔒' : '🔓'}</span>
          <span className="ft-label">{locked ? 'Locked' : 'Lock'}</span>
        </button>

        {!locked && (
          <button className="ft-btn" title="Group into Collection"
            onClick={() => onGroup?.()}>
            <span className="ft-icon">⊞</span>
            <span className="ft-label">Group</span>
          </button>
        )}

        <button className="ft-btn" title="Copy"
          onClick={() => onCopy?.()}>
          <span className="ft-icon">⊡</span>
          <span className="ft-label">Copy</span>
        </button>

        {!locked && (
          <button className="ft-btn" title="Cut"
            onClick={() => onCut?.()}>
            <span className="ft-icon">✂</span>
            <span className="ft-label">Cut</span>
          </button>
        )}

        <button className="ft-btn" title="Duplicate"
          onClick={() => onDuplicate?.()}>
          <span className="ft-icon">⧉</span>
          <span className="ft-label">Dup</span>
        </button>

        {!locked && (
          <button className="ft-btn ft-btn--danger" title="Delete"
            onClick={() => onDelete?.()}>
            <span className="ft-icon">×</span>
            <span className="ft-label">Delete</span>
          </button>
        )}
      </div>
    </div>
  )
}
