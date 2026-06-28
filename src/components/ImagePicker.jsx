import { useRef } from 'react'

export default function ImagePicker({ onFiles, onClose }) {
  const fileRef = useRef()

  function handleFiles(e) {
    const files = Array.from(e.target.files)
    onClose()
    onFiles(files)
    e.target.value = ''
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal image-picker-modal" onClick={e => e.stopPropagation()}>
        <h3>Add Image</h3>

        <div className="image-picker-options">
          <button className="picker-option" onClick={() => fileRef.current.click()}>
            <img src="/image.png" alt="Photos" style={{ width: 24, height: 24, objectFit: 'contain' }} />
            <span>Photos / Camera</span>
          </button>
        </div>

        <button className="btn-ghost" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>Cancel</button>

        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={handleFiles} />
      </div>
    </div>
  )
}
