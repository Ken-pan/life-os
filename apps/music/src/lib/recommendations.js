import { db, hydrateTrack, getRecentTracks, getLikedTracks } from './db.js'
import { supabase } from './supabase.js'
import {
  player,
  getCurrentTrack,
  appendToQueue,
  playTracks,
} from './player.svelte.js'
import { recommendationPreview } from './ui.svelte.js'
import { setRecommendationAttribution } from './recommendationContext.js'
import { recordRecommendationQueueAdd } from './playEvents.js'
import {
  getEntityPlaybackStats,
  getTimeContextBucket,
} from './musicInteractions.js'

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

const SURPRISE_QUEUE_LIMIT = 18
const SURPRISE_SEED_POOL = 8

/** @param {Set<string>} exclude */
async function pickSurpriseSeed(exclude) {
  const [recent, liked, stats] = await Promise.all([
    getRecentTracks(16),
    getLikedTracks(),
    getEntityPlaybackStats(14),
  ])
  const bucket = getTimeContextBucket()

  /** @type {{ track: import('./types.js').Track, score: number }[]} */
  const ranked = []

  for (const track of [...recent, ...liked]) {
    if (exclude.has(track.id)) continue
    if (ranked.some((r) => r.track.id === track.id)) continue
    const key = `track:${track.id}`
    const s = stats.get(key)
    let score = 0.35 + Math.random() * 0.65
    if (s) {
      score += s.completes * 0.28 - s.skips * 0.22 + s.activeLaunches * 0.12
      if (bucket === 'late_night' && s.timeMatches > 0) score += 0.35
      else if (s.timeMatches > 0) score += 0.15
    }
    ranked.push({ track, score })
  }

  if (!ranked.length) {
    const rows = await db.tracks
      .orderBy('addedAt')
      .reverse()
      .limit(40)
      .toArray()
    for (const track of rows.map(hydrateTrack)) {
      if (exclude.has(track.id)) continue
      ranked.push({ track, score: Math.random() })
    }
  }

  ranked.sort((a, b) => b.score - a.score)
  const pool = ranked.slice(0, SURPRISE_SEED_POOL)
  if (!pool.length) return null

  const total = pool.reduce((sum, item) => sum + item.score, 0)
  let roll = Math.random() * total
  for (const item of pool) {
    roll -= item.score
    if (roll <= 0) return item.track
  }
  return pool[0].track
}

/**
 * @param {ResolvedPick[]} picks
 * @param {number} limit
 */
function diversifyRecommendationPicks(picks, limit) {
  return [...picks]
    .map((pick) => ({
      ...pick,
      jitterScore: pick.score * (0.82 + Math.random() * 0.36),
    }))
    .sort((a, b) => b.jitterScore - a.jitterScore)
    .slice(0, limit)
}

/**
 * @param {Set<string>} exclude
 * @param {number} limit
 * @param {import('./types.js').Track | null} [seed]
 */
async function buildLocalSurpriseQueue(exclude, limit, seed = null) {
  const [recent, liked, stats] = await Promise.all([
    getRecentTracks(24),
    getLikedTracks(),
    getEntityPlaybackStats(21),
  ])
  const bucket = getTimeContextBucket()

  /** @type {{ track: import('./types.js').Track, score: number }[]} */
  const ranked = []

  for (const track of [...recent, ...liked]) {
    if (exclude.has(track.id)) continue
    if (seed && track.id === seed.id) continue
    if (ranked.some((r) => r.track.id === track.id)) continue
    const key = `track:${track.id}`
    const s = stats.get(key)
    let score = 0.4 + Math.random() * 0.6
    if (s) {
      score += s.completes * 0.25 - s.skips * 0.18
      if (bucket === 'late_night' && s.timeMatches > 0) score += 0.3
    }
    if (seed && track.artistKey === seed.artistKey) score += 0.12
    ranked.push({ track, score })
  }

  if (ranked.length < limit) {
    const rows = await db.tracks
      .orderBy('playCount')
      .reverse()
      .limit(60)
      .toArray()
    for (const track of rows.map(hydrateTrack)) {
      if (exclude.has(track.id) || (seed && track.id === seed.id)) continue
      if (ranked.some((r) => r.track.id === track.id)) continue
      ranked.push({ track, score: 0.25 + Math.random() * 0.75 })
    }
  }

  ranked.sort((a, b) => b.score - a.score)
  const picks = ranked.slice(0, limit)
  /** @type {import('./types.js').Track[]} */
  const tracks = []
  if (seed) tracks.push(seed)
  for (const pick of picks) {
    if (tracks.some((t) => t.id === pick.track.id)) continue
    tracks.push(pick.track)
    if (tracks.length >= limit) break
  }
  return tracks
}

/** @returns {RecommendMode} */
export function pickSurpriseMode() {
  const hour = new Date().getHours()
  const roll = Math.random()
  if (hour >= 23 || hour < 6) {
    return roll < 0.72 ? 'discovery' : 'same_vibe'
  }
  if (roll < 0.45) return 'discovery'
  if (roll < 0.78) return 'same_vibe'
  return 'same_genre'
}

/**
 * @param {{ excludeTrackIds?: string[], limit?: number, mode?: RecommendMode }} [opts]
 * @returns {Promise<{ tracks: import('./types.js').Track[], seed: import('./types.js').Track | null, attributions: Map<string, import('./recommendationContext.js').RecommendationAttribution>, mode: RecommendMode }>}
 */
export async function buildSurpriseMeQueue(opts = {}) {
  const exclude = new Set(opts.excludeTrackIds ?? [])
  const limit = opts.limit ?? SURPRISE_QUEUE_LIMIT
  const mode = opts.mode ?? pickSurpriseMode()
  const seed = await pickSurpriseSeed(exclude)
  if (!seed) return { tracks: [], seed: null, attributions: new Map(), mode }

  exclude.add(seed.id)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    try {
      const rows = await fetchRecommendations({
        seedTrackId: seed.id,
        mode,
        limit: limit + 8,
        excludeTrackIds: [...exclude],
      })
      const picks = diversifyRecommendationPicks(
        await resolveRecommendedTracks(rows),
        limit - 1,
      )
      if (picks.length >= 4) {
        const requestId = crypto.randomUUID()
        /** @type {Map<string, import('./recommendationContext.js').RecommendationAttribution>} */
        const attributions = new Map()
        const tracks = [seed]

        picks.forEach((pick, i) => {
          tracks.push(pick.track)
          attributions.set(pick.track.id, {
            requestId,
            sourceTrackId: seed.id,
            rank: i + 1,
            score: pick.score,
            matchedTags: pick.matchedTags,
            mode,
            context: 'speed_dial_surprise',
          })
        })

        return { tracks: tracks.slice(0, limit), seed, attributions, mode }
      }
    } catch {
      /* fall through to local queue */
    }
  }

  const tracks = await buildLocalSurpriseQueue(exclude, limit, seed)
  return { tracks, seed, attributions: new Map(), mode }
}

/** @param {{ excludeTrackIds?: string[], limit?: number, mode?: RecommendMode, reshuffle?: boolean }} [opts] */
export async function playSurpriseMe(opts = {}) {
  const excludeIds = opts.excludeTrackIds ?? []
  const exclude =
    opts.reshuffle !== false
      ? [...excludeIds, ...player.queue.map((t) => t.id)]
      : excludeIds

  const { tracks, seed, attributions, mode } = await buildSurpriseMeQueue({
    ...opts,
    excludeTrackIds: exclude,
  })
  if (!tracks.length) return { count: 0, seed: null, mode }

  recommendationPreview.length = 0
  for (const [trackId, attr] of attributions) {
    setRecommendationAttribution(trackId, attr)
    void recordRecommendationQueueAdd({
      ...attr,
      recommendedTrackId: trackId,
    })
  }

  playTracks(tracks, 0, 'speed_dial', {
    entityType: 'collection',
    entityId: 'surprise_me',
  })

  return { count: tracks.length, seed, mode }
}
