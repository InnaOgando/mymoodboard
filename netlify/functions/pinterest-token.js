// Exchanges Pinterest OAuth code for an access token.
// Needs PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET set in Netlify env vars.
export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { code, redirectUri } = await req.json()

  const clientId = process.env.PINTEREST_CLIENT_ID
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Server not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const credentials = btoa(`${clientId}:${clientSecret}`)

  const res = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  })

  const data = await res.json()

  if (!res.ok) {
    return new Response(JSON.stringify({ error: data.message || 'Token exchange failed' }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ access_token: data.access_token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

export const config = { path: '/api/pinterest-token' }
