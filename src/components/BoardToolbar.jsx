import { useState } from 'react'
import { TOOLBAR_CONFIG, PANEL_DEFS } from './toolbarConfig'
import textIcon       from '../assets/note.svg'
import linkIcon       from '../assets/link.svg'
import colorIcon      from '../assets/palette.svg'
import todoIcon       from '../assets/todo.svg'
import imageIcon      from '../assets/image.svg'
import docsIcon       from '../assets/document.svg'
import collectionIcon from '../assets/board.svg'

// Creation mode buttons — order matches PRODUCT_SPEC.md §BottomNav
const CREATE_LEFT = [
  { type: 'idea',    icon: textIcon,  label: 'Idea' },
  { type: 'link',    icon: linkIcon,  label: 'Link' },
  { type: 'palette', icon: colorIcon, label: 'Palette' },
]
const CREATE_RIGHT = [
  { type: 'todo',     icon: todoIcon,  label: 'To Do' },
  { type: 'image',    icon: imageIcon, label: 'Image' },
  { type: 'document', icon: docsIcon,  label: 'Doc' },
]

/**
 * Single bottom toolbar for the entire app.
 *
 * Responsibilities:
 *   1. Read TOOLBAR_CONFIG / PANEL_DEFS from toolbarConfig.js
 *   2. Evaluate per-item rules (visible, active, label, icon) against selectedEl
 *   3. Render buttons and dispatch actions
 *
 * No object-specific business logic lives here.
 * To change toolbar content, edit toolbarConfig.js only.
 *
 * key={selectedId || 'create'} in the parent resets panel state on selection change.
 */
export default function BoardToolbar({
  selectedEl, selectedType, onAction,
  selectMode, selectedCount, onEnterSelect, onExitSelect, onDeleteSelected,
  ...actions
}) {
  const [panel, setPanel]         = useState(null)
  const [panelText, setPanelText] = useState('')

  // ── Select mode → slim selection bar (count · cancel · delete) ──────────────
  if (selectMode) {
    return (
      <div className="bottom-bar board-bottom" onPointerDown={e => e.stopPropagation()}>
        <div className="bottom-nav select-nav">
          <button className="nav-btn" onClick={onExitSelect}>
            <span className="nav-icon">✕</span>
            <span className="nav-label">Cancel</span>
          </button>
          <span className="select-count">{selectedCount} selected</span>
          <button className="nav-btn" onClick={onDeleteSelected} disabled={!selectedCount}>
            <span className="nav-icon" style={{ color: '#e05555' }}>🗑</span>
            <span className="nav-label">Delete</span>
          </button>
        </div>
      </div>
    )
  }

  // ── No selection → creation toolbar ────────────────────────────────────────
  if (!selectedEl) {
    return (
      <div className="bottom-bar board-bottom" onPointerDown={e => e.stopPropagation()}>
        <div className="bottom-nav create-nav">
          <div className="create-tools">
            {CREATE_LEFT.map(item => (
              <button key={item.type} className="nav-btn" onClick={() => onAction(item.type)}>
                <img src={item.icon} alt={item.label} className="nav-icon-img" />
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
            <button className="add-board-btn center-btn" onClick={() => onAction('board')}>
              <img src={collectionIcon} alt="Board" className="nav-icon-img" />
              <span>Board</span>
            </button>
            {CREATE_RIGHT.map(item => (
              <button key={item.type} className="nav-btn" onClick={() => onAction(item.type)}>
                <img src={item.icon} alt={item.label} className="nav-icon-img" />
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </div>
          <button className="nav-btn nav-btn--select" onClick={onEnterSelect}>
            <svg className="nav-icon-img" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
            </svg>
            <span className="nav-label">Select</span>
          </button>
        </div>
      </div>
    )
  }

  // ── Selection → config-driven contextual toolbar ────────────────────────────

  // Evaluate a config field that can be a static value or a function of el
  const resolve = (field, el) => typeof field === 'function' ? field(el) : field

  const allItems = TOOLBAR_CONFIG[selectedType] ?? []

  // Apply visibility rules — separators are kept unless they would be adjacent or leading
  const visibleItems = allItems.reduce((acc, item) => {
    if (item.sep) {
      // Suppress leading sep and consecutive seps
      if (acc.length === 0 || acc[acc.length - 1].sep) return acc
      acc.push(item)
    } else {
      const isVisible = !item.visible || item.visible(selectedEl)
      if (isVisible) acc.push(item)
    }
    return acc
  }, [])
  // Also suppress a trailing separator
  while (visibleItems.length && visibleItems[visibleItems.length - 1].sep) {
    visibleItems.pop()
  }

  const panelDef = panel ? PANEL_DEFS[panel] : null

  function handleItemClick(item) {
    if (item.panel) {
      const text = item.initText ? item.initText(selectedEl) : ''
      setPanelText(text)
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
        {visibleItems.map(item => {
          if (item.sep) return <div key={item.id} className="ft-sep" />

          const label    = resolve(item.label, selectedEl)
          const icon     = resolve(item.icon,  selectedEl)
          const iconSt   = item.iconStyle ? item.iconStyle(selectedEl) : null
          const isActive = (item.active && item.active(selectedEl)) || panel === item.panel

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
              {iconSt
                ? <span className="ft-icon" style={iconSt} />
                : <span className="ft-icon">{icon}</span>
              }
              <span className="ft-label">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
