import { getRecentTracks, getLikedTracks, hydrateTrack, db } from './db.js'
import {
  getEntityPlaybackStats,
  getTimeContextBucket,
} from './musicInteractions.js'

/** @param {string[]} excludeTrackIds @param {number} [limit] */
export async function getQuickPicks(excludeTrackIds = [], limit = 6) {
  const exclude = new Set(excludeTrackIds)
  const [recent, liked, stats] = await Promise.all([
    getRecentTracks(20),
    getLikedTracks(),
    getEntityPlaybackStats(7),
  ])
  const bucket = getTimeContextBucket()

  /** @type {{ track: import('./types.js').Track, score: number }[]} */
  const ranked = []

  for (const track of [...recent, ...liked]) {
    if (exclude.has(track.id)) continue
    const key = `track:${track.id}`
    const s = stats.get(key)
    let score = 1
    if (s) {
      score += s.activeLaunches * 0.4 + s.completes * 0.15 - s.skips * 0.2
      if (bucket === 'late_night' && s.timeMatches > 0) score += 0.25
    }
    if (!ranked.some((r) => r.track.id === track.id)) {
      ranked.push({ track, score })
    }
  }

  ranked.sort((a, b) => b.score - a.score)

  /** @type {import('./types.js').Track[]} */
  const picks = []
  /** @type {Set<string>} */
  const seenAlbums = new Set()
  for (const { track } of ranked) {
    if (picks.length >= limit) break
    const albumKey = track.albumKey || track.id
    if (seenAlbums.has(albumKey) && picks.length < 6) continue
    seenAlbums.add(albumKey)
    picks.push(track)
  }

  if (picks.length < limit) {
    const rows = await db.tracks
      .orderBy('addedAt')
      .reverse()
      .limit(20)
      .toArray()
    for (const row of rows.map(hydrateTrack)) {
      if (picks.length >= limit) break
      if (exclude.has(row.id) || picks.some((p) => p.id === row.id)) continue
      const albumKey = row.albumKey || row.id
      if (seenAlbums.has(albumKey) && picks.length < 6) continue
      seenAlbums.add(albumKey)
      picks.push(row)
    }
  }

  return picks
}

/** @param {import('./types.js').Track[]} tracks */
export function quickPickTrackIds(tracks) {
  return tracks.map((track) => track.id)
}
