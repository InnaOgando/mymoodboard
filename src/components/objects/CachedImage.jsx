import { useState, useEffect } from 'react'
import { getCachedBlob } from '../../db'

/**
 * Renders an image preferring the local Blob cache over the remote src.
 * Creates an ObjectURL from the cached Blob and revokes it on unmount.
 * Loads eagerly (no IntersectionObserver) — suitable for thumbnails already in view.
 *
 * @param {string|null} src   — remote URL (el.content.src)
 * @param {string|null} hash  — SHA-256 hash for cache lookup (el.content.hash)
 */
export default function CachedImage({ src, hash, alt, className, style, draggable }) {
  const [blobUrl, setBlobUrl] = useState(null)

  useEffect(() => {
    if (!hash) return
    let latestUrl = null
    let cancelled = false

    getCachedBlob(hash).then(blob => {
      if (cancelled || !blob) return
      const url = URL.createObjectURL(blob)
      latestUrl = url
      setBlobUrl(url)
    })

    return () => {
      cancelled = true
      if (latestUrl) URL.revokeObjectURL(latestUrl)
    }
  }, [hash])

  const displaySrc = blobUrl || src

  return (
    <img
      src={displaySrc || ''}
      alt={alt || ''}
      className={className}
      style={style}
      draggable={draggable || false}
    />
  )
}
