import { useRef } from 'react'
import { stableFiles } from '../utils.js'
import pasteIcon   from '../assets/screenshot.svg'
import libraryIcon from '../assets/photolibrary.svg'
import cameraIcon  from '../assets/camera.svg'

const IMG = { width: 24, height: 24, objectFit: 'contain' }

export default function ImagePicker({ onFiles, onPaste, onClose }) {
  const libRef = useRef()
  const camRef = useRef()

  async function handleFiles(e) {
    // Snapshot the picked files into stable blobs BEFORE clearing the input —
    // iOS Safari can otherwise hand back a previous image's bytes (see stableFiles).
    const files = await stableFiles(Array.from(e.target.files))
    e.target.value = ''
    onClose()
    onFiles(files)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal image-picker-modal" onClick={e => e.stopPropagation()}>
        <h3>Add image</h3>

        <div className="image-picker-options">
          <button className="picker-option" onClick={() => onPaste?.()}>
            <img src={pasteIcon} alt="" style={IMG} />
            <span>Paste screenshot</span>
          </button>
          <button className="picker-option" onClick={() => libRef.current.click()}>
            <img src={libraryIcon} alt="" style={IMG} />
            <span>Photo library</span>
          </button>
          <button className="picker-option" onClick={() => camRef.current.click()}>
            <img src={cameraIcon} alt="" style={IMG} />
            <span>Take photo</span>
          </button>
        </div>

        <button className="btn-ghost" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>Cancel</button>

        <input ref={libRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFiles} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFiles} />
      </div>
    </div>
  )
}
