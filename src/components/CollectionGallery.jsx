import { useState, useRef, useEffect } from 'react'
import { getCollectionItems } from './objects/CollectionObject'
import { useCachedImage } from '../ImageImportService.js'

function GalleryImage({ item }) {
  const { ref, visibleSrc, placeholderSrc } = useCachedImage(item.content.src, item.content.hash)
  const src = visibleSrc || placeholderSrc
  return (
    <img ref={ref} src={src} alt={item.content.caption || ''} draggable={false} className="gallery-img" />
  )
}

export default function CollectionGallery({ el, onClose }) {
  const items = getCollectionItems(el.content).filter(i => i.type === 'image')
  const [index, setIndex] = useState(0)
  const startX = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex(i => Math.min(i + 1, items.length - 1))
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, items.length])

  function onTouchStart(e) { startX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    if (dx < -50) setIndex(i => Math.min(i + 1, items.length - 1))
    if (dx > 50)  setIndex(i => Math.max(i - 1, 0))
    startX.current = null
  }

  if (!items.length) {
    return (
      <div className="preview-overlay" onClick={onClose}>
        <button className="preview-close" onClick={onClose}>✕</button>
        <div className="gallery-empty">No images in this collection</div>
      </div>
    )
  }

  const current = items[index]

  return (
    <div
      className="preview-overlay"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button className="preview-close" onClick={onClose}>✕</button>
      <div className="gallery-counter">{index + 1} / {items.length}</div>
      <div className="preview-img-wrap" onClick={e => e.stopPropagation()}>
        <GalleryImage key={current.id} item={current} />
        {current.content.caption && (
          <div className="preview-caption">{current.content.caption}</div>
        )}
      </div>
      {index > 0 && (
        <button className="gallery-arrow gallery-arrow--left"
          onClick={e => { e.stopPropagation(); setIndex(i => i - 1) }}>‹</button>
      )}
      {index < items.length - 1 && (
        <button className="gallery-arrow gallery-arrow--right"
          onClick={e => { e.stopPropagation(); setIndex(i => i + 1) }}>›</button>
      )}
    </div>
  )
}
