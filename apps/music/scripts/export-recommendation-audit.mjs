/**
 * 只读导出 MUSIC.OS 标签与推荐系统审核包（CSV + JSONL + Markdown + zip）
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/export-recommendation-audit.mjs [userId]
 *
 * Optional: SUPABASE_ACCESS_TOKEN（或 supabase login 钥匙串）用于 RPC smoke tests
 */
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  canonicalTrackKey,
  findSeedTrack as resolveSeedTrack,
} from './lib/trackIdentity.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MUSIC_ROOT = join(__dirname, '..')
const EXPORTS_ROOT = join(MUSIC_ROOT, 'exports')

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  'https://iueozzuctstwvzbcxcyh.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'iueozzuctstwvzbcxcyh'
const DEFAULT_USER = 'c2831538-94b0-4a57-b034-5e873a53c42e'

const userId = process.argv[2] || DEFAULT_USER

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  console.error(
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/export-recommendation-audit.mjs [userId]',
  )
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'music' },
  auth: { persistSession: false, autoRefreshToken: false },
})

/** @param {string} table @param {string} [orderCol] */
async function fetchAll(table, orderCol = 'track_id') {
  /** @type {object[]} */
  const all = []
  const pageSize = 1000
  let from = 0
  while (true) {
    let q = db.from(table).select('*').eq('user_id', userId)
    if (orderCol) q = q.order(orderCol, { ascending: true })
    const { data, error } = await q.range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

/** @param {string} table */
async function fetchAllGlobal(table) {
  /** @type {object[]} */
  const all = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .order('slug', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

/** @param {unknown} v */
function csvCell(v) {
  if (v === null || v === undefined) return ''
  const s = Array.isArray(v)
    ? v.join('; ')
    : typeof v === 'object'
      ? JSON.stringify(v)
      : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** @param {string[]} headers @param {Record<string, unknown>[]} rows */
function toCsv(headers, rows) {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(','))
  }
  return lines.join('\n') + '\n'
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function timestampSlug(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`
}

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function escSql(s) {
  return String(s).replace(/'/g, "''")
}

/** @param {string} sql */
async function runMgmtSql(sql) {
  let token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
  if (!token) {
    try {
      token = execFileSync(
        'security',
        ['find-generic-password', '-s', 'Supabase CLI', '-w'],
        {
          encoding: 'utf8',
        },
      ).trim()
    } catch {
      /* ignore */
    }
  }
  if (!token) return null

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Management API ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

const SEED_SPECS = [
  { artist: 'JENNIE', title: 'ZEN' },
  { artist: 'JENNIE', title: 'like JENNIE' },
  { artist: 'LISA', title: 'Born Again' },
  { artist: 'Dua Lipa', title: 'Hallucinate' },
  { artist: 'Dua Lipa', title: 'Houdini' },
  { artist: 'RAYE', title: 'Escapism.' },
  { artist: 'Tate McRae', title: 'exes' },
  { artist: 'Madison Beer', title: '15 MINUTES' },
  { artist: 'Connor Price', title: 'Spinnin' },
  { artist: 'bbno$', title: 'Lalala' },
  { artist: 'aespa', title: 'Whiplash' },
  { artist: 'XG', title: 'WOKE UP' },
  { artist: 'Megan Thee Stallion', title: 'Sweetest Pie' },
  { artist: 'Halsey', title: 'I am not a woman' },
  { artist: 'Charli xcx', title: 'Apple' },
]

/** @param {object[]} tracks @param {string} artist @param {string} title */
function findSeedTrack(tracks, artist, title) {
  return resolveSeedTrack(tracks, artist, title)
}

/** @param {string} trackId */
async function callGetRecommendations(trackId) {
  const sql = `
select set_config('request.jwt.claim.sub', '${escSql(userId)}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select track_id, title, artist, album, score, matched_tags, reasons
from music.get_recommendations('${escSql(trackId)}', 'same_vibe', 10, '{}'::text[]);
`
  const data = await runMgmtSql(sql)
  if (!data) throw new Error('No SUPABASE_ACCESS_TOKEN for RPC smoke tests')
  if (!Array.isArray(data)) return []
  return data
}

/** @param {Map<string, object[]>} tagsByTrack @param {string} trackId @param {string} ns */
function tagsForNs(tagsByTrack, trackId, ns) {
  return (tagsByTrack.get(trackId) || []).filter((t) => t.namespace === ns)
}

/** @param {object[]} tagRows */
function formatTagList(tagRows) {
  return tagRows
    .slice()
    .sort((a, b) => Number(b.confidence) - Number(a.confidence))
    .map((t) => `${t.tag_slug}(${Number(t.confidence).toFixed(2)}/${t.source})`)
    .join('; ')
}

/** @param {object} ctx */
function computeIssueFlags(ctx) {
  /** @type {string[]} */
  const flags = []
  const genres = ctx.genreSlugs || []
  const vibes = ctx.vibeSlugs || []
  const contexts = ctx.contextSlugs || []

  const onlyPop =
    genres.length <= 1 &&
    genres.every((g) => g === 'pop') &&
    vibes.length === 0 &&
    contexts.length === 0
  if (
    onlyPop ||
    (genres.length === 1 && genres[0] === 'pop' && vibes.length === 0)
  ) {
    flags.push('generic_pop_only')
  }
  if (vibes.length === 0) flags.push('missing_vibe')
  if (contexts.length === 0) flags.push('missing_context')
  if (ctx.tagging_status === 'partial') flags.push('partial_tags')
  if (ctx.tagging_status === 'needs_review') flags.push('needs_review')
  if (ctx.hasNeedsReviewTag && !ctx.inReviewQueue)
    flags.push('needs_review_tag_without_queue')
  if (ctx.bpm == null || Number(ctx.bpm) === 0) flags.push('missing_bpm')
  if (ctx.tag_confidence_avg != null && Number(ctx.tag_confidence_avg) < 0.65) {
    flags.push('low_confidence_tags')
  }
  if (!ctx.storage_path) flags.push('missing_storage_path')
  if (!ctx.has_embedding) flags.push('embedding_missing')
  if (ctx.bitrate_kbps != null && Number(ctx.bitrate_kbps) < 192) {
    flags.push('bad_quality')
  } else if (
    ctx.source_quality === 'low-quality' ||
    ctx.source_quality === 'standard-quality'
  ) {
    flags.push('bad_quality')
  }
  if (ctx.duplicateSuspect) flags.push('duplicate_suspect')
  if (ctx.suspiciousArtist) flags.push('suspicious_artist_match')

  return flags
}

function suggestedReviewReason(flags) {
  const parts = []
  if (flags.includes('generic_pop_only'))
    parts.push('Only generic pop; missing specific genre/vibe/context.')
  if (flags.includes('missing_vibe')) parts.push('No vibe tags.')
  if (flags.includes('missing_context')) parts.push('No context tags.')
  if (flags.includes('partial_tags')) parts.push('Tagging status is partial.')
  if (flags.includes('missing_bpm')) parts.push('BPM not analyzed.')
  if (flags.includes('low_confidence_tags'))
    parts.push('Average tag confidence below threshold.')
  return parts.join(' ') || ''
}

async function main() {
  const exportedAt = new Date().toISOString()
  const slug = timestampSlug(new Date())
  const folderName = `musicos_recommendation_audit_export_${slug}`
  const outDir = join(EXPORTS_ROOT, folderName)
  await mkdir(outDir, { recursive: true })

  // ── Fetch data (read-only, paginated) ─────────────────────────
  let meta,
    enrichRows,
    audioRows,
    dictRows,
    tagRows,
    playRows,
    recEventRows,
    reviewRows,
    embedRows
  try {
    ;[
      meta,
      enrichRows,
      audioRows,
      dictRows,
      tagRows,
      playRows,
      recEventRows,
      reviewRows,
      embedRows,
    ] = await Promise.all([
      fetchAll('music_track_meta', 'track_id'),
      fetchAll('track_enrichment', 'track_id'),
      fetchAll('track_audio_features', 'track_id'),
      fetchAllGlobal('tag_dictionary'),
      fetchAll('track_tags', 'track_id'),
      fetchAll('play_events', 'created_at'),
      fetchAll('recommendation_events', 'created_at'),
      fetchAll('tag_review_queue', 'created_at'),
      fetchAll('track_embeddings', 'track_id'),
    ])
  } catch (err) {
    throw err
  }

  const enrichById = new Map((enrichRows || []).map((r) => [r.track_id, r]))
  const audioById = new Map((audioRows || []).map((r) => [r.track_id, r]))
  const embedById = new Map((embedRows || []).map((r) => [r.track_id, r]))
  const dictBySlug = new Map((dictRows || []).map((r) => [r.slug, r]))

  /** @type {Map<string, object[]>} */
  const tagsByTrack = new Map()
  for (const t of tagRows || []) {
    const row = { ...t, namespace: dictBySlug.get(t.tag_slug)?.namespace ?? '' }
    const list = tagsByTrack.get(t.track_id) || []
    list.push(row)
    tagsByTrack.set(t.track_id, list)
  }

  // play event aggregates
  /** @type {Map<string, { complete: number, skip: number, like: number, play: number, last: string | null }>} */
  const behaviorByTrack = new Map()
  /** @type {Map<string, number>} */
  const eventTypeCounts = new Map()
  for (const pe of playRows || []) {
    eventTypeCounts.set(
      pe.event_type,
      (eventTypeCounts.get(pe.event_type) || 0) + 1,
    )
    const b = behaviorByTrack.get(pe.track_id) || {
      complete: 0,
      skip: 0,
      like: 0,
      play: 0,
      last: null,
    }
    if (pe.event_type === 'complete') b.complete += 1
    if (pe.event_type === 'skip') b.skip += 1
    if (pe.event_type === 'like') b.like += 1
    if (pe.event_type === 'play') b.play += 1
    if (!b.last || pe.created_at > b.last) b.last = pe.created_at
    behaviorByTrack.set(pe.track_id, b)
  }

  const reviewPendingIds = new Set(
    (reviewRows || [])
      .filter((r) => r.status === 'pending')
      .map((r) => r.track_id),
  )

  // duplicate title+artist
  /** @type {Map<string, number>} */
  const titleArtistCount = new Map()
  for (const m of meta) {
    const k = canonicalTrackKey(m.title, m.artist)
    titleArtistCount.set(k, (titleArtistCount.get(k) || 0) + 1)
  }

  // ── Build flat tracks ──────────────────────────────────────────
  /** @type {Record<string, unknown>[]} */
  const flatTracks = []
  /** @type {object[]} */
  const nestedLines = []

  for (const m of meta) {
    const e = enrichById.get(m.track_id) || {}
    const a = audioById.get(m.track_id) || {}
    const emb = embedById.get(m.track_id)
    const tags = tagsByTrack.get(m.track_id) || []
    const b = behaviorByTrack.get(m.track_id) || {
      complete: 0,
      skip: 0,
      like: 0,
      play: 0,
      last: null,
    }

    const genreRows = tags.filter((t) => t.namespace === 'genre')
    const vibeRows = tags.filter((t) => t.namespace === 'vibe')
    const contextRows = tags.filter((t) => t.namespace === 'context')
    const versionRows = tags.filter((t) => t.namespace === 'version')
    const qualityTagRows = tags.filter((t) => t.namespace === 'quality')
    const languageRows = tags.filter((t) => t.namespace === 'language')

    const genreSlugs = genreRows.map((t) => t.tag_slug)
    const vibeSlugs = vibeRows.map((t) => t.tag_slug)
    const contextSlugs = contextRows.map((t) => t.tag_slug)

    const hasNeedsReviewTag = tags.some((t) => t.tag_slug === 'needs-review')
    const dupKey = canonicalTrackKey(m.title, m.artist)
    const suspiciousArtist =
      norm(m.artist).length <= 3 &&
      genreSlugs.some((g) => ['k-pop', 'k-pop-solo', 'lang-ko'].includes(g)) &&
      !['iu', 'xg'].includes(norm(m.artist))

    const issueFlags = computeIssueFlags({
      genreSlugs,
      vibeSlugs,
      contextSlugs,
      tagging_status: e.tagging_status,
      hasNeedsReviewTag,
      inReviewQueue: reviewPendingIds.has(m.track_id),
      bpm: a.bpm,
      tag_confidence_avg: e.tag_confidence_avg,
      storage_path: m.storage_path,
      has_embedding: Boolean(emb),
      bitrate_kbps: e.bitrate_kbps,
      source_quality: e.source_quality,
      duplicateSuspect: Boolean(e.is_duplicate || e.duplicate_of),
      suspiciousArtist,
    })

    const durationSec =
      m.duration != null && Number(m.duration) > 0 ? Number(m.duration) : null
    const sizeMb = m.size_bytes
      ? Number((Number(m.size_bytes) / (1024 * 1024)).toFixed(2))
      : null

    const flat = {
      track_id: m.track_id,
      user_id: m.user_id,
      title: m.title,
      artist: m.artist,
      album: m.album,
      duration_sec: durationSec,
      canonical_track_id: e.canonical_track_id ?? m.track_id,
      duplicate_of: e.duplicate_of ?? '',
      is_primary_version: e.is_duplicate ? 'no' : 'yes',
      storage_path: m.storage_path ?? '',
      file_size_mb: sizeMb,
      codec: e.codec ?? '',
      bitrate_kbps: e.bitrate_kbps ?? '',
      sample_rate: e.sample_rate ?? '',
      source_quality: e.source_quality ?? '',
      tagging_status: e.tagging_status ?? '',
      tag_confidence_avg: e.tag_confidence_avg ?? '',
      language: e.language ?? '',
      release_year: e.release_year ?? '',
      isrc: e.isrc ?? '',
      musicbrainz_recording_id: e.musicbrainz_recording_id ?? '',
      acoustid: e.acoustid ?? '',
      created_at: e.created_at ?? m.added_at ?? '',
      updated_at: e.updated_at ?? m.updated_at ?? '',
      genre_tags: formatTagList(genreRows),
      vibe_tags: formatTagList(vibeRows),
      context_tags: formatTagList(contextRows),
      version_tags: formatTagList(versionRows),
      quality_tags: formatTagList(qualityTagRows),
      language_tags: formatTagList(languageRows),
      all_tags: formatTagList(tags),
      bpm: a.bpm ?? '',
      musical_key: a.musical_key ?? '',
      loudness_lufs: a.loudness_lufs ?? '',
      energy: a.energy ?? '',
      danceability: a.danceability ?? '',
      valence: a.valence ?? '',
      acousticness: a.acousticness ?? '',
      instrumentalness: a.instrumentalness ?? '',
      vocal_presence: a.vocal_presence ?? '',
      intro_length_sec: a.intro_length_sec ?? '',
      outro_fade: a.outro_fade ?? '',
      play_count: m.play_count ?? 0,
      complete_count: b.complete,
      skip_count: b.skip,
      like_count: b.like + (m.liked ? 1 : 0),
      last_played_at: b.last ?? '',
      recommendation_notes: '',
      needs_review_flag:
        hasNeedsReviewTag || e.tagging_status === 'needs_review' ? 'yes' : 'no',
      issue_flags: issueFlags.join('; '),
      suggested_review_reason: suggestedReviewReason(issueFlags),
    }

    flatTracks.push(flat)

    nestedLines.push({
      track_id: m.track_id,
      identity: {
        title: m.title,
        artist: m.artist,
        album: m.album,
        duration_sec: durationSec,
        language: e.language ?? null,
        release_year: e.release_year ?? null,
        isrc: e.isrc ?? null,
        musicbrainz_recording_id: e.musicbrainz_recording_id ?? null,
        acoustid: e.acoustid ?? null,
      },
      file: {
        storage_path: m.storage_path ?? null,
        file_size_mb: sizeMb,
        codec: e.codec ?? null,
        bitrate_kbps: e.bitrate_kbps ?? null,
        sample_rate: e.sample_rate ?? null,
        source_quality: e.source_quality ?? null,
      },
      audio_features: {
        bpm: a.bpm ?? null,
        musical_key: a.musical_key ?? null,
        loudness_lufs: a.loudness_lufs ?? null,
        energy: a.energy ?? null,
        danceability: a.danceability ?? null,
        valence: a.valence ?? null,
        acousticness: a.acousticness ?? null,
        instrumentalness: a.instrumentalness ?? null,
        vocal_presence: a.vocal_presence ?? null,
        intro_length_sec: a.intro_length_sec ?? null,
        outro_fade: a.outro_fade ?? null,
      },
      tags: {
        genre: genreRows.map((t) => ({
          slug: t.tag_slug,
          confidence: Number(t.confidence),
          source: t.source,
          locked: t.locked,
        })),
        vibe: vibeRows.map((t) => ({
          slug: t.tag_slug,
          confidence: Number(t.confidence),
          source: t.source,
          locked: t.locked,
        })),
        context: contextRows.map((t) => ({
          slug: t.tag_slug,
          confidence: Number(t.confidence),
          source: t.source,
          locked: t.locked,
        })),
        version: versionRows.map((t) => ({
          slug: t.tag_slug,
          confidence: Number(t.confidence),
          source: t.source,
          locked: t.locked,
        })),
        quality: qualityTagRows.map((t) => ({
          slug: t.tag_slug,
          confidence: Number(t.confidence),
          source: t.source,
          locked: t.locked,
        })),
        language: languageRows.map((t) => ({
          slug: t.tag_slug,
          confidence: Number(t.confidence),
          source: t.source,
          locked: t.locked,
        })),
      },
      behavior: {
        play_count: m.play_count ?? 0,
        complete_count: b.complete,
        skip_count: b.skip,
        like_count: b.like + (m.liked ? 1 : 0),
        last_played_at: b.last,
      },
      recommendation_health: {
        tagging_status: e.tagging_status ?? null,
        tag_confidence_avg:
          e.tag_confidence_avg != null ? Number(e.tag_confidence_avg) : null,
        issue_flags: issueFlags,
        suggested_review_reason: suggestedReviewReason(issueFlags),
      },
    })
  }

  flatTracks.sort(
    (x, y) =>
      String(x.artist).localeCompare(String(y.artist), 'zh-CN') ||
      String(x.title).localeCompare(String(y.title), 'zh-CN'),
  )

  // ── Quality issues ─────────────────────────────────────────────
  /** @type {Record<string, unknown>[]} */
  const qualityIssues = []

  const severityMap = {
    missing_storage_path: 'critical',
    generic_pop_only: 'high',
    missing_vibe: 'high',
    missing_context: 'high',
    partial_tags: 'high',
    needs_review_tag_without_queue: 'high',
    missing_bpm: 'medium',
    embedding_missing: 'medium',
    low_confidence_tags: 'medium',
    duplicate_suspect: 'medium',
    suspicious_artist_match: 'medium',
    bad_quality: 'low',
  }

  const fixMap = {
    generic_pop_only:
      'Add specific genre/vibe/context via LLM or manual review',
    missing_vibe: 'Assign 2-4 vibe tags from dictionary',
    missing_context: 'Assign 1-3 context tags',
    partial_tags: 'Re-run LLM batch or manual review',
    missing_bpm: 'Run Essentia/librosa analysis pipeline',
    embedding_missing: 'Generate embedding when library grows',
    low_confidence_tags: 'Review tags and increase confidence sources',
    missing_storage_path: 'Fix storage upload path sync',
    bad_quality: 'Replace with higher bitrate source if available',
    duplicate_suspect: 'Dedupe by file_hash / AcoustID',
    suspicious_artist_match: 'Verify artist token matching rules',
    needs_review_tag_without_queue: 'Enqueue tag_review_queue pending item',
  }

  for (const t of flatTracks) {
    const flags = String(t.issue_flags || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const flag of flags) {
      qualityIssues.push({
        severity: severityMap[flag] || 'medium',
        issue_type: flag,
        track_id: t.track_id,
        title: t.title,
        artist: t.artist,
        details: t.suggested_review_reason || flag,
        suggested_fix: fixMap[flag] || 'Manual review',
      })
    }
  }

  if ((playRows || []).length === 0) {
    qualityIssues.push({
      severity: 'medium',
      issue_type: 'behavior_missing',
      track_id: '',
      title: '',
      artist: '',
      details:
        'No play_events recorded for this user; recommendation cannot learn from behavior yet.',
      suggested_fix:
        'Use production app after deploy; verify play_events insert',
    })
  }

  // ── Smoke tests ────────────────────────────────────────────────
  /** @type {object[]} */
  const smokeJson = []
  /** @type {Record<string, unknown>[]} */
  const smokeCsvRows = []
  let smokeOk = 0
  let smokeFail = 0
  let smokeSkip = 0

  for (const spec of SEED_SPECS) {
    const seedResult = findSeedTrack(meta, spec.artist, spec.title)
    if (!seedResult.track) {
      smokeSkip += 1
      smokeJson.push({
        seed: { track_id: null, title: spec.title, artist: spec.artist },
        mode: 'same_vibe',
        skipped: true,
        skip_reason: seedResult.reason ?? 'seed_not_found',
        near_candidates: seedResult.candidates ?? [],
        results: [],
        issues: [seedResult.reason ?? 'seed_not_found'],
      })
      continue
    }

    const seed = seedResult.track

    try {
      const results = await callGetRecommendations(seed.track_id)
      /** @type {string[]} */
      const issues = []
      if (!results.length) issues.push('empty_results')
      if (seedResult.match === 'fuzzy') issues.push('seed_fuzzy_match')

      const seenKeys = new Set()
      for (const r of results) {
        const k = canonicalTrackKey(r.title, r.artist)
        if (seenKeys.has(k)) issues.push('duplicate_in_results')
        seenKeys.add(k)
      }

      const enrichedResults = results.map((r, i) => {
        const rt = tagsByTrack.get(r.track_id) || []
        const re = enrichById.get(r.track_id) || {}
        const ra = audioById.get(r.track_id) || {}
        return {
          rank: i + 1,
          track_id: r.track_id,
          title: r.title,
          artist: r.artist,
          score: Number(r.score),
          reasons: r.reasons ?? [],
          matched_tags: r.matched_tags ?? [],
          genre_tags: rt
            .filter((t) => t.namespace === 'genre')
            .map((t) => t.tag_slug),
          vibe_tags: rt
            .filter((t) => t.namespace === 'vibe')
            .map((t) => t.tag_slug),
          context_tags: rt
            .filter((t) => t.namespace === 'context')
            .map((t) => t.tag_slug),
          energy: ra.energy ?? null,
          danceability: ra.danceability ?? null,
          tagging_status: re.tagging_status ?? null,
        }
      })

      smokeOk += 1
      smokeJson.push({
        seed: {
          track_id: seed.track_id,
          title: seed.title,
          artist: seed.artist,
          match: seedResult.match,
        },
        mode: 'same_vibe',
        results: enrichedResults,
        issues,
      })

      for (const r of enrichedResults) {
        smokeCsvRows.push({
          seed_title: seed.title,
          seed_artist: seed.artist,
          seed_track_id: seed.track_id,
          mode: 'same_vibe',
          rank: r.rank,
          result_title: r.title,
          result_artist: r.artist,
          result_track_id: r.track_id,
          score: r.score,
          reasons: (r.reasons || []).join('; '),
          matched_tags: (r.matched_tags || []).join('; '),
          result_genre_tags: (r.genre_tags || []).join('; '),
          result_vibe_tags: (r.vibe_tags || []).join('; '),
          result_context_tags: (r.context_tags || []).join('; '),
          result_energy: r.energy ?? '',
          result_danceability: r.danceability ?? '',
          result_tagging_status: r.tagging_status ?? '',
          issue_flags: issues.join('; '),
        })
      }
    } catch (err) {
      smokeFail += 1
      smokeJson.push({
        seed: {
          track_id: seed.track_id,
          title: seed.title,
          artist: seed.artist,
        },
        mode: 'same_vibe',
        error: err.message || String(err),
        results: [],
        issues: ['rpc_error'],
      })
    }
  }

  // ── Stats ──────────────────────────────────────────────────────
  const taggingStatusDist = {}
  const sourceQualityDist = {}
  for (const e of enrichRows || []) {
    taggingStatusDist[e.tagging_status] =
      (taggingStatusDist[e.tagging_status] || 0) + 1
    if (e.source_quality) {
      sourceQualityDist[e.source_quality] =
        (sourceQualityDist[e.source_quality] || 0) + 1
    }
  }

  /** @type {Map<string, number>} */
  const tagSlugCounts = new Map()
  for (const t of tagRows || []) {
    tagSlugCounts.set(t.tag_slug, (tagSlugCounts.get(t.tag_slug) || 0) + 1)
  }
  const topTags = [...tagSlugCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([slug, count]) => ({
      slug,
      namespace: dictBySlug.get(slug)?.namespace ?? '',
      count,
    }))

  const withBpm = (audioRows || []).filter(
    (a) => a.bpm != null && Number(a.bpm) > 0,
  ).length
  const withDuration = meta.filter(
    (m) => m.duration != null && Number(m.duration) > 0,
  ).length
  const withEmbed = (embedRows || []).length
  const withVibe = flatTracks.filter(
    (t) => String(t.vibe_tags).length > 0,
  ).length
  const withContext = flatTracks.filter(
    (t) => String(t.context_tags).length > 0,
  ).length
  const partialCount = taggingStatusDist.partial || 0
  const needsReviewCount = flatTracks.filter(
    (t) => t.needs_review_flag === 'yes',
  ).length

  const issueSeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const q of qualityIssues) {
    const s = String(q.severity)
    if (s in issueSeverityCounts) issueSeverityCounts[s] += 1
  }

  const avgTagsPerTrack = meta.length ? (tagRows?.length || 0) / meta.length : 0

  const summary = {
    exported_at: exportedAt,
    user_id: userId,
    counts: {
      tracks: meta.length,
      tags: tagRows?.length || 0,
      tag_dictionary: dictRows?.length || 0,
      audio_features: audioRows?.length || 0,
      play_events: playRows?.length || 0,
      recommendation_events: recEventRows?.length || 0,
      review_queue_pending: (reviewRows || []).filter(
        (r) => r.status === 'pending',
      ).length,
      embeddings: embedRows?.length || 0,
    },
    coverage: {
      ready_tracks: taggingStatusDist.ready || 0,
      partial_tracks: partialCount,
      needs_review_tracks: needsReviewCount,
      bpm_coverage_pct: meta.length
        ? Math.round((withBpm / meta.length) * 1000) / 10
        : 0,
      embedding_coverage_pct: meta.length
        ? Math.round((withEmbed / meta.length) * 1000) / 10
        : 0,
      vibe_coverage_pct: meta.length
        ? Math.round((withVibe / meta.length) * 1000) / 10
        : 0,
      context_coverage_pct: meta.length
        ? Math.round((withContext / meta.length) * 1000) / 10
        : 0,
      duration_coverage_pct: meta.length
        ? Math.round((withDuration / meta.length) * 1000) / 10
        : 0,
    },
    top_tags: {
      all: topTags,
      vibe: topTags.filter((t) => t.namespace === 'vibe').slice(0, 10),
      genre: topTags.filter((t) => t.namespace === 'genre').slice(0, 10),
      context: topTags.filter((t) => t.namespace === 'context').slice(0, 10),
    },
    issues: issueSeverityCounts,
    smoke_tests: {
      total_seeds: SEED_SPECS.length,
      successful: smokeOk,
      failed: smokeFail,
      skipped: smokeSkip,
    },
  }

  // ── Write files ────────────────────────────────────────────────
  const flatHeaders = [
    'track_id',
    'user_id',
    'title',
    'artist',
    'album',
    'duration_sec',
    'canonical_track_id',
    'duplicate_of',
    'is_primary_version',
    'storage_path',
    'file_size_mb',
    'codec',
    'bitrate_kbps',
    'sample_rate',
    'source_quality',
    'tagging_status',
    'tag_confidence_avg',
    'language',
    'release_year',
    'isrc',
    'musicbrainz_recording_id',
    'acoustid',
    'created_at',
    'updated_at',
    'genre_tags',
    'vibe_tags',
    'context_tags',
    'version_tags',
    'quality_tags',
    'language_tags',
    'all_tags',
    'bpm',
    'musical_key',
    'loudness_lufs',
    'energy',
    'danceability',
    'valence',
    'acousticness',
    'instrumentalness',
    'vocal_presence',
    'intro_length_sec',
    'outro_fade',
    'play_count',
    'complete_count',
    'skip_count',
    'like_count',
    'last_played_at',
    'recommendation_notes',
    'needs_review_flag',
    'issue_flags',
    'suggested_review_reason',
  ]

  await writeFile(
    join(outDir, '01_tracks_flat.csv'),
    toCsv(flatHeaders, flatTracks),
    'utf8',
  )
  await writeFile(
    join(outDir, '02_tracks_nested.jsonl'),
    nestedLines.map((o) => JSON.stringify(o)).join('\n') + '\n',
    'utf8',
  )

  const dictCsv = (dictRows || [])
    .slice()
    .sort(
      (a, b) =>
        a.namespace.localeCompare(b.namespace) || a.slug.localeCompare(b.slug),
    )
    .map((d) => ({
      id: d.slug,
      namespace: d.namespace,
      slug: d.slug,
      label: d.label,
      description: d.description,
      parent_slug: d.parent_slug ?? '',
      is_active: d.is_active,
      created_at: d.created_at ?? '',
      updated_at: '',
    }))
  await writeFile(
    join(outDir, '03_tag_dictionary.csv'),
    toCsv(
      [
        'id',
        'namespace',
        'slug',
        'label',
        'description',
        'parent_slug',
        'is_active',
        'created_at',
        'updated_at',
      ],
      dictCsv,
    ),
    'utf8',
  )

  const metaById = new Map(meta.map((m) => [m.track_id, m]))
  const longTags = (tagRows || [])
    .map((t) => ({
      track_id: t.track_id,
      title: metaById.get(t.track_id)?.title ?? '',
      artist: metaById.get(t.track_id)?.artist ?? '',
      namespace: dictBySlug.get(t.tag_slug)?.namespace ?? '',
      tag_slug: t.tag_slug,
      tag_label: dictBySlug.get(t.tag_slug)?.label ?? '',
      confidence: t.confidence,
      source: t.source,
      locked: t.locked,
      created_at: t.created_at,
    }))
    .sort(
      (a, b) =>
        a.artist.localeCompare(b.artist, 'zh-CN') ||
        a.title.localeCompare(b.title, 'zh-CN') ||
        a.namespace.localeCompare(b.namespace) ||
        Number(b.confidence) - Number(a.confidence),
    )
  await writeFile(
    join(outDir, '04_track_tags_long.csv'),
    toCsv(
      [
        'track_id',
        'title',
        'artist',
        'namespace',
        'tag_slug',
        'tag_label',
        'confidence',
        'source',
        'locked',
        'created_at',
      ],
      longTags,
    ),
    'utf8',
  )

  const audioCsv = (audioRows || []).map((a) => ({
    track_id: a.track_id,
    title: metaById.get(a.track_id)?.title ?? '',
    artist: metaById.get(a.track_id)?.artist ?? '',
    bpm: a.bpm ?? '',
    musical_key: a.musical_key ?? '',
    loudness_lufs: a.loudness_lufs ?? '',
    energy: a.energy ?? '',
    danceability: a.danceability ?? '',
    valence: a.valence ?? '',
    acousticness: a.acousticness ?? '',
    instrumentalness: a.instrumentalness ?? '',
    vocal_presence: a.vocal_presence ?? '',
    intro_length_sec: a.intro_length_sec ?? '',
    outro_fade: a.outro_fade ?? '',
    analyzed_at: a.analyzed_at ?? '',
    feature_source: 'heuristic_or_llm_inferred',
    notes: !a.bpm || Number(a.bpm) === 0 ? 'missing_bpm' : '',
  }))
  await writeFile(
    join(outDir, '05_audio_features.csv'),
    toCsv(
      [
        'track_id',
        'title',
        'artist',
        'bpm',
        'musical_key',
        'loudness_lufs',
        'energy',
        'danceability',
        'valence',
        'acousticness',
        'instrumentalness',
        'vocal_presence',
        'intro_length_sec',
        'outro_fade',
        'analyzed_at',
        'feature_source',
        'notes',
      ],
      audioCsv,
    ),
    'utf8',
  )

  const enrichCsv = (enrichRows || []).map((e) => ({
    track_id: e.track_id,
    title: metaById.get(e.track_id)?.title ?? '',
    artist: metaById.get(e.track_id)?.artist ?? '',
    album: metaById.get(e.track_id)?.album ?? '',
    codec: e.codec ?? '',
    bitrate_kbps: e.bitrate_kbps ?? '',
    sample_rate: e.sample_rate ?? '',
    duration_sec: metaById.get(e.track_id)?.duration ?? '',
    source_quality: e.source_quality ?? '',
    tagging_status: e.tagging_status ?? '',
    tag_confidence_avg: e.tag_confidence_avg ?? '',
    enrichment_source: 'enrich-track-tags.mjs + llm-tag-partial-tracks.mjs',
    file_hash: e.file_hash ?? '',
    version_type: e.version_type ?? '',
    is_live: e.is_live,
    is_remix: e.is_remix,
    is_cover: e.is_cover,
    is_duplicate: e.is_duplicate,
    language: e.language ?? '',
    release_year: e.release_year ?? '',
    isrc: e.isrc ?? '',
    musicbrainz_recording_id: e.musicbrainz_recording_id ?? '',
    acoustid: e.acoustid ?? '',
    created_at: e.created_at ?? '',
    updated_at: e.updated_at ?? '',
    raw_json: JSON.stringify(e),
  }))
  await writeFile(
    join(outDir, '06_track_enrichment.csv'),
    toCsv(
      [
        'track_id',
        'title',
        'artist',
        'album',
        'codec',
        'bitrate_kbps',
        'sample_rate',
        'duration_sec',
        'source_quality',
        'tagging_status',
        'tag_confidence_avg',
        'enrichment_source',
        'file_hash',
        'version_type',
        'is_live',
        'is_remix',
        'is_cover',
        'is_duplicate',
        'language',
        'release_year',
        'isrc',
        'musicbrainz_recording_id',
        'acoustid',
        'created_at',
        'updated_at',
        'raw_json',
      ],
      enrichCsv,
    ),
    'utf8',
  )

  const playCsv = (playRows || []).map((p) => ({
    id: p.id,
    user_id: p.user_id,
    track_id: p.track_id,
    title: metaById.get(p.track_id)?.title ?? '',
    artist: metaById.get(p.track_id)?.artist ?? '',
    event_type: p.event_type,
    position_sec: p.position_sec ?? '',
    played_ratio: p.played_ratio ?? '',
    context: p.context ?? '',
    metadata: p.metadata ? JSON.stringify(p.metadata) : '',
    created_at: p.created_at,
  }))
  await writeFile(
    join(outDir, '07_play_events.csv'),
    toCsv(
      [
        'id',
        'user_id',
        'track_id',
        'title',
        'artist',
        'event_type',
        'position_sec',
        'played_ratio',
        'context',
        'metadata',
        'created_at',
      ],
      playCsv,
    ),
    'utf8',
  )

  const recEventCsv = (recEventRows || []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    source_track_id: r.source_track_id ?? '',
    source_title: metaById.get(r.source_track_id)?.title ?? '',
    recommended_track_id: r.recommended_track_id,
    recommended_title: metaById.get(r.recommended_track_id)?.title ?? '',
    event_type: r.event_type,
    recommendation_mode: r.recommendation_mode ?? '',
    recommendation_rank: r.recommendation_rank ?? '',
    recommendation_score: r.recommendation_score ?? '',
    matched_tags: (r.matched_tags || []).join('; '),
    request_id: r.request_id ?? '',
    context: r.context ?? '',
    created_at: r.created_at,
  }))
  await writeFile(
    join(outDir, '07b_recommendation_events.csv'),
    toCsv(
      [
        'id',
        'user_id',
        'source_track_id',
        'source_title',
        'recommended_track_id',
        'recommended_title',
        'event_type',
        'recommendation_mode',
        'recommendation_rank',
        'recommendation_score',
        'matched_tags',
        'request_id',
        'context',
        'created_at',
      ],
      recEventCsv,
    ),
    'utf8',
  )

  const reviewCsv = (reviewRows || []).map((r) => ({
    id: r.id,
    track_id: r.track_id,
    title: metaById.get(r.track_id)?.title ?? '',
    artist: metaById.get(r.track_id)?.artist ?? '',
    reason: r.reason,
    confidence: r.confidence ?? '',
    proposed_tags: JSON.stringify(r.proposed_tags ?? []),
    status: r.status,
    created_at: r.created_at,
    updated_at: r.resolved_at ?? '',
  }))
  await writeFile(
    join(outDir, '08_tag_review_queue.csv'),
    toCsv(
      [
        'id',
        'track_id',
        'title',
        'artist',
        'reason',
        'confidence',
        'proposed_tags',
        'status',
        'created_at',
        'updated_at',
      ],
      reviewCsv,
    ),
    'utf8',
  )

  const embedCsv = meta.map((m) => {
    const emb = embedById.get(m.track_id)
    return {
      track_id: m.track_id,
      title: m.title,
      artist: m.artist,
      has_embedding: emb ? 'yes' : 'no',
      embedding_dim: emb ? 1536 : '',
      model: emb?.model ?? '',
      embedding_text: emb?.embedding_text ?? '',
      updated_at: emb?.updated_at ?? '',
    }
  })
  await writeFile(
    join(outDir, '09_embeddings_summary.csv'),
    toCsv(
      [
        'track_id',
        'title',
        'artist',
        'has_embedding',
        'embedding_dim',
        'model',
        'embedding_text',
        'updated_at',
      ],
      embedCsv,
    ),
    'utf8',
  )

  await writeFile(
    join(outDir, '10_recommendation_smoke_tests.json'),
    JSON.stringify(smokeJson, null, 2) + '\n',
    'utf8',
  )
  await writeFile(
    join(outDir, '11_recommendation_smoke_tests.csv'),
    toCsv(
      [
        'seed_title',
        'seed_artist',
        'seed_track_id',
        'mode',
        'rank',
        'result_title',
        'result_artist',
        'result_track_id',
        'score',
        'reasons',
        'matched_tags',
        'result_genre_tags',
        'result_vibe_tags',
        'result_context_tags',
        'result_energy',
        'result_danceability',
        'result_tagging_status',
        'issue_flags',
      ],
      smokeCsvRows,
    ),
    'utf8',
  )

  await writeFile(
    join(outDir, '12_quality_issues.csv'),
    toCsv(
      [
        'severity',
        'issue_type',
        'track_id',
        'title',
        'artist',
        'details',
        'suggested_fix',
      ],
      qualityIssues,
    ),
    'utf8',
  )

  await writeFile(
    join(outDir, '13_export_summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  )

  // README
  const eventDistLines = [...eventTypeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n')

  const readme = `# MUSIC.OS 标签与推荐系统 · 审核导出包

## 1. 导出信息

- **导出时间：** ${exportedAt}
- **user_id：** \`${userId}\`
- **导出脚本：** \`apps/music/scripts/export-recommendation-audit.mjs\`
- **只读导出：** 未修改 Supabase 数据

## 2. 曲库概览

| 指标 | 数值 |
|------|------|
| 曲库总数 | ${meta.length} |
| 标签总行数 | ${tagRows?.length || 0} |
| 平均每首 tag 数 | ${avgTagsPerTrack.toFixed(2)} |
| partial 曲目 | ${partialCount} |
| needs_review 标记 | ${needsReviewCount} |

### tagging_status 分布

${Object.entries(taggingStatusDist)
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join('\n')}

### source_quality 分布

${Object.entries(sourceQualityDist)
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join('\n')}

## 3. 标签分布 Top 30

${topTags.map((t, i) => `${i + 1}. \`${t.slug}\` (${t.namespace}) — ${t.count} 首`).join('\n')}

## 4. 覆盖率

| 维度 | 覆盖率 |
|------|--------|
| BPM | ${summary.coverage.bpm_coverage_pct}% |
| Duration | ${summary.coverage.duration_coverage_pct}% |
| Embedding | ${summary.coverage.embedding_coverage_pct}% |
| Vibe tags | ${summary.coverage.vibe_coverage_pct}% |
| Context tags | ${summary.coverage.context_coverage_pct}% |

## 5. play_events

- **总数：** ${playRows?.length || 0}
${(playRows?.length || 0) === 0 ? '\n> ⚠️ 当前无行为事件。推荐系统尚未开始「越用越准」。\n' : ''}
${eventDistLines ? `### event_type 分布\n\n${eventDistLines}` : ''}

## 6. 推荐 Smoke Tests

- **Seed 总数：** ${SEED_SPECS.length}
- **成功：** ${smokeOk}
- **失败：** ${smokeFail}
- **跳过（曲库无 seed）：** ${smokeSkip}

详见 \`10_recommendation_smoke_tests.json\` 与 \`11_recommendation_smoke_tests.csv\`。

## 7. 明显问题摘要

| 严重度 | 数量 |
|--------|------|
| critical | ${issueSeverityCounts.critical} |
| high | ${issueSeverityCounts.high} |
| medium | ${issueSeverityCounts.medium} |
| low | ${issueSeverityCounts.low} |

详见 \`12_quality_issues.csv\`。

## 8. 文件说明

| 文件 | 用途 |
|------|------|
| 01_tracks_flat.csv | **主审核表** — 每行一曲，含聚合 tags 与 issue flags |
| 02_tracks_nested.jsonl | LLM/程序可读 nested 结构 |
| 04_track_tags_long.csv | 标签 long format |
| 12_quality_issues.csv | 自动检测问题清单 |

## 9. 下一步建议（顾问填写）

<!-- 请顾问在此补充 -->

---

*Generated by export-recommendation-audit.mjs*
`

  await writeFile(join(outDir, '00_README.md'), readme, 'utf8')

  // ── Zip ────────────────────────────────────────────────────────
  const zipName = `${folderName}.zip`
  const zipPath = join(EXPORTS_ROOT, zipName)
  execFileSync('zip', ['-r', zipPath, folderName], {
    cwd: EXPORTS_ROOT,
    encoding: 'utf8',
  })

  console.log('')
  console.log('Export complete:')
  console.log(`Folder: apps/music/exports/${folderName}`)
  console.log(`Zip: apps/music/exports/${zipName}`)
  console.log(`Tracks: ${meta.length}`)
  console.log(`Tags: ${tagRows?.length || 0}`)
  console.log(`Issues: ${qualityIssues.length}`)
  console.log(
    `Smoke tests: ${smokeOk}/${SEED_SPECS.length} successful (${smokeFail} failed, ${smokeSkip} skipped)`,
  )
  console.log('')
  console.log('Next steps:')
  console.log('- Share zip with product/recommendation advisor')
  console.log('- Review 01_tracks_flat.csv and 12_quality_issues.csv first')
  if ((playRows?.length || 0) === 0) {
    console.log(
      '- Production play_events still 0: use app on musicos-ken.netlify.app to generate behavior data',
    )
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
