/**
 * 仅 backfill duration（ffprobe → music_track_meta.duration）
 * 不修改 tags / enrichment 其他字段
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-track-duration.mjs <userId> [--limit N] [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  'https://iueozzuctstwvzbcxcyh.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'music'
const CONCURRENCY = Number(process.env.DURATION_CONCURRENCY || 4)

const args = process.argv.slice(2)
const userId = args.find((a) => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const onlyMissing = !args.includes('--all')
const limitIdx = args.indexOf('--limit')
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity

if (!SERVICE_KEY || !userId) {
  console.error(
    'Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-track-duration.mjs <userId> [--limit N] [--dry-run] [--all]',
  )
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'music' },
  auth: { persistSession: false, autoRefreshToken: false },
})

const storage = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function ffprobeDuration(filePath) {
  try {
    const raw = execFileSync(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath],
      { encoding: 'utf8' },
    )
    const d = Number(JSON.parse(raw).format?.duration || 0)
    return d > 0 ? Math.round(d * 10) / 10 : null
  } catch {
    return null
  }
}

async function fetchTracks() {
  const { data, error } = await db
    .from('music_track_meta')
    .select('track_id, title, artist, duration, storage_path, size_bytes')
    .eq('user_id', userId)
  if (error) throw error
  let rows = data || []
  if (onlyMissing)
    rows = rows.filter((r) => !r.duration || Number(r.duration) <= 0)
  return rows.slice(0, limit)
}

async function download(path) {
  const { data, error } = await storage.storage.from(BUCKET).download(path)
  if (error) throw error
  const dir = mkdtempSync(join(tmpdir(), 'music-dur-'))
  const file = join(dir, basename(path))
  writeFileSync(file, Buffer.from(await data.arrayBuffer()))
  return { file, dir }
}

async function processOne(track) {
  const path = track.storage_path || `${userId}/${track.track_id}.mp3`
  let dir = null
  try {
    const { file, dir: d } = await download(path)
    dir = d
    const sec = ffprobeDuration(file)
    if (!sec) return { track, sec: null, ok: false }
    if (!dryRun) {
      await db
        .from('music_track_meta')
        .update({ duration: sec })
        .eq('user_id', userId)
        .eq('track_id', track.track_id)
    }
    return { track, sec, ok: true }
  } finally {
    if (dir)
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
  }
}

async function pool(items, worker, n) {
  let i = 0
  let ok = 0
  let fail = 0
  async function next() {
    while (i < items.length) {
      const idx = i++
      const t = items[idx]
      try {
        const r = await worker(t)
        if (r.ok) {
          ok += 1
          console.log(
            `[${ok + fail}/${items.length}] ${t.title} — ${t.artist}: ${r.sec}s`,
          )
        } else {
          fail += 1
          console.warn(
            `[${ok + fail}/${items.length}] skip ${t.title}: no duration`,
          )
        }
      } catch (err) {
        fail += 1
        console.error(
          `[${ok + fail}/${items.length}] FAIL ${t.title}: ${err.message || err}`,
        )
      }
    }
  }
  await Promise.all(Array.from({ length: n }, () => next()))
  return { ok, fail }
}

const tracks = await fetchTracks()
console.log(
  `Backfilling duration for ${tracks.length} tracks${dryRun ? ' (dry-run)' : ''}…`,
)
const { ok, fail } = await pool(tracks, processOne, CONCURRENCY)
console.log(`Done — updated=${ok} failed=${fail}`)
if (fail && !ok) process.exit(1)
