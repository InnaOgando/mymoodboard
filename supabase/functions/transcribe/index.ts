// Supabase Edge Function: transcribe
// Deno runtime. Proxies recorded audio to OpenAI gpt-4o-transcribe.
// The OpenAI key lives in Supabase secrets (set ONCE) — never in the app or GitHub.
// Frontend calls it via supabase.functions.invoke('transcribe', { body: { audio, mimeType } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ error: 'Missing OPENAI_API_KEY secret' }, 500)

  try {
    const { audio, mimeType } = await req.json()
    if (!audio) return json({ error: 'No audio provided' }, 400)

    const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))
    const type = mimeType || 'audio/webm'
    const ext = type.includes('mp4') ? 'mp4'
      : type.includes('mpeg') ? 'mp3'
      : type.includes('wav') ? 'wav'
      : type.includes('ogg') ? 'ogg'
      : 'webm'

    const form = new FormData()
    form.append('file', new Blob([bytes], { type }), `audio.${ext}`)
    form.append('model', 'gpt-4o-transcribe')

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    })

    if (!resp.ok) {
      console.error('OpenAI error', resp.status, await resp.text())
      return json({ error: 'Transcription failed' }, resp.status)
    }

    const data = await resp.json()
    return json({ text: data.text || '' }, 200)
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
