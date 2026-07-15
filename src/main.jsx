import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Block the browser's native pinch-to-zoom / double-tap-zoom of the whole page.
// The canvas has its own pinch-zoom (pointer events), which this does not touch.
;['gesturestart', 'gesturechange', 'gestureend'].forEach(evt =>
  document.addEventListener(evt, e => e.preventDefault(), { passive: false })
)
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) e.preventDefault()
}, { passive: false })

if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  navigator.serviceWorker.ready.then(registration => {
    setInterval(() => registration.update(), 60 * 60 * 1000)
  })
}
