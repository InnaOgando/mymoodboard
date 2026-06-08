const PINTEREST_AUTH_URL = 'https://www.pinterest.com/oauth/'
const PINTEREST_API = 'https://api.pinterest.com/v5'
const SCOPES = 'boards:read,pins:read,user_accounts:read'

export function getRedirectUri() {
  return `${location.origin}/auth/callback`
}

export function buildAuthURL(clientId) {
  const state = crypto.randomUUID()
  sessionStorage.setItem('pinterest_state', state)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state
  })
  return `${PINTEREST_AUTH_URL}?${params}`
}

export async function exchangeCode(code) {
  const res = await fetch('/api/pinterest-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri: getRedirectUri() })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Token exchange failed')
  return data.access_token
}

export async function fetchBoards(accessToken) {
  const res = await fetch(`${PINTEREST_API}/boards?page_size=250`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error('Pinterest auth failed — please reconnect')
  const data = await res.json()
  return data.items || []
}

export async function fetchPinsFromBoard(boardId, accessToken) {
  const pins = []
  let bookmark = null
  do {
    const params = new URLSearchParams({ page_size: '100' })
    if (bookmark) params.set('bookmark', bookmark)
    const res = await fetch(`${PINTEREST_API}/boards/${boardId}/pins?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) break
    const data = await res.json()
    pins.push(...(data.items || []))
    bookmark = data.bookmark
  } while (bookmark)
  return pins
}

export function getBestImageUrl(pin) {
  const media = pin.media?.images
  if (!media) return null
  return media['600x']?.url || media['400x300']?.url || media['150x150']?.url || null
}

export async function blobToBase64(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
