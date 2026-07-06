import { createClient } from '@supabase/supabase-js'
import { lookupMusicBrainzRecording } from './musicbrainz.js'
import { inferTags, taggingStatusFromTags } from '../src/lib/tagHeuristics.js'

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? 'https://iueozzuctstwvzbcxcyh.supabase.co'
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ??
  'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small'
const LLM_MODEL = process.env.LLM_TAG_MODEL || 'gpt-4o-mini'

/**
 * @param {string} accessToken
 * @param {{ trackIds?: string[] }} payload
 */
export async function handleImportEnrich(accessToken, payload) {
  const trackIds = Array.isArray(payload?.trackIds)
    ? payload.trackIds.filter((id) => typeof id === 'string' && id.length > 8)
    : []
  if (!accessToken) return { status: 401, body: { error: 'unauthorized' } }
  if (!trackIds.length) return { status: 400, body: { error: 'missing_track_ids' } }

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    db: { schema: 'music' },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) return { status: 401, body: { error: 'unauthorized' } }

  /** @type {{ trackId: string, mbid?: string, llm?: boolean, embedded?: boolean, error?: string }[]} */
  const results = []

  for (const trackId of trackIds.slice(0, 12)) {
    try {
      const row = await loadTrackMeta(supabase, user.id, trackId)
      if (!row) {
        results.push({ trackId, error: 'not_found' })
        continue
      }

      const mb = await lookupMusicBrainzRecording(row.artist, row.title)
      if (mb?.id) {
        await supabase.from('track_enrichment').upsert({
          user_id: user.id,
          track_id: trackId,
          musicbrainz_recording_id: mb.id,
          release_year: mb.releaseYear,
          analyzed_at: new Date().toISOString(),
        })
      }

      let llmDone = false
      const enrich = await loadEnrichment(supabase, user.id, trackId)
      const needsLlm =
        !enrich ||
        enrich.tagging_status === 'partial' ||
        enrich.tagging_status === 'needs_review'

      if (needsLlm && OPENAI_API_KEY) {
        llmDone = await runLlmTagging(supabase, user.id, row)
      }

      let embedded = false
      if (OPENAI_API_KEY) {
        embedded = await upsertEmbedding(supabase, user.id, row)
      }

      results.push({
        trackId,
        mbid: mb?.id,
        llm: llmDone,
        embedded,
      })

      await sleep(250)
    } catch (err) {
      results.push({
        trackId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    status: 200,
    body: {
      processed: results.length,
      results,
      llmEnabled: Boolean(OPENAI_API_KEY),
      embedEnabled: Boolean(OPENAI_API_KEY),
    },
  }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {string} userId @param {string} trackId */
async function loadTrackMeta(supabase, userId, trackId) {
  const { data } = await supabase
    .from('music_track_meta')
    .select('track_id, title, artist, album')
    .eq('user_id', userId)
    .eq('track_id', trackId)
    .maybeSingle()
  return data
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {string} userId @param {string} trackId */
async function loadEnrichment(supabase, userId, trackId) {
  const { data } = await supabase
    .from('track_enrichment')
    .select('tagging_status')
    .eq('user_id', userId)
    .eq('track_id', trackId)
    .maybeSingle()
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ track_id: string, title: string, artist: string, album: string }} row
 */
async function runLlmTagging(supabase, userId, row) {
  const { data: dict } = await supabase
    .from('tag_dictionary')
    .select('slug, namespace')
    .eq('is_active', true)
  const slugs = (dict || []).map((d) => d.slug).slice(0, 80)

  const prompt = `Tag this track for a personal music library. Return JSON only:
{"genre":[],"vibe":[],"context":[],"energy":3,"danceability":3,"valence":3}
Track: ${row.title} — ${row.artist} (${row.album})
Pick slugs only from: ${slugs.join(', ')}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output strict JSON for music tagging.' },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!res.ok) return false
  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content
  if (!raw) return false
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return false
  }

  /** @type {{ slug: string, confidence: number, source: string }[]} */
  const tags = []
  for (const slug of [...(parsed.genre || []), ...(parsed.vibe || []), ...(parsed.context || [])]) {
    if (typeof slug === 'string' && slugs.includes(slug)) {
      tags.push({ slug, confidence: 0.82, source: 'llm' })
    }
  }
  if (!tags.length) {
    const fallback = inferTags(row)
    tags.push(...fallback.map((t) => ({ ...t, source: 'heuristic' })))
  }

  const { taggingStatus, tagConfidenceAvg } = taggingStatusFromTags(tags)

  await supabase
    .from('track_tags')
    .delete()
    .eq('user_id', userId)
    .eq('track_id', row.track_id)
    .in('source', ['llm'])

  if (tags.length) {
    await supabase.from('track_tags').upsert(
      tags.map((t) => ({
        user_id: userId,
        track_id: row.track_id,
        tag_slug: t.slug,
        confidence: t.confidence,
        source: t.source,
        locked: false,
      })),
    )
  }

  await supabase.from('track_enrichment').upsert({
    user_id: userId,
    track_id: row.track_id,
    tagging_status: taggingStatus,
    tag_confidence_avg: tagConfidenceAvg,
    analyzed_at: new Date().toISOString(),
  })

  await supabase.from('track_audio_features').upsert({
    user_id: userId,
    track_id: row.track_id,
    energy: clamp15(parsed.energy, 3),
    danceability: clamp15(parsed.danceability, 3),
    valence: clamp15(parsed.valence, 3),
    vocal_presence: 4,
    analyzed_at: new Date().toISOString(),
  })

  if (taggingStatus === 'needs_review') {
    const { data: existing } = await supabase
      .from('tag_review_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('track_id', row.track_id)
      .eq('status', 'pending')
      .maybeSingle()
    if (!existing) {
      await supabase.from('tag_review_queue').insert({
        user_id: userId,
        track_id: row.track_id,
        reason: 'llm_low_confidence',
        confidence: tagConfidenceAvg,
        proposed_tags: tags,
        status: 'pending',
      })
    }
  }

  return true
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ track_id: string, title: string, artist: string, album: string }} row
 */
async function upsertEmbedding(supabase, userId, row) {
  const { data: tagRows } = await supabase
    .from('track_tags')
    .select('tag_slug')
    .eq('user_id', userId)
    .eq('track_id', row.track_id)

  const tagText = (tagRows || []).map((t) => t.tag_slug).join(' ')
  const embeddingText = `${row.title} ${row.artist} ${row.album} ${tagText}`.trim()

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: embeddingText.slice(0, 8000),
    }),
  })
  if (!res.ok) return false
  const data = await res.json()
  const vector = data.data?.[0]?.embedding
  if (!Array.isArray(vector)) return false

  const { error } = await supabase.from('track_embeddings').upsert({
    user_id: userId,
    track_id: row.track_id,
    embedding: vector,
    embedding_text: embeddingText,
    model: EMBED_MODEL,
    updated_at: new Date().toISOString(),
  })
  return !error
}

/** @param {number} n @param {number} fallback */
function clamp15(n, fallback = 3) {
  let v = Number(n)
  if (!Number.isFinite(v)) return fallback
  if (v > 0 && v <= 1) v *= 5
  return Math.max(1, Math.min(5, Math.round(v)))
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
