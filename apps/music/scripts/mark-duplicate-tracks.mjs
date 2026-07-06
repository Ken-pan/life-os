/**
 * 标记真实重复曲目 + 设置 canonical_track_id / duplicate_of
 * 只处理 normalized title+artist 完全相同的组（Unicode 安全，保留 CJK）
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/mark-duplicate-tracks.mjs <userId> [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
import { canonicalTrackKey } from './lib/trackIdentity.mjs'

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

const { data: meta, error: e1 } = await db
  .from('music_track_meta')
  .select('track_id, title, artist, size_bytes, added_at')
  .eq('user_id', userId)
if (e1) throw e1

const { data: enrich, error: e2 } = await db
  .from('track_enrichment')
  .select(
    'track_id, bitrate_kbps, is_duplicate, tagging_status, tag_confidence_avg, source_quality, created_at',
  )
  .eq('user_id', userId)
if (e2) throw e2

const enrichById = new Map((enrich || []).map((r) => [r.track_id, r]))

/** @type {Map<string, object[]>} */
const groups = new Map()
for (const m of meta || []) {
  const k = canonicalTrackKey(m.title, m.artist)
  if (k.startsWith('__invalid__')) continue
  const list = groups.get(k) || []
  list.push(m)
  groups.set(k, list)
}

/** @param {object} t */
function primaryScore(t) {
  const e = enrichById.get(t.track_id) || {}
  const quality =
    e.source_quality === 'high-compressed'
      ? 3
      : e.source_quality === 'lossless'
        ? 4
        : e.source_quality === 'standard-quality'
          ? 2
          : 1
  return {
    quality,
    confidence: Number(e.tag_confidence_avg) || 0,
    bitrate: e.bitrate_kbps || 0,
    size: t.size_bytes || 0,
    added: Number(t.added_at) || 0,
  }
}

/** @param {object} a @param {object} b */
function comparePrimary(a, b) {
  const pa = primaryScore(a)
  const pb = primaryScore(b)
  if (pb.quality !== pa.quality) return pb.quality - pa.quality
  if (pb.confidence !== pa.confidence) return pb.confidence - pa.confidence
  if (pb.bitrate !== pa.bitrate) return pb.bitrate - pa.bitrate
  if (pb.size !== pa.size) return pb.size - pa.size
  return pa.added - pb.added
}

let marked = 0
let cleared = 0
let groupsFound = 0

async function clearDuplicate(trackId, taggingStatus) {
  if (dryRun) return
  await db.from('track_enrichment').upsert({
    user_id: userId,
    track_id: trackId,
    is_duplicate: false,
    duplicate_of: null,
    canonical_track_id: trackId,
    tagging_status: taggingStatus || 'ready',
  })
  await db
    .from('track_tags')
    .delete()
    .eq('user_id', userId)
    .eq('track_id', trackId)
    .eq('tag_slug', 'duplicate')
    .eq('source', 'heuristic')
}

async function markDuplicate(trackId, primaryId, taggingStatus) {
  if (dryRun) return
  await db.from('track_enrichment').upsert({
    user_id: userId,
    track_id: trackId,
    is_duplicate: true,
    duplicate_of: primaryId,
    canonical_track_id: primaryId,
    tagging_status: taggingStatus || 'ready',
  })
  await db.from('track_tags').upsert({
    user_id: userId,
    track_id: trackId,
    tag_slug: 'duplicate',
    confidence: 0.95,
    source: 'heuristic',
    locked: false,
  })
}

for (const [, tracks] of groups) {
  if (tracks.length < 2) {
    for (const t of tracks) {
      const e = enrichById.get(t.track_id)
      if (e?.is_duplicate || e?.duplicate_of) {
        await clearDuplicate(t.track_id, e?.tagging_status)
        cleared += 1
      } else if (
        !e?.canonical_track_id ||
        e.canonical_track_id !== t.track_id
      ) {
        if (!dryRun) {
          await db.from('track_enrichment').upsert({
            user_id: userId,
            track_id: t.track_id,
            canonical_track_id: t.track_id,
            duplicate_of: null,
            is_duplicate: false,
            tagging_status: e?.tagging_status || 'ready',
          })
        }
      }
    }
    continue
  }

  groupsFound += 1
  const sorted = tracks.slice().sort(comparePrimary)
  const keep = sorted[0]
  const dupes = sorted.slice(1)

  console.log(
    `Duplicate group (${tracks.length}): ${keep.title} — ${keep.artist}`,
  )
  console.log(`  primary: ${keep.track_id.slice(0, 12)}…`)

  if (!dryRun) {
    await db.from('track_enrichment').upsert({
      user_id: userId,
      track_id: keep.track_id,
      is_duplicate: false,
      duplicate_of: null,
      canonical_track_id: keep.track_id,
      tagging_status: enrichById.get(keep.track_id)?.tagging_status || 'ready',
    })
    await db
      .from('track_tags')
      .delete()
      .eq('user_id', userId)
      .eq('track_id', keep.track_id)
      .eq('tag_slug', 'duplicate')
      .eq('source', 'heuristic')
  }

  for (const d of dupes) {
    console.log(`  dupe: ${d.track_id.slice(0, 12)}…`)
    await markDuplicate(
      d.track_id,
      keep.track_id,
      enrichById.get(d.track_id)?.tagging_status,
    )
    marked += 1
  }
}

console.log(
  `Done — ${groupsFound} duplicate groups, marked ${marked} dupes, cleared ${cleared} false positives${dryRun ? ' (dry-run)' : ''}`,
)
