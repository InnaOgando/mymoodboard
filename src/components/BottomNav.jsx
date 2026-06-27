export default function BottomNav({ onAction }) {
  const left = [
    { type: 'idea',    icon: '/text.png',  label: 'Idea' },
    { type: 'link',    icon: '/link.png',  label: 'Link' },
    { type: 'palette', icon: '/color.png', label: 'Palette' },
  ]
  const right = [
    { type: 'todo',     icon: '/to-do.png', label: 'To Do' },
    { type: 'image',    icon: '/image.png', label: 'Image' },
    { type: 'document', icon: '/docs.png',  label: 'Doc' },
  ]

  return (
    <div className="bottom-bar board-bottom">
      <div className="bottom-nav">
        {left.map(item => (
          <button key={item.type} className="nav-btn" onClick={() => onAction(item.type)}>
            <img src={item.icon} alt={item.label} className="nav-icon-img" />
            <span className="nav-label">{item.label}</span>
          </button>
        ))}

        <button className="add-board-btn center-btn" onClick={() => onAction('board')}>
          <img src="/collection.png" alt="Board" className="nav-icon-img" />
          <span>Board</span>
        </button>

        {right.map(item => (
          <button key={item.type} className="nav-btn" onClick={() => onAction(item.type)}>
            <img src={item.icon} alt={item.label} className="nav-icon-img" />
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
