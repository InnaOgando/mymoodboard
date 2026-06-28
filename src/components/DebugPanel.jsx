import { useState, useEffect } from 'react'
import { getDB, getDebugStats } from '../db'
import { supabase } from '../supabase'

// Access: add ?debug=1 to the URL
export default function DebugPanel() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const dbStats = await getDebugStats()

      // Test Supabase reachability
      let supabaseOk = false
      let supabaseMs = null
      if (navigator.onLine) {
        try {
          const t0 = Date.now()
          const { error } = await supabase.from('boards').select('id').limit(1)
          supabaseMs = Date.now() - t0
          supabaseOk = !error
        } catch { supabaseOk = false }
      }

      setStats({
        online: navigator.onLine,
        supabaseOk,
        supabaseMs,
        ...dbStats,
        cacheMB: (dbStats.cacheBytes / 1024 / 1024).toFixed(2),
        checkedAt: new Date().toLocaleTimeString(),
      })
    } catch (e) {
      setStats({ error: e.message })
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  // Auto-refresh online/offline status
  useEffect(() => {
    const onOnline  = () => refresh()
    const onOffline = () => setStats(s => s ? { ...s, online: false, supabaseOk: false } : s)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <div className="debug-panel" onPointerDown={e => e.stopPropagation()}>
      <div className="debug-header">
        <span className="debug-title">Debug · ?debug=1</span>
        <button className="debug-refresh" onClick={refresh} disabled={loading}>{loading ? '…' : '↻'}</button>
      </div>

      {!stats ? (
        <div className="debug-row">Loading…</div>
      ) : stats.error ? (
        <div className="debug-row" style={{ color: '#e8315a' }}>{stats.error}</div>
      ) : (
        <>
          <div className="debug-row">
            <span>Network</span>
            <span className={stats.online ? 'debug-ok' : 'debug-bad'}>{stats.online ? 'Online' : 'Offline'}</span>
          </div>
          <div className="debug-row">
            <span>Supabase</span>
            <span className={stats.supabaseOk ? 'debug-ok' : 'debug-bad'}>
              {stats.supabaseOk ? `Connected (${stats.supabaseMs}ms)` : 'Unreachable'}
            </span>
          </div>
          <div className="debug-divider" />
          <div className="debug-row"><span>Boards (local)</span><span>{stats.boards}</span></div>
          <div className="debug-row"><span>Elements (local)</span><span>{stats.elements}</span></div>
          <div className="debug-divider" />
          <div className="debug-row"><span>Cached images</span><span>{stats.cachedImages}</span></div>
          <div className="debug-row"><span>Cache size</span><span>{stats.cacheMB} MB</span></div>
          <div className="debug-divider" />
          <div className="debug-row">
            <span>Pending ops</span>
            <span className={stats.pendingOps > 0 ? 'debug-warn' : ''}>{stats.pendingOps}</span>
          </div>
          <div className="debug-row">
            <span>Pending uploads</span>
            <span className={stats.pendingUploads > 0 ? 'debug-warn' : ''}>{stats.pendingUploads}</span>
          </div>
          <div className="debug-time">Refreshed {stats.checkedAt}</div>
        </>
      )}
    </div>
  )
}
