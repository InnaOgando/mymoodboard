import { useState } from 'react'
import { buildToolbarConfig, PANEL_DEFS } from './toolbarConfig'

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

/**
 * Single bottom toolbar for the entire app.
 *
 * No selection  → creation buttons (Idea / Link / Palette / Board / Todo / Image / Doc)
 * Selection      → contextual actions driven by toolbarConfig.js
 *
 * key={selectedId || 'create'} in the parent ensures React unmounts/remounts
 * this component on selection change, resetting all panel state automatically.
 */
export default function BoardToolbar({ selectedEl, selectedType, onAction, ...actions }) {
  const [panel, setPanel]         = useState(null)
  const [panelText, setPanelText] = useState('')
  const locked = !!selectedEl?.locked

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

  // ── Selection → config-driven contextual toolbar ────────────────────────────
  const config   = buildToolbarConfig({ el: selectedEl, locked })
  const items    = config[selectedType] ?? []
  const panelDef = panel ? PANEL_DEFS[panel] : null

  function handleItemClick(item) {
    if (item.panel) {
      if (item.initText !== undefined) setPanelText(item.initText)
      setPanel(p => p === item.panel ? null : item.panel)
    } else if (item.action) {
      actions[item.action]?.()
    }
  }

  function handlePanelSelect(color) {
    panelDef?.onSelect(color, actions)
    setPanel(null)
  }

  function handlePanelSubmit() {
    panelDef?.onSubmit(panelText, actions)
    setPanel(null)
  }

  return (
    <div className="bottom-bar board-bottom" onPointerDown={e => e.stopPropagation()}>

      {/* Panel — rendered above the button row when active */}
      {panelDef && (
        <div className="obj-panel">
          {panelDef.type === 'colors' && (
            <div className="obj-panel-colors">
              {panelDef.colors.map(c => (
                <button key={c} className="obj-panel-swatch"
                  style={{
                    background: c,
                    outline: panelDef.activeColor(selectedEl) === c
                      ? '2px solid var(--text)' : '1px solid #ccc',
                  }}
                  onClick={() => handlePanelSelect(c)}
                />
              ))}
              <button className="obj-panel-swatch obj-panel-swatch--none"
                onClick={() => handlePanelSelect(null)}>×</button>
            </div>
          )}
          {panelDef.type === 'text' && (
            <div className="obj-panel-row">
              <input
                autoFocus
                className="obj-panel-input"
                value={panelText}
                onChange={e => setPanelText(e.target.value)}
                placeholder={panelDef.placeholder}
                onKeyDown={e => { if (e.key === 'Enter') handlePanelSubmit() }}
              />
              <button className="obj-panel-done" onClick={handlePanelSubmit}>Done</button>
            </div>
          )}
        </div>
      )}

      {/* Button row */}
      <div className="bottom-nav obj-toolbar">
        {items.map(item => {
          if (item.sep) return <div key={item.id} className="ft-sep" />
          const isActive = item.active || panel === item.panel
          return (
            <button
              key={item.id}
              className={[
                'ft-btn',
                item.danger ? 'ft-btn--danger' : '',
                isActive    ? 'ft-btn--active'  : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleItemClick(item)}
            >
              {item.iconStyle
                ? <span className="ft-icon" style={item.iconStyle} />
                : <span className="ft-icon">{item.icon}</span>
              }
              <span className="ft-label">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
