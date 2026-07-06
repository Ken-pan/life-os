/**
 * 标记同 title+artist 重复曲目（保留最高码率一条，其余 is_duplicate=true）
 * 只读 storage；仅更新 track_enrichment.is_duplicate
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/mark-duplicate-tracks.mjs <userId> [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  'https://iueozzuctstwvzbcxcyh.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const userId = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

if (!SERVICE_KEY || !userId) {
  console.error(
    'Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/mark-duplicate-tracks.mjs <userId> [--dry-run]',
  )
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'music' },
  auth: { persistSession: false, autoRefreshToken: false },
})

function normKey(title, artist) {
  const clean = (s) =>
    String(s ?? '')
      .toLowerCase()
      .replace(
        /\s*\([^)]*(explicit|live|remix|version|edit|sped|slowed|instrumental)[^)]*\)/gi,
        '',
      )
      .replace(/[^\w\s''&$;]+/g, ' ')
      .trim()
  return `${clean(title)}::${clean(artist)}`
}

const { data: meta, error: e1 } = await db
  .from('music_track_meta')
  .select('track_id, title, artist, size_bytes')
  .eq('user_id', userId)
if (e1) throw e1

const { data: enrich, error: e2 } = await db
  .from('track_enrichment')
  .select('track_id, bitrate_kbps, is_duplicate')
  .eq('user_id', userId)
if (e2) throw e2

const enrichById = new Map((enrich || []).map((r) => [r.track_id, r]))

/** @type {Map<string, object[]>} */
const groups = new Map()
for (const m of meta || []) {
  const k = normKey(m.title, m.artist)
  const list = groups.get(k) || []
  list.push(m)
  groups.set(k, list)
}

let marked = 0
let cleared = 0

for (const [key, tracks] of groups) {
  if (tracks.length < 2) {
    for (const t of tracks) {
      const e = enrichById.get(t.track_id)
      if (e?.is_duplicate && !dryRun) {
        await db
          .from('track_enrichment')
          .update({ is_duplicate: false })
          .eq('user_id', userId)
          .eq('track_id', t.track_id)
        cleared += 1
      }
    }
    continue
  }

  const sorted = tracks.slice().sort((a, b) => {
    const ba = enrichById.get(a.track_id)?.bitrate_kbps || 0
    const bb = enrichById.get(b.track_id)?.bitrate_kbps || 0
    if (bb !== ba) return bb - ba
    return (b.size_bytes || 0) - (a.size_bytes || 0)
  })

  const keep = sorted[0]
  const dupes = sorted.slice(1)
  console.log(
    `Duplicate group (${tracks.length}): ${keep.title} — ${keep.artist}`,
  )
  console.log(
    `  keep: ${keep.track_id.slice(0, 12)}… bitrate=${enrichById.get(keep.track_id)?.bitrate_kbps ?? '?'}`,
  )

  for (const d of dupes) {
    console.log(`  dupe: ${d.track_id.slice(0, 12)}…`)
    if (!dryRun) {
      await db.from('track_enrichment').upsert({
        user_id: userId,
        track_id: d.track_id,
        is_duplicate: true,
        tagging_status: enrichById.get(d.track_id)?.tagging_status || 'ready',
      })
    }
    marked += 1
  }

  if (!dryRun) {
    await db
      .from('track_enrichment')
      .update({ is_duplicate: false })
      .eq('user_id', userId)
      .eq('track_id', keep.track_id)
  }
}

console.log(
  `Done — marked ${marked} duplicates${dryRun ? ' (dry-run)' : ''}, cleared ${cleared} false positives`,
)
