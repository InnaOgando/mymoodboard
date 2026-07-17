// Owner-level backup — downloads EVERY tester's data from your Supabase project.
// Dumps the `boards` and `elements` tables to JSON and downloads every file
// from the `images` storage bucket into a timestamped local folder.
//
// USAGE (run on your computer, never commit the key):
//   SUPABASE_URL="https://xxxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
//   node scripts/backup-all.mjs
//
// Get the service_role key from: Supabase dashboard → Project Settings → API.
// The service_role key bypasses row-level security, so it can read ALL users.
// Keep it secret. Do not put it in the app or commit it.

import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const outDir = path.resolve(`refmemo-backup-${stamp}`)
await mkdir(path.join(outDir, 'images'), { recursive: true })

// 1) Database tables
for (const table of ['boards', 'elements']) {
  const { data, error } = await supabase.from(table).select('*')
  if (error) { console.error(`[${table}]`, error.message); continue }
  await writeFile(path.join(outDir, `${table}.json`), JSON.stringify(data, null, 2))
  console.log(`saved ${data.length} rows -> ${table}.json`)
}

// 2) Storage bucket 'images' (recurse into each user's folder)
async function listAll(prefix = '') {
  const out = []
  const { data, error } = await supabase.storage.from('images').list(prefix, { limit: 1000 })
  if (error) { console.error('[list]', prefix, error.message); return out }
  for (const item of data) {
    const full = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id === null) out.push(...await listAll(full)) // folder
    else out.push(full)
  }
  return out
}

const files = await listAll()
console.log(`downloading ${files.length} images…`)
let n = 0
for (const p of files) {
  const { data, error } = await supabase.storage.from('images').download(p)
  if (error) { console.error('[download]', p, error.message); continue }
  const buf = Buffer.from(await data.arrayBuffer())
  await writeFile(path.join(outDir, 'images', p.replace(/\//g, '__')), buf)
  if (++n % 25 === 0) console.log(`  ${n}/${files.length}`)
}
console.log(`\n✅ Done. Backup saved to: ${outDir}`)
