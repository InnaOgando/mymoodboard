import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Shows a small toast when a new deployed version is available, letting the user
 * refresh into it on demand. Also checks for updates aggressively (on focus,
 * on reconnect, and every 5 min) so new deploys are picked up within seconds —
 * no more being stuck on an old cached version.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (!r) return
      const check = () => { if (navigator.onLine) r.update().catch(() => {}) }
      setInterval(check, 5 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('online', check)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="update-toast" role="status">
      <span className="update-toast-text">New version available</span>
      <button className="update-toast-btn" onClick={() => updateServiceWorker(true)}>Refresh</button>
      <button className="update-toast-x" aria-label="Dismiss" onClick={() => setNeedRefresh(false)}>×</button>
    </div>
  )
}
