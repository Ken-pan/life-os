import { fetchWithRetry } from './fetchUtils.js'
import { db, slugKey, trackWords } from './db.js'
import { upsertAlbumArt } from './albumArtStore.js'

const LOOKUP_TIMEOUT_MS = 10_000
const LOOKUP_CACHE = new Map()

/** @typedef {{ title: string, artist: string, album: string, artUrl: string | null, releaseYear: number | null, trackTimeMillis: number | null }} ItunesTrackHit */

/**
 * @param {string} artist
 * @param {string} title
 * @returns {Promise<ItunesTrackHit | null>}
 */
export async function lookupItunesTrack(artist, title) {
  const cacheKey = `track::${artist}::${title}`.toLowerCase()
  if (LOOKUP_CACHE.has(cacheKey)) return LOOKUP_CACHE.get(cacheKey) ?? null

  const term = [artist, title].filter(Boolean).join(' ').trim()
  if (!term) return null

  /** @type {ItunesTrackHit | null} */
  let found = null
  const url = `https://itunes.apple.com/search?${new URLSearchParams({
    term,
    entity: 'song',
    limit: '8',
    country: 'US',
  })}`

  try {
    const res = await fetchWithRetry(url, {
      timeoutMs: LOOKUP_TIMEOUT_MS,
      retries: 1,
    })
    if (!res.ok) return null
    const data = await res.json()
    const results =
      /** @type {{ artistName?: string, trackName?: string, collectionName?: string, artworkUrl100?: string, releaseDate?: string, trackTimeMillis?: number }[]} */ (
        data.results || []
      )
    const match = pickBestItunesMatch(results, artist, title)
    if (match?.trackName) {
      found = {
        title: match.trackName.trim(),
        artist: match.artistName?.trim() || artist,
        album: match.collectionName?.trim() || '',
        artUrl: match.artworkUrl100
          ? match.artworkUrl100.replace(/100x100bb\.(jpg|png)/i, '600x600bb.$1')
          : null,
        releaseYear: match.releaseDate
          ? Number(String(match.releaseDate).slice(0, 4)) || null
          : null,
        trackTimeMillis: match.trackTimeMillis ?? null,
      }
    }
  } catch {
    /* network */
  }

  LOOKUP_CACHE.set(cacheKey, found)
  return found
}

/**
 * @param {{ artistName?: string, trackName?: string, collectionName?: string, artworkUrl100?: string, releaseDate?: string, trackTimeMillis?: number }[]} results
 * @param {string} artist
 * @param {string} title
 */
function pickBestItunesMatch(results, artist, title) {
  if (!results.length) return null
  const titleNorm = norm(title)
  const artistTokens = tokenizeArtists(artist)

  let best = null
  let bestScore = -1
  for (const r of results) {
    if (!r.trackName) continue
    let score = 0
    const rTitle = norm(r.trackName)
    const rArtist = norm(r.artistName || '')

    if (rTitle === titleNorm) score += 40
    else if (rTitle.includes(titleNorm) || titleNorm.includes(rTitle)) score += 25
    else if (titleNorm && rTitle.split(/\s+/).some((w) => titleNorm.includes(w) && w.length > 3))
      score += 10

    for (const tok of artistTokens) {
      if (rArtist.includes(tok)) score += 15
    }

    if (r.collectionName && r.collectionName !== 'Unknown album') score += 5
    if (r.artworkUrl100) score += 3

    if (score > bestScore) {
      bestScore = score
      best = r
    }
  }

  return bestScore >= 20 ? best : results[0]
}

/** @param {string} s */
function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} artist */
function tokenizeArtists(artist) {
  return String(artist ?? '')
    .split(/\s*(?:&|,|;| feat\.? | ft\.? | x )\s*/i)
    .map((a) => norm(a))
    .filter((a) => a.length > 1)
}

/** @param {import('./types.js').Track} track */
export function trackNeedsExternalMetadata(track) {
  const albumMissing = !track.album || track.album === '未知专辑'
  const titleRaw = track.title || ''
  const titleNeedsCleanup = /\([^)]*(official|video|audio|lyric)/i.test(titleRaw)
  return albumMissing || titleNeedsCleanup
}

/**
 * Enrich newly imported tracks via iTunes (album, canonical title, art URL seed).
 * @param {string[]} trackIds
 * @returns {Promise<number>} updated count
 */
export async function enrichImportedTracksFromItunes(trackIds) {
  if (!trackIds.length) return 0
  const rows = await db.tracks.bulkGet(trackIds)
  let updated = 0

  for (const track of rows) {
    if (!track || !trackNeedsExternalMetadata(track)) continue
    const hit = await lookupItunesTrack(track.artist, track.title)
    if (!hit?.album && !hit?.title) continue

    /** @type {Partial<import('./types.js').Track>} */
    const patch = {}
    if (hit.title && hit.title !== track.title) patch.title = hit.title
    if (hit.album && hit.album !== track.album) {
      patch.album = hit.album
      patch.albumKey = slugKey(`${track.artist}::${hit.album}`)
    }
    if (hit.trackTimeMillis && !track.duration) {
      patch.duration = hit.trackTimeMillis / 1000
    }

    if (!Object.keys(patch).length && !hit.artUrl) continue

    if (Object.keys(patch).length) {
      patch.words = trackWords({ ...track, ...patch })
      await db.tracks.update(track.id, patch)
    }

    if (hit.artUrl) {
      await upsertAlbumArt({
        albumKey: patch.albumKey || track.albumKey,
        artist: track.artist,
        album: patch.album || track.album,
        artRemoteUrl: hit.artUrl,
      })
    }

    updated += 1
    await new Promise((r) => setTimeout(r, 150))
  }

  return updated
}
