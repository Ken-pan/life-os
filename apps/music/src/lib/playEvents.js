import { browser } from '$app/environment'
import { supabase } from './supabase.js'
import { MUSIC_TABLES as T } from './supabaseTables.js'
import { peekRecommendationAttribution } from './recommendationContext.js'

/** @typedef {'play' | 'complete' | 'skip' | 'like' | 'dislike' | 'replay' | 'add_to_playlist' | 'remove_from_playlist' | 'search_play'} PlayEventType */

/**
 * @typedef {object} RecordPlayEventInput
 * @property {string} trackId
 * @property {PlayEventType} eventType
 * @property {number} [positionSec]
 * @property {number} [playedRatio]
 * @property {string} [context]
 */

/** @param {string} trackId */
async function resolveCanonicalTrackId(userId, trackId) {
  const { data: enr } = await supabase
    .from(T.trackEnrichment)
    .select('canonical_track_id')
    .eq('user_id', userId)
    .eq('track_id', trackId)
    .maybeSingle()
  return enr?.canonical_track_id || trackId
}

/** @param {string} userId @param {RecordPlayEventInput} input @param {string} canonicalId @param {object | null} attr */
async function insertRecommendationEvent(userId, input, canonicalId, attr) {
  if (!attr?.sourceTrackId) return
  const recType =
    input.eventType === 'play'
      ? 'play'
      : input.eventType === 'skip'
        ? 'skip'
        : input.eventType === 'complete'
          ? 'complete'
          : input.eventType === 'like'
            ? 'like'
            : null
  if (!recType) return

  const { error } = await supabase.from(T.recommendationEvents).insert({
    user_id: userId,
    source_track_id: attr.sourceTrackId,
    recommended_track_id: canonicalId,
    event_type: recType,
    recommendation_mode: attr.mode ?? null,
    recommendation_rank: attr.rank ?? null,
    recommendation_score: attr.score ?? null,
    matched_tags: attr.matchedTags ?? null,
    request_id: attr.requestId ?? null,
    context: attr.context ?? input.context ?? null,
  })
  if (error) console.warn('[recommendationEvents]', error.message)
}

/** Fire-and-forget Supabase play_events（需登录；失败静默） */
export async function recordPlayEvent(input) {
  if (!browser || !input.trackId) return

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const trackId = await resolveCanonicalTrackId(user.id, input.trackId)
    const attr = peekRecommendationAttribution(input.trackId)
    /** @type {Record<string, unknown>} */
    const metadata = {}
    if (attr) {
      metadata.recommendation = {
        request_id: attr.requestId,
        source_track_id: attr.sourceTrackId,
        rank: attr.rank,
        score: attr.score,
        mode: attr.mode,
        matched_tags: attr.matchedTags,
        rec_context: attr.context,
      }
    }

    const { error } = await supabase.from(T.playEvents).insert({
      user_id: user.id,
      track_id: trackId,
      event_type: input.eventType,
      position_sec: input.positionSec ?? null,
      played_ratio: input.playedRatio ?? null,
      context: input.context ?? null,
      metadata,
    })
    if (error) console.warn('[playEvents]', error.message)
    else void insertRecommendationEvent(user.id, input, trackId, attr)
  } catch (err) {
    console.warn('[playEvents]', err)
  }
}

/** @param {import('./recommendationContext.js').RecommendationAttribution & { recommendedTrackId: string }} input */
export async function recordRecommendationQueueAdd(input) {
  if (!browser || !input.recommendedTrackId) return
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const canonicalId = await resolveCanonicalTrackId(
      user.id,
      input.recommendedTrackId,
    )
    const { error } = await supabase.from(T.recommendationEvents).insert({
      user_id: user.id,
      source_track_id: input.sourceTrackId,
      recommended_track_id: canonicalId,
      event_type: 'queue_add',
      recommendation_mode: input.mode ?? null,
      recommendation_rank: input.rank ?? null,
      recommendation_score: input.score ?? null,
      matched_tags: input.matchedTags ?? null,
      request_id: input.requestId ?? null,
      context: input.context ?? 'auto_continue',
    })
    if (error) console.warn('[recommendationEvents]', error.message)
  } catch (err) {
    console.warn('[recommendationEvents]', err)
  }
}

/** @param {import('./musicInteractions.js').InteractionAction} action */
export function interactionToPlayEvent(action) {
  if (action === 'play') return 'play'
  if (action === 'skip') return 'skip'
  if (action === 'complete') return 'complete'
  return null
}

/** @param {import('./musicInteractions.js').PlaySource} source */
export function playSourceToContext(source) {
  return source || 'unknown'
}
