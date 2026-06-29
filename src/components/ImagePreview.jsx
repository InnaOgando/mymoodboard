import { useEffect, useRef } from 'react'
import { useCachedImage } from '../ImageImportService.js'

export default function ImagePreview({ el, onClose }) {
  const { ref, visibleSrc, placeholderSrc } = useCachedImage(el.content.src, el.content.hash)
  const startY = useRef(null)

  // Swipe-down to close
  useEffect(() => {
    function onTouchStart(e) { startY.current = e.touches[0].clientY }
    function onTouchEnd(e) {
      if (startY.current === null) return
      const dy = e.changedTouches[0].clientY - startY.current
      if (dy > 80) onClose()
      startY.current = null
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [onClose])

  // Keyboard Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const src = visibleSrc || placeholderSrc

  return (
    <div className="preview-overlay" onClick={onClose}>
      <button className="preview-close" onClick={onClose}>✕</button>
      <div className="preview-img-wrap" onClick={e => e.stopPropagation()}>
        <img
          ref={ref}
          src={src}
          alt={el.content.caption || ''}
          draggable={false}
          className="preview-img"
        />
        {el.content.caption && (
          <div className="preview-caption">{el.content.caption}</div>
        )}
      </div>
    </div>
  )
}
