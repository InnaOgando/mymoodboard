import ResizeHandle from '../ResizeHandle'

export default function TodoObject({ el, selected, editing, onUpdate, onDelete, onResize, onMakeCollection, scaleRef }) {
  const items = el.content.items?.length ? el.content.items : [{ text: '', done: false }]
  const w = el.w || 260

  function toggle(i) { onUpdate({ ...el.content, items: items.map((t, idx) => idx !== i ? t : { ...t, done: !t.done }) }) }
  function updateItem(i, text) { onUpdate({ ...el.content, items: items.map((t, idx) => idx !== i ? t : { ...t, text }) }) }
  function addItem() { onUpdate({ ...el.content, items: [...items, { text: '', done: false }] }) }
  function removeItem(i) {
    const u = items.filter((_, idx) => idx !== i)
    onUpdate({ ...el.content, items: u.length ? u : [{ text: '', done: false }] })
  }

  return (
    <div style={{ position: 'relative', width: w }}>
      {selected && (
        <div className="img-popup-menu" onPointerDown={e => e.stopPropagation()}>
          <button className="img-popup-btn" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onMakeCollection?.() }}>+ Collection</button>
          <button className="img-popup-btn img-popup-delete" onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        </div>
      )}

      <div className={`el-card el-todo ${selected ? 'selected' : ''}`} style={{ width: w }}>
        <div className="drag-handle">
          <span className="handle-dots">⠿</span>
          <span className="idea-label">To Do</span>
        </div>
        {items.map((item, i) => (
          <div key={i} className="todo-item">
            <input type="checkbox" checked={!!item.done}
              onChange={e => { e.stopPropagation(); toggle(i) }}
              onPointerDown={e => e.stopPropagation()} />
            <input
              className={`todo-input ${item.done ? 'done' : ''}`}
              value={item.text || ''}
              onChange={e => updateItem(i, e.target.value)}
              onPointerDown={e => e.stopPropagation()}
              placeholder="Task…"
            />
            {editing && (
              <button className="todo-remove" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeItem(i) }}>×</button>
            )}
          </div>
        ))}
        <button className="todo-add" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); addItem() }}>+ Add item</button>
        {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={160} scaleRef={scaleRef} />}
      </div>
    </div>
  )
}
