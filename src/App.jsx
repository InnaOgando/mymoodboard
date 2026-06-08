import { useState, useEffect, useCallback } from 'react'
import { getProjects, saveProject, deleteProject, saveImage } from './db'
import ProjectView from './components/ProjectView'
import PinterestSync from './components/PinterestSync'
import SaveImageModal from './components/SaveImageModal'
import './App.css'

export default function App() {
  const [projects, setProjects] = useState([])
  const [activeProject, setActiveProject] = useState(null)
  const [showSync, setShowSync] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newName, setNewName] = useState('')
  const [sharedImage, setSharedImage] = useState(null) // { data, name, sourceUrl }

  useEffect(() => { loadProjects() }, [])

  // Handle Web Share Target — app opened via /share-target POST
  useEffect(() => {
    if (location.pathname === '/share-target') {
      // Service worker posts shared data via BroadcastChannel
      const bc = new BroadcastChannel('share-target')
      bc.onmessage = e => {
        setSharedImage(e.data)
        bc.close()
        history.replaceState({}, '', '/')
      }
      return () => bc.close()
    }
  }, [])

  // Handle paste from clipboard (Ctrl+V / long-press paste on mobile)
  const handlePaste = useCallback(async (e) => {
    const items = Array.from(e.clipboardData?.items || [])
    const imgItem = items.find(i => i.type.startsWith('image/'))
    if (!imgItem) return
    const blob = imgItem.getAsFile()
    const data = await blobToBase64(blob)
    setSharedImage({ data, name: 'Pasted image', sourceUrl: null })
  }, [])

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  async function loadProjects() {
    const list = await getProjects()
    setProjects(list)
    if (list.length > 0 && !activeProject) setActiveProject(list[0])
  }

  async function createProject() {
    if (!newName.trim()) return
    const project = { id: crypto.randomUUID(), name: newName.trim(), createdAt: Date.now() }
    await saveProject(project)
    setNewName('')
    setShowNewProject(false)
    const updated = await getProjects()
    setProjects(updated)
    setActiveProject(project)
  }

  async function removeProject(id) {
    if (!confirm('Delete this project and all its images?')) return
    await deleteProject(id)
    setActiveProject(null)
    await loadProjects()
  }

  async function handleSaveShared(projectId) {
    if (!sharedImage || !projectId) return
    await saveImage({
      id: crypto.randomUUID(),
      projectId,
      data: sharedImage.data,
      name: sharedImage.name || 'Shared image',
      source: 'web',
      sourceUrl: sharedImage.sourceUrl || null,
      addedAt: Date.now()
    })
    setSharedImage(null)
    // switch to target project
    const proj = projects.find(p => p.id === projectId)
    if (proj) setActiveProject(proj)
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">My Moodboard</span>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => setShowSync(true)} title="Pinterest Sync">
            <PinIcon />
          </button>
          <button className="icon-btn add-btn" onClick={() => setShowNewProject(true)} title="New Project">+</button>
        </div>
      </header>

      <nav className="project-tabs">
        {projects.map(p => (
          <button
            key={p.id}
            className={`tab ${activeProject?.id === p.id ? 'active' : ''}`}
            onClick={() => setActiveProject(p)}
          >
            {p.name}
          </button>
        ))}
        {projects.length === 0 && (
          <span className="empty-tabs">Tap + to create a project</span>
        )}
      </nav>

      <main className="content">
        {activeProject ? (
          <ProjectView
            project={activeProject}
            onDeleteProject={() => removeProject(activeProject.id)}
          />
        ) : (
          <div className="welcome">
            <div className="welcome-icon">📚</div>
            <h2>Welcome to My Moodboard</h2>
            <p>Collect visual references for your illustration projects — photos, screenshots, and Pinterest images, all in one place.</p>
            <button className="btn-primary" onClick={() => setShowNewProject(true)}>Create First Project</button>
          </div>
        )}
      </main>

      {showNewProject && (
        <div className="modal-overlay" onClick={() => setShowNewProject(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>New Project</h3>
            <input
              autoFocus
              className="text-input"
              placeholder="e.g. Forest Book, Dragon Story…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createProject()}
            />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowNewProject(false)}>Cancel</button>
              <button className="btn-primary" onClick={createProject}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showSync && (
        <PinterestSync
          onClose={() => { setShowSync(false); loadProjects() }}
          projects={projects}
          activeProject={activeProject}
        />
      )}

      {sharedImage && (
        <SaveImageModal
          image={sharedImage}
          projects={projects}
          defaultProjectId={activeProject?.id}
          onSave={handleSaveShared}
          onDiscard={() => setSharedImage(null)}
        />
      )}
    </div>
  )
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
    </svg>
  )
}
