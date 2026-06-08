import { useState } from 'react'

export default function SaveImageModal({ image, projects, defaultProjectId, onSave, onDiscard }) {
  const [projectId, setProjectId] = useState(defaultProjectId || '')

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Save to Project</h3>
        <div className="shared-preview">
          <img src={image.data} alt="" />
        </div>
        {image.sourceUrl && (
          <p className="helper" style={{ wordBreak: 'break-all' }}>From: {image.sourceUrl}</p>
        )}
        <select
          className="text-input"
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
        >
          <option value="">— select project —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onDiscard}>Discard</button>
          <button
            className="btn-primary"
            disabled={!projectId}
            onClick={() => onSave(projectId)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
