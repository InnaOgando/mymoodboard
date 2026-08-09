// Supabase Edge Function: delete-account
// Deletes the signed-in user's account (App Store requires an in-app delete).
// Uses the service role (auto-provided to Edge Functions) to remove the auth user.
// The caller is identified from their own JWT — a user can only delete themselves.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not authenticated' }, 401)

  const url        = Deno.env.get('SUPABASE_URL')!
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    // Identify the caller from their own token.
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userErr } = await asUser.auth.getUser()
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401)

    // Delete the auth user with the service role.
    const admin = createClient(url, serviceKey)
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) {
      console.error('deleteUser failed', delErr)
      return json({ error: 'Delete failed' }, 500)
    }

    return json({ ok: true }, 200)
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
