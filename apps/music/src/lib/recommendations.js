import { db, hydrateTrack } from './db.js'
import { supabase } from './supabase.js'
import { player, getCurrentTrack, appendToQueue } from './player.svelte.js'
import { recommendationPreview } from './ui.svelte.js'
import { setRecommendationAttribution } from './recommendationContext.js'
import { recordRecommendationQueueAdd } from './playEvents.js'

/** @typedef {'same_vibe' | 'same_genre' | 'discovery'} RecommendMode */

/** @param {string[]} tags */
export function formatRecommendationTags(tags) {
  const hide = new Set([
    'high-compressed',
    'standard-quality',
    'lossless',
    'low-quality',
    'original',
    'transition-safe',
    'playlist-continue-good',
    'homepage-safe',
  ])
  return (tags || []).filter((t) => !hide.has(t))
}

/**
 * @typedef {object} RecommendationRow
 * @property {string} track_id
 * @property {string} title
 * @property {string} artist
 * @property {string} album
 * @property {number} score
 * @property {string[]} matched_tags
 * @property {string[]} reasons
 */

/**
 * @typedef {object} ResolvedPick
 * @property {import('./types.js').Track} track
 * @property {number} score
 * @property {string[]} reasons
 * @property {string[]} matchedTags
 */

/**
 * @param {{ seedTrackId: string, mode?: RecommendMode, limit?: number, excludeTrackIds?: string[] }} opts
 * @returns {Promise<RecommendationRow[]>}
 */
export async function fetchRecommendations(opts) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase.rpc('get_recommendations', {
    p_seed_track_id: opts.seedTrackId,
    p_mode: opts.mode ?? 'same_vibe',
    p_limit: opts.limit ?? 20,
    p_exclude_track_ids: opts.excludeTrackIds ?? [],
  })

  if (error) throw error
  return /** @type {RecommendationRow[]} */ (data ?? [])
}

/**
 * @param {RecommendationRow[]} rows
 * @returns {Promise<ResolvedPick[]>}
 */
export async function resolveRecommendedTracks(rows) {
  if (!rows.length) return []
  const ids = rows.map((r) => r.track_id)
  const local = await db.tracks.bulkGet(ids)
  /** @type {ResolvedPick[]} */
  const out = []

  for (const row of rows) {
    const track = local.find((t) => t?.id === row.track_id)
    if (!track) continue
    out.push({
      track: hydrateTrack({ ...track }),
      score: Number(row.score) || 0,
      reasons: row.reasons ?? [],
      matchedTags: row.matched_tags ?? [],
    })
  }

  return out
}

/**
 * @param {{ mode?: RecommendMode, limit?: number, seedTrackId?: string }} [opts]
 */
export async function appendSimilarToQueue(opts = {}) {
  const seed = opts.seedTrackId ? { id: opts.seedTrackId } : getCurrentTrack()
  if (!seed?.id) return { added: 0, picks: [] }

  const exclude = player.queue.map((t) => t.id)
  const rows = await fetchRecommendations({
    seedTrackId: seed.id,
    mode: opts.mode ?? 'same_vibe',
    limit: opts.limit ?? 15,
    excludeTrackIds: exclude,
  })

  const picks = await resolveRecommendedTracks(rows)
  recommendationPreview.length = 0
  if (picks.length) {
    recommendationPreview.push(...picks)
    const requestId = crypto.randomUUID()
    const context =
      opts.context ??
      (player.index >= player.queue.length - 1
        ? 'auto_continue'
        : 'manual_similar')

    picks.forEach((p, i) => {
      const attr = {
        requestId,
        sourceTrackId: seed.id,
        rank: i + 1,
        score: p.score,
        matchedTags: p.matchedTags,
        mode: opts.mode ?? 'same_vibe',
        context,
      }
      setRecommendationAttribution(p.track.id, attr)
      void recordRecommendationQueueAdd({
        ...attr,
        recommendedTrackId: p.track.id,
      })
    })

    appendToQueue(picks.map((p) => p.track))
  }

  return { added: picks.length, picks }
}

/** 队列播完时自动续播（需登录 + 本地有匹配曲目） */
export async function tryAutoContinueQueue() {
  if (player.repeat !== 'off') return { added: 0, picks: [] }
  const atEnd = player.index >= player.queue.length - 1
  if (!atEnd) return { added: 0, picks: [] }

  const { added, picks } = await appendSimilarToQueue({
    mode: 'same_vibe',
    limit: 12,
  })
  return { added, picks, shouldAdvance: added > 0 }
}
