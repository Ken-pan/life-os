/**
 * LLM 批量补标：track_enrichment.tagging_status = 'partial' 的曲目
 *
 * Usage:
 *   OPENAI_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/llm-tag-partial-tracks.mjs <userId> [--limit N] [--dry-run] [--batch N]
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? 'https://iueozzuctstwvzbcxcyh.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const MODEL = process.env.LLM_TAG_MODEL || 'gpt-4o-mini'
const BATCH_SIZE = Number(process.env.LLM_TAG_BATCH || 8)

const args = process.argv.slice(2)
const userId = args.find((a) => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const missingVibeOnly = args.includes('--missing-vibe')
const includePartial = args.includes('--partial') || !missingVibeOnly
const limitIdx = args.indexOf('--limit')
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity
const batchIdx = args.indexOf('--batch')
const batchSize = batchIdx >= 0 ? Number(args[batchIdx + 1]) : BATCH_SIZE

if (!SERVICE_KEY || !OPENAI_API_KEY || !userId) {
  console.error(
    'Usage: OPENAI_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/llm-tag-partial-tracks.mjs <userId> [--limit N] [--dry-run] [--batch N]',
  )
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'music' },
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Paginated fetch — Supabase defaults to 1000 rows max per request. */
async function fetchAllRows(
  table,
  filters = () => null,
  orderCol = 'track_id',
) {
  /** @type {object[]} */
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    let q = db
      .from(table)
      .select('*')
      .order(orderCol)
      .range(from, from + pageSize - 1)
    q = filters(q) ?? q
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}

/** @type {Set<string>} */
let validSlugs = new Set()
/** @type {Map<string, string>} slug -> namespace */
const slugNamespace = new Map()

const DICT = {
  genre: [
    'pop',
    'dance-pop',
    'electropop',
    'dark-pop',
    'alt-pop',
    'k-pop',
    'k-pop-solo',
    'girl-group',
    'j-pop',
    'c-pop',
    'mandopop',
    'hip-hop',
    'rap',
    'asian-hip-hop',
    'r-and-b',
    'alt-r-and-b',
    'edm',
    'house',
    'techno',
    'trance',
    'melodic-techno',
    'hyperpop',
    'soundtrack',
    'game-ost',
    'anime',
    'ambient',
    'sleep',
  ],
  vibe: [
    'baddie',
    'girl-crush',
    'runway',
    'club',
    'sexy',
    'quirky',
    'meme',
    'dark',
    'euphoric',
    'cute',
    'dramatic',
    'confident',
    'rebellious',
    'luxury',
    'neon',
    'night-drive',
    'soft',
    'sad',
    'angry',
    'playful',
    'cinematic',
    'boss-fight',
  ],
  context: [
    'homepage-safe',
    'playlist-continue-good',
    'gym',
    'walking',
    'running',
    'party',
    'focus',
    'shower',
    'game',
    'background',
    'karaoke',
    'transition-safe',
  ],
  language: ['lang-en', 'lang-ko', 'lang-ja', 'lang-zh'],
  version: [
    'original',
    'remix',
    'cover',
    'live',
    'sped-up',
    'slowed',
    'instrumental',
    'radio-edit',
    'explicit',
    'clean',
  ],
}

for (const [ns, slugs] of Object.entries(DICT)) {
  for (const s of slugs) {
    validSlugs.add(s)
    slugNamespace.set(s, ns)
  }
}

const SYSTEM_PROMPT = `You tag tracks for a personal music library. Taste profile:
- K-pop girl crush / baddie / club (BLACKPINK, aespa, IVE, NewJeans)
- Western dance-pop & confident pop (Dua Lipa, Doja Cat, RAYE, Tate McRae, Ariana)
- Also: Taylor Swift, Olivia Rodrigo, Troye Sivan, Sia, indie pop, alt-pop, R&B, occasional hip-hop/meme

Rules:
1. ONLY use slug values from the dictionaries below — never invent slugs.
2. Each track: 1-3 genre, 2-4 vibe, 1-3 context, 0-1 language, optional version tags.
3. energy/danceability/valence are integers 1-5 (typical pop: 3-4; club/gym: 4-5; ballad: 2-3).
4. confidence 0.55-0.88 reflects how sure you are about THIS specific song (well-known hit = higher).
5. Prefer specific genres (dance-pop, alt-pop, dark-pop) over bare "pop" when the artist/song is known.
6. energy/danceability/valence MUST be integers 1-5 (not 0-1 decimals).
7. language slugs: lang-en, lang-ko, lang-ja, lang-zh only.
8. Return valid JSON only: { "tracks": [ ... ] }

Examples:
- Taylor Swift "Anti-Hero" → genre: [alt-pop, pop], vibe: [dramatic, confident], context: [homepage-safe, playlist-continue-good], lang-en, energy 3
- Olivia Rodrigo "bad idea right?" → genre: [alt-pop, pop], vibe: [playful, rebellious, confident], context: [party, playlist-continue-good], lang-en, energy 4
- Troye Sivan "Angel Baby" → genre: [pop, electropop], vibe: [soft, cute], context: [background, shower], lang-en, energy 2
- Jung Kook "3D" → genre: [k-pop-solo, pop, r-and-b], vibe: [sexy, confident, club], context: [party, gym], lang-ko, energy 4
- 薛之谦 → genre: [c-pop, mandopop], vibe: [dramatic, sad], context: [background], lang-zh, energy 3

Dictionaries:
${JSON.stringify(DICT, null, 0)}`

async function loadDictionaryFromDb() {
  const { data, error } = await db
    .from('tag_dictionary')
    .select('slug, namespace')
    .eq('is_active', true)
  if (error || !data?.length) return
  validSlugs = new Set(data.map((r) => r.slug))
  slugNamespace.clear()
  for (const r of data) slugNamespace.set(r.slug, r.namespace)
}

async function fetchPartialTracks() {
  const { data: enrich, error: e1 } = await db
    .from('track_enrichment')
    .select('track_id, tag_confidence_avg')
    .eq('user_id', userId)
    .eq('tagging_status', 'partial')
  if (e1) throw e1
  const ids = (enrich || []).map((r) => r.track_id)
  if (!ids.length) return []

  const { data: meta, error: e2 } = await db
    .from('music_track_meta')
    .select('track_id, title, artist, album, duration')
    .eq('user_id', userId)
    .in('track_id', ids)
  if (e2) throw e2

  const { data: tags, error: e3 } = await db
    .from('track_tags')
    .select('track_id, tag_slug, confidence, source')
    .eq('user_id', userId)
    .in('track_id', ids)
  if (e3) throw e3

  /** @type {Map<string, { slug: string, confidence: number, source: string }[]>} */
  const tagsByTrack = new Map()
  for (const t of tags || []) {
    const list = tagsByTrack.get(t.track_id) || []
    list.push(t)
    tagsByTrack.set(t.track_id, list)
  }

  return (meta || [])
    .map((m) => ({
      ...m,
      existing_tags: (tagsByTrack.get(m.track_id) || []).map((t) => t.tag_slug),
    }))
    .slice(0, limit)
}

async function fetchMissingVibeTracks() {
  const meta = await fetchAllRows('music_track_meta', (q) =>
    q.eq('user_id', userId),
  )
  const tags = await fetchAllRows('track_tags', (q) => q.eq('user_id', userId))
  const dict = await fetchAllRows('tag_dictionary')
  const vibeSlugs = new Set(
    (dict || []).filter((d) => d.namespace === 'vibe').map((d) => d.slug),
  )

  /** @type {Map<string, string[]>} */
  const byTrack = new Map()
  for (const t of tags || []) {
    const list = byTrack.get(t.track_id) || []
    list.push(t.tag_slug)
    byTrack.set(t.track_id, list)
  }

  return (meta || [])
    .filter(
      (m) => !(byTrack.get(m.track_id) || []).some((s) => vibeSlugs.has(s)),
    )
    .map((m) => ({ ...m, existing_tags: byTrack.get(m.track_id) || [] }))
    .slice(0, limit)
}

async function fetchTargetTracks() {
  /** @type {Map<string, object>} */
  const map = new Map()
  if (includePartial) {
    for (const t of await fetchPartialTracks()) map.set(t.track_id, t)
  }
  if (missingVibeOnly) {
    for (const t of await fetchMissingVibeTracks()) map.set(t.track_id, t)
  }
  return [...map.values()]
}

/**
 * @param {object[]} batch
 */
async function callLlm(batch) {
  const userPayload = {
    tracks: batch.map((t) => ({
      track_id: t.track_id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration_sec: t.duration || null,
      existing_tags: t.existing_tags,
    })),
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 400)}`)
  }

  const json = await res.json()
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty LLM response')

  const parsed = JSON.parse(content)
  const tracks =
    parsed.tracks || parsed.results || (Array.isArray(parsed) ? parsed : [])
  if (!Array.isArray(tracks))
    throw new Error('LLM response missing tracks array')
  return tracks
}

const LANG_ALIASES = {
  english: 'lang-en',
  en: 'lang-en',
  korean: 'lang-ko',
  ko: 'lang-ko',
  japanese: 'lang-ja',
  ja: 'lang-ja',
  chinese: 'lang-zh',
  zh: 'lang-zh',
  mandarin: 'lang-zh',
}

/** @param {string} raw @param {string} ns */
function normalizeSlug(raw, ns) {
  const slug = String(raw).trim().toLowerCase().replace(/\s+/g, '-')
  if (validSlugs.has(slug) && slugNamespace.get(slug) === ns) return slug
  if (ns === 'language') return LANG_ALIASES[slug] || null
  return null
}

/** @param {string[] | string | undefined} slugs @param {string} ns @param {number} baseConf */
function pickTags(slugs, ns, baseConf) {
  /** @type {{ slug: string, confidence: number, source: string }[]} */
  const out = []
  const list = Array.isArray(slugs) ? slugs : slugs ? [slugs] : []
  for (const raw of list) {
    const slug = normalizeSlug(raw, ns)
    if (!slug) continue
    out.push({
      slug,
      confidence: Math.min(0.88, Math.max(0.55, baseConf)),
      source: 'llm',
    })
  }
  return out
}

/** @param {object} llmRow @param {object} track @param {object[]} keepTags */
function mergeTags(llmRow, track, keepTags) {
  const conf = Number(llmRow.confidence) || 0.72
  /** @type {Map<string, { slug: string, confidence: number, source: string }>} */
  const map = new Map()

  for (const t of keepTags) {
    map.set(`${t.tag_slug}:${t.source}`, {
      slug: t.tag_slug,
      confidence: t.confidence,
      source: t.source,
    })
  }

  const llmGroups = [
    ...pickTags(llmRow.genre, 'genre', conf),
    ...pickTags(llmRow.vibe, 'vibe', conf - 0.02),
    ...pickTags(llmRow.context, 'context', conf - 0.04),
    ...pickTags(llmRow.language, 'language', conf - 0.05),
    ...pickTags(llmRow.version, 'version', conf - 0.03),
  ]

  for (const t of llmGroups) {
    const key = `${t.slug}:llm`
    map.set(key, t)
  }

  // defaults if LLM returned thin tags
  const merged = [...map.values()]
  const hasGenre = merged.some(
    (t) => slugNamespace.get(t.slug) === 'genre' && t.source === 'llm',
  )
  const hasVibe = merged.some(
    (t) => slugNamespace.get(t.slug) === 'vibe' && t.source === 'llm',
  )
  if (!hasGenre) {
    merged.push({ slug: 'pop', confidence: 0.58, source: 'llm' })
  }
  if (!hasVibe) {
    merged.push({ slug: 'confident', confidence: 0.55, source: 'llm' })
  }

  merged.push(
    { slug: 'playlist-continue-good', confidence: 0.62, source: 'llm' },
    { slug: 'transition-safe', confidence: 0.58, source: 'llm' },
  )

  // dedupe by slug prefer llm
  /** @type {Map<string, { slug: string, confidence: number, source: string }>} */
  const bySlug = new Map()
  for (const t of merged) {
    const prev = bySlug.get(t.slug)
    if (!prev || (t.source === 'llm' && prev.source !== 'llm')) {
      bySlug.set(t.slug, t)
    } else if (t.confidence > (prev?.confidence || 0)) {
      bySlug.set(t.slug, t)
    }
  }

  return [...bySlug.values()].filter((t) => t.confidence >= 0.55)
}

function clamp15(n, fallback = 3) {
  let v = Number(n)
  if (!Number.isFinite(v)) return fallback
  if (v > 0 && v <= 1) v *= 5
  return Math.max(1, Math.min(5, Math.round(v)))
}

/** @param {object} llmRow @param {object[]} tags */
function buildEnrichment(llmRow, tags) {
  const avgConf = tags.length
    ? tags.reduce((s, t) => s + t.confidence, 0) / tags.length
    : 0
  const hasLlmVibe = tags.some(
    (t) => t.source === 'llm' && slugNamespace.get(t.slug) === 'vibe',
  )
  const hasLlmGenre = tags.some(
    (t) => t.source === 'llm' && slugNamespace.get(t.slug) === 'genre',
  )
  const hasNeedsReview = tags.some((t) => t.slug === 'needs-review')

  let taggingStatus = 'partial'
  if (avgConf >= 0.65 && hasLlmVibe && hasLlmGenre && !hasNeedsReview) {
    taggingStatus = 'ready'
  } else if (avgConf < 0.55) {
    taggingStatus = 'needs_review'
  }

  const versionSlugs = tags
    .filter((t) => slugNamespace.get(t.slug) === 'version')
    .map((t) => t.slug)

  return {
    tagging_status: taggingStatus,
    tag_confidence_avg: Number(avgConf.toFixed(3)),
    version_type: versionSlugs.includes('remix')
      ? 'remix'
      : versionSlugs.includes('live')
        ? 'live'
        : versionSlugs.includes('cover')
          ? 'cover'
          : 'original',
    is_remix: versionSlugs.includes('remix'),
    is_live: versionSlugs.includes('live'),
    is_cover: versionSlugs.includes('cover'),
    analyzed_at: new Date().toISOString(),
  }
}

/** @param {object} llmRow */
function buildAudio(llmRow) {
  return {
    energy: clamp15(llmRow.energy, 3),
    danceability: clamp15(llmRow.danceability, 3),
    valence: clamp15(llmRow.valence, 3),
    vocal_presence: 4,
    analyzed_at: new Date().toISOString(),
  }
}

/** @param {object} track @param {object} llmRow @param {object[]} existingTagRows */
async function persistTrack(track, llmRow, existingTagRows) {
  const keepTags = existingTagRows.filter((t) => {
    const ns = slugNamespace.get(t.tag_slug)
    return ns === 'quality' || (ns === 'version' && t.source === 'heuristic')
  })

  let tags = mergeTags(llmRow, track, keepTags)
  tags = tags.filter((t) => t.slug !== 'needs-review')

  const enrichmentPatch = buildEnrichment(llmRow, tags)
  const audioPatch = buildAudio(llmRow)

  if (dryRun) {
    console.log(
      `  ${track.title} — ${track.artist} → ${enrichmentPatch.tagging_status}`,
    )
    console.log(`    ${tags.map((t) => t.slug).join(', ')}`)
    return
  }

  const { error: delErr } = await db
    .from('track_tags')
    .delete()
    .eq('user_id', userId)
    .eq('track_id', track.track_id)
    .in('source', ['heuristic', 'filename', 'llm'])
  if (delErr) throw delErr

  if (tags.length) {
    const { error: insErr } = await db.from('track_tags').upsert(
      tags.map((t) => ({
        user_id: userId,
        track_id: track.track_id,
        tag_slug: t.slug,
        confidence: t.confidence,
        source: t.source,
        locked: false,
      })),
    )
    if (insErr) throw insErr
  }

  const { error: enrErr } = await db
    .from('track_enrichment')
    .update(enrichmentPatch)
    .eq('user_id', userId)
    .eq('track_id', track.track_id)
  if (enrErr) throw enrErr

  const { error: audErr } = await db
    .from('track_audio_features')
    .update(audioPatch)
    .eq('user_id', userId)
    .eq('track_id', track.track_id)
  if (audErr) throw audErr
}

function chunk(arr, size) {
  /** @type {object[][]} */
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

await loadDictionaryFromDb()
const tracks = await fetchTargetTracks()
console.log(
  `LLM tagging ${tracks.length} tracks (model=${MODEL}, batch=${batchSize})${dryRun ? ' [dry-run]' : ''}${missingVibeOnly ? ' [missing-vibe]' : ''}...`,
)

if (!tracks.length) {
  console.log('No partial tracks found.')
  process.exit(0)
}

/** @type {Map<string, object>} */
const trackById = new Map(tracks.map((t) => [t.track_id, t]))
/** @type {Map<string, object[]>} */
const existingByTrack = new Map()

const allIds = tracks.map((t) => t.track_id)
const { data: allTags } = await db
  .from('track_tags')
  .select('track_id, tag_slug, confidence, source')
  .eq('user_id', userId)
  .in('track_id', allIds)
for (const t of allTags || []) {
  const list = existingByTrack.get(t.track_id) || []
  list.push(t)
  existingByTrack.set(t.track_id, list)
}

const batches = chunk(tracks, batchSize)
let ok = 0
let fail = 0
const started = Date.now()

for (let bi = 0; bi < batches.length; bi++) {
  const batch = batches[bi]
  try {
    const llmResults = await callLlm(batch)
    /** @type {Map<string, object>} */
    const llmById = new Map(llmResults.map((r) => [r.track_id, r]))

    for (const track of batch) {
      const llmRow = llmById.get(track.track_id)
      if (!llmRow) {
        console.warn(`  missing LLM row: ${track.title}`)
        fail += 1
        continue
      }
      await persistTrack(
        track,
        llmRow,
        existingByTrack.get(track.track_id) || [],
      )
      ok += 1
      console.log(
        `[${ok + fail}/${tracks.length}] ${track.title} — ${track.artist}`,
      )
    }
  } catch (err) {
    fail += batch.length
    console.error(
      `Batch ${bi + 1}/${batches.length} FAIL: ${err.message || err}`,
    )
  }

  if (bi < batches.length - 1) {
    await new Promise((r) => setTimeout(r, 400))
  }
}

console.log(
  `Done in ${((Date.now() - started) / 1000).toFixed(1)}s — ok=${ok} fail=${fail}`,
)
if (fail && !ok) process.exit(1)
