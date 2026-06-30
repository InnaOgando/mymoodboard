import { useRef, useEffect } from 'react'
import ResizeHandle from '../ResizeHandle'

export default function TodoObject({ el, selected, editing, onUpdate, onResize, scaleRef }) {
  const items = el.content.items?.length ? el.content.items : [{ id: Date.now(), text: '', done: false }]

  useEffect(() => {
    if (editing) setTimeout(() => inputRefs.current[0]?.focus(), 50)
  }, [editing])
  const title = el.content.title || ''
  const w = el.w || 260
  const inputRefs = useRef({})

  function toggle(i) {
    onUpdate({ ...el.content, items: items.map((t, idx) => idx !== i ? t : { ...t, done: !t.done }) })
  }

  function updateItem(i, text) {
    onUpdate({ ...el.content, items: items.map((t, idx) => idx !== i ? t : { ...t, text }) })
  }

  function addItemAfter(i) {
    const next = [...items]
    next.splice(i + 1, 0, { id: Date.now(), text: '', done: false })
    onUpdate({ ...el.content, items: next })
    // Focus new row after render
    setTimeout(() => {
      const el = inputRefs.current[i + 1]
      el?.focus()
    }, 30)
  }

  function removeItem(i) {
    const u = items.filter((_, idx) => idx !== i)
    onUpdate({ ...el.content, items: u.length ? u : [{ id: Date.now(), text: '', done: false }] })
  }

  function handleKeyDown(e, i) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addItemAfter(i)
    } else if (e.key === 'Backspace' && items[i].text === '' && items.length > 1) {
      e.preventDefault()
      removeItem(i)
      setTimeout(() => inputRefs.current[Math.max(0, i - 1)]?.focus(), 30)
    }
  }

  return (
    <div style={{ position: 'relative', width: w }}>
      <div className={`el-card el-todo ${selected ? 'selected' : ''}`} style={{ width: w }}>
        <div className="drag-handle">
          <span className="handle-dots">⠿</span>
          <span className="idea-label">{title || 'To Do'}</span>
        </div>
        {items.map((item, i) => (
          <div key={i} className="todo-item">
            <input type="checkbox" checked={!!item.done}
              onChange={() => editing && toggle(i)}
              style={{ pointerEvents: editing ? 'auto' : 'none' }}
              onPointerDown={e => editing && e.stopPropagation()} />
            <input
              ref={el => { inputRefs.current[i] = el }}
              className={`todo-input ${item.done ? 'done' : ''}`}
              value={item.text || ''}
              readOnly={!editing}
              style={{ pointerEvents: editing ? 'auto' : 'none' }}
              onChange={e => updateItem(i, e.target.value)}
              onKeyDown={e => handleKeyDown(e, i)}
              onPointerDown={e => editing && e.stopPropagation()}
              placeholder="Task…"
            />
          </div>
        ))}
        {selected && <ResizeHandle w={w} h={null} onResize={nw => onResize(nw, null)} minW={160} scaleRef={scaleRef} />}
      </div>
    </div>
  )
}
