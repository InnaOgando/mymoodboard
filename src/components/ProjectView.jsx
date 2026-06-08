import { useState, useEffect, useRef } from 'react'
import { getImages, saveImage, deleteImage } from '../db'

export default function ProjectView({ project, onDeleteProject }) {
  const [images, setImages] = useState([])
  const [lightbox, setLightbox] = useState(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const fileRef = useRef()

  useEffect(() => { loadImages() }, [project.id])

  async function loadImages() {
    const imgs = await getImages(project.id)
    imgs.sort((a, b) => b.addedAt - a.addedAt)
    setImages(imgs)
  }

  async function handleFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const data = await fileToBase64(file)
      await saveImage({
        id: crypto.randomUUID(),
        projectId: project.id,
        data,
        name: file.name,
        source: 'upload',
        addedAt: Date.now()
      })
    }
    await loadImages()
  }

  async function handleDrop(e) {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    await handleFiles(files)
  }

  async function removeImage(id) {
    await deleteImage(id)
    await loadImages()
  }

  async function saveFromUrl() {
    if (!urlValue.trim()) return
    setUrlLoading(true)
    try {
      const res = await fetch(urlValue.trim())
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) throw new Error('Not an image')
      const data = await blobToBase64(blob)
      await saveImage({
        id: crypto.randomUUID(),
        projectId: project.id,
        data,
        name: urlValue.split('/').pop() || 'web image',
        source: 'web',
        sourceUrl: urlValue.trim(),
        addedAt: Date.now()
      })
      setUrlValue('')
      setShowUrlInput(false)
      await loadImages()
    } catch {
      alert('Could not load image from that URL. Try saving the image to your camera roll first, then upload it.')
    }
    setUrlLoading(false)
  }

  return (
    <div className="project-view">
      <div className="project-header">
        <h2>{project.name}</h2>
        <div className="project-header-actions">
          <span className="count">{images.length} images</span>
          <button className="upload-btn" onClick={() => fileRef.current.click()}>+ Add Photos</button>
          <button className="url-btn" onClick={() => setShowUrlInput(v => !v)}>🔗 URL</button>
          <button className="danger-btn" onClick={onDeleteProject}>Delete Project</button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(Array.from(e.target.files))}
      />

      {showUrlInput && (
        <div className="url-bar">
          <input
            autoFocus
            className="text-input"
            placeholder="Paste image URL…"
            value={urlValue}
            onChange={e => setUrlValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveFromUrl()}
          />
          <button className="upload-btn" onClick={saveFromUrl} disabled={urlLoading}>
            {urlLoading ? '…' : 'Save'}
          </button>
        </div>
      )}

      <div
        className="drop-zone"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        {images.length === 0 ? (
          <div className="drop-hint">
            <p>📷 Tap <strong>Add Photos</strong> to upload from your camera roll</p>
            <p>🔗 Tap <strong>URL</strong> to save any image from the web</p>
            <p>📋 Copy an image anywhere → come back → it will appear automatically</p>
            <p>📌 Use the Pinterest button in the top bar to sync your boards</p>
            <p>📱 Install this app → share any image from Safari/Chrome directly here</p>
          </div>
        ) : (
          <div className="grid">
            {images.map(img => (
              <div key={img.id} className="grid-item">
                <img
                  src={img.data}
                  alt={img.name || ''}
                  loading="lazy"
                  onClick={() => setLightbox(img)}
                />
                {img.source === 'pinterest' && <span className="pin-badge">P</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
            <img src={lightbox.data} alt="" />
            <div className="lightbox-actions">
              {lightbox.pinUrl && (
                <a href={lightbox.pinUrl} target="_blank" rel="noreferrer" className="btn-ghost">View on Pinterest</a>
              )}
              <button className="danger-btn" onClick={() => { removeImage(lightbox.id); setLightbox(null) }}>Remove</button>
              <button className="btn-ghost" onClick={() => setLightbox(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
