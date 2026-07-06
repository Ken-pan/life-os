/**
 * Tracks how recommended songs entered the queue (for play_events attribution).
 * @typedef {object} RecommendationAttribution
 * @property {string} requestId
 * @property {string} sourceTrackId
 * @property {number} rank
 * @property {number} score
 * @property {string[]} matchedTags
 * @property {string} mode
 * @property {string} context
 */

/** @type {Map<string, RecommendationAttribution>} */
const byTrackId = new Map()

/** @param {string} trackId @param {RecommendationAttribution} data */
export function setRecommendationAttribution(trackId, data) {
  if (!trackId) return
  byTrackId.set(trackId, data)
}

/** @param {string} trackId @returns {RecommendationAttribution | null} */
export function peekRecommendationAttribution(trackId) {
  return byTrackId.get(trackId) ?? null
}

/** @param {string} trackId @returns {RecommendationAttribution | null} */
export function takeRecommendationAttribution(trackId) {
  const v = byTrackId.get(trackId) ?? null
  if (v) byTrackId.delete(trackId)
  return v
}
