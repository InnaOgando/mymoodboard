export default function BottomNav({ onAction }) {
  const items = [
    { type: 'text', icon: 'T', label: 'Text' },
    { type: 'link', icon: '🔗', label: 'Link' },
    { type: 'todo', icon: '☑️', label: 'To Do' },
    { type: 'image', icon: '🖼️', label: 'Image' },
    { type: 'document', icon: '📄', label: 'Doc' },
  ]

  return (
    <div className="bottom-bar board-bottom">
      <div className="bottom-nav">
        {items.slice(0, 2).map(item => (
          <button key={item.type} className="nav-btn" onClick={() => onAction(item.type)}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}

        <button className="add-board-btn center-btn" onClick={() => onAction('board')}>
          <span className="add-board-icon">⊕</span>
          <span>Board</span>
        </button>

        {items.slice(2).map(item => (
          <button key={item.type} className="nav-btn" onClick={() => onAction(item.type)}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
