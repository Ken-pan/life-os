import {
  db,
  hydrateTrack,
  getRecentTracks,
  getRecentlyAdded,
  getTopArtists,
  getTracksByArtist,
  getPlaylistTracks,
  getPlaylists,
} from './db.js'
import {
  entityKey,
  getEntityLaunchScores,
  getEntityPlaybackStats,
  getTimeContextBucket,
  scoreNextPlay,
} from './musicInteractions.js'
import { getCurrentTrack } from './player.svelte.js'
import {
  getSpeedDialSlots,
  getHiddenDownweights,
  getBoardExcludedKeys,
  persistAutoSpeedDialSlot,
} from './speedDialStore.js'

/** @typedef {'tile' | 'surprise'} SpeedDialVariant */

/** @typedef {'track' | 'artist' | 'album' | 'playlist' | 'collection' | 'surprise'} SpeedDialEntityType */

/**
 * @typedef {object} SpeedDialCell
 * @property {string} id
 * @property {SpeedDialVariant} variant
 * @property {SpeedDialEntityType} entityType
 * @property {string} entityId
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [reason]
 * @property {boolean} [pinned]
 * @property {string[]} coverSeeds
 * @property {(string | undefined)[]} coverUrls
 * @property {import('./types.js').Track[]} tracks
 */

/**
 * @typedef {object} SpeedDialPage
 * @property {string} id
 * @property {string} label
 * @property {SpeedDialCell[]} cells
 */

const MAX_AUTO_REPLACEMENTS = 2
const MIN_AUTO_SCORE = 0.2
const BOARD_SIZE = 8
const EXPLORE_SLOT = 7
const SESSION_WINDOW_MS = 3 * 3_600_000

/** @typedef {{ trackIds: Set<string>, artistKeys: Set<string>, albumKeys: Set<string> }} SessionContext */

/** @param {string | undefined} reason */
export function speedDialReasonKey(reason) {
  switch (reason) {
    case 'pinned':
      return 'home.speedDialReasonPinned'
    case 'frequent_launch':
      return 'home.speedDialReasonFrequent'
    case 'recent_return':
      return 'home.speedDialReasonRecent'
    case 'recently_added':
      return 'home.speedDialReasonImport'
    case 'time_context':
      return 'home.speedDialReasonTime'
    case 'explore':
      return 'home.speedDialReasonExplore'
    default:
      return ''
  }
}

/** @returns {SpeedDialCell} */
function surpriseCell() {
  return {
    id: 'surprise',
    variant: 'surprise',
    entityType: 'surprise',
    entityId: 'surprise_me',
    title: 'Surprise Me',
    subtitle: '',
    coverSeeds: [],
    coverUrls: [],
    tracks: [],
  }
}

/**
 * @param {SpeedDialEntityType} entityType
 * @param {string} entityId
 * @param {Partial<SpeedDialCell>} data
 */
function makeCell(entityType, entityId, data) {
  return /** @type {SpeedDialCell} */ ({
    id: entityKey(entityType, entityId),
    variant: 'tile',
    entityType,
    entityId,
    coverSeeds: [],
    coverUrls: [],
    tracks: [],
    ...data,
  })
}

/** @param {import('./types.js').Track} track @param {string} [reason] @param {boolean} [pinned] */
function cellFromTrack(track, reason, pinned = false) {
  return makeCell('track', track.id, {
    title: track.title,
    subtitle: track.artist,
    reason,
    pinned,
    coverSeeds: [track.id],
    coverUrls: [track.artUrl],
    tracks: [track],
  })
}

/**
 * @param {{ artist: string, artistKey: string }} artist
 * @param {import('./types.js').Track[]} tracks
 * @param {string} [reason]
 * @param {boolean} [pinned]
 */
function cellFromArtist(artist, tracks, reason, pinned = false) {
  const slice = tracks.slice(0, 3)
  return makeCell('artist', artist.artistKey, {
    title: artist.artist,
    subtitle: `${tracks.length} 首`,
    reason,
    pinned,
    coverSeeds: slice.map((t) => t.id),
    coverUrls: slice.map((t) => t.artUrl),
    tracks,
  })
}

/**
 * @param {{ album: string, albumKey: string, artist: string, artUrl?: string }} album
 * @param {import('./types.js').Track[]} tracks
 * @param {string} [reason]
 */
function cellFromAlbum(album, tracks, reason) {
  return makeCell('album', album.albumKey, {
    title: album.album,
    subtitle: album.artist,
    reason,
    coverSeeds: [tracks[0]?.id || album.albumKey],
    coverUrls: [album.artUrl || tracks[0]?.artUrl],
    tracks,
  })
}

/**
 * @param {{ id: string, name: string }} playlist
 * @param {import('./types.js').Track[]} tracks
 * @param {string} [reason]
 */
function cellFromPlaylist(playlist, tracks, reason) {
  const slice = tracks.slice(0, 3)
  return makeCell('playlist', playlist.id, {
    title: playlist.name,
    subtitle: `${tracks.length} 首`,
    reason,
    coverSeeds: slice.map((t) => t.id),
    coverUrls: slice.map((t) => t.artUrl),
    tracks,
  })
}

/** @param {import('./speedDialStore.js').SpeedDialSlot} slot */
async function resolveSlot(slot) {
  switch (slot.entityType) {
    case 'track': {
      const track = hydrateTrack(await db.tracks.get(slot.entityId))
      if (!track) return null
      return cellFromTrack(track, slot.reason, slot.pinned)
    }
    case 'artist': {
      const tracks = await getTracksByArtist(slot.entityId)
      if (!tracks.length) return null
      return cellFromArtist(
        { artist: tracks[0].artist, artistKey: slot.entityId },
        tracks,
        slot.reason,
        slot.pinned,
      )
    }
    case 'album': {
      const tracks = await db.tracks
        .where('albumKey')
        .equals(slot.entityId)
        .toArray()
      if (!tracks.length) return null
      const hydrated = tracks.map(hydrateTrack)
      return cellFromAlbum(
        {
          album: hydrated[0].album,
          albumKey: slot.entityId,
          artist: hydrated[0].artist,
          artUrl: hydrated[0].artUrl,
        },
        hydrated,
        slot.reason,
      )
    }
    case 'playlist': {
      const playlist = await db.playlists.get(slot.entityId)
      const tracks = await getPlaylistTracks(slot.entityId)
      if (!playlist || !tracks.length) return null
      return cellFromPlaylist(playlist, tracks, slot.reason)
    }
    default:
      return null
  }
}

/** @param {string} key @param {Map<string, import('./musicInteractions.js').EntityPlaybackStats>} stats */
function reasonForStats(key, stats) {
  const s = stats.get(key)
  if (!s) return 'frequent_launch'
  if (s.timeMatches >= 2 && s.timeMatches >= s.activeLaunches * 0.4)
    return 'time_context'
  if (s.activeLaunches >= 2) return 'frequent_launch'
  return 'recent_return'
}

/** @returns {Promise<SessionContext>} */
async function getSessionContext() {
  const since = Date.now() - SESSION_WINDOW_MS
  const rows = await db.interactions.where('createdAt').above(since).toArray()
  /** @type {SessionContext} */
  const ctx = {
    trackIds: new Set(),
    artistKeys: new Set(),
    albumKeys: new Set(),
  }

  for (const row of rows) {
    if (row.action !== 'play' && row.action !== 'open') continue
    if (row.entityType === 'track') ctx.trackIds.add(row.entityId)
    else if (row.entityType === 'artist') ctx.artistKeys.add(row.entityId)
    else if (row.entityType === 'album') ctx.albumKeys.add(row.entityId)
  }

  const current = getCurrentTrack()
  if (current) {
    ctx.trackIds.add(current.id)
    if (current.artistKey) ctx.artistKeys.add(current.artistKey)
    if (current.albumKey) ctx.albumKeys.add(current.albumKey)
  }

  return ctx
}

/** @param {SpeedDialCell} cell */
function cellArtistKey(cell) {
  if (cell.entityType === 'artist') return cell.entityId
  return cell.tracks[0]?.artistKey ?? null
}

/** @param {SpeedDialCell} cell */
function cellAlbumKey(cell) {
  if (cell.entityType === 'album') return cell.entityId
  return cell.tracks[0]?.albumKey ?? null
}

/** @param {SpeedDialCell} cell */
function cellCoverKey(cell) {
  if (!cell || cell.variant === 'surprise') return null
  if (cell.entityType === 'album') return `album:${cell.entityId}`
  const track = cell.tracks[0]
  if (track?.albumKey) return `album:${track.albumKey}`
  if (cell.coverSeeds[0]) return `seed:${cell.coverSeeds[0]}`
  return `cell:${cell.id}`
}

/** @param {(SpeedDialCell | null)[]} board */
function collectBoardKeys(board) {
  /** @type {Set<string>} */
  const artists = new Set()
  /** @type {Set<string>} */
  const albums = new Set()
  /** @type {Set<string>} */
  const covers = new Set()
  for (const cell of board) {
    if (!cell || cell.variant === 'surprise') continue
    const artist = cellArtistKey(cell)
    const album = cellAlbumKey(cell)
    const cover = cellCoverKey(cell)
    if (artist) artists.add(artist)
    if (album) albums.add(album)
    if (cover) covers.add(cover)
  }
  return { artists, albums, covers }
}

/**
 * @param {SpeedDialCell} cell
 * @param {Set<string>} artists
 * @param {Set<string>} albums
 * @param {Set<string>} covers
 */
function violatesDiversity(cell, artists, albums, covers) {
  const artist = cellArtistKey(cell)
  const album = cellAlbumKey(cell)
  const cover = cellCoverKey(cell)
  if (artist && artists.has(artist)) return true
  if (album && albums.has(album)) return true
  if (cover && covers.has(cover)) return true
  return false
}

/**
 * @param {{ score: number, cell: SpeedDialCell, reason: string }[]} candidates
 * @param {Set<string>} used
 * @param {(SpeedDialCell | null)[]} board
 * @param {{ explore?: boolean }} [opts]
 */
function pickNextCandidate(candidates, used, board, opts = {}) {
  const { artists, albums, covers } = collectBoardKeys(board)
  const pool = candidates.filter((c) => !used.has(c.cell.id))
  if (!pool.length) return null

  if (opts.explore) {
    const mid = pool.filter((c) => c.score >= 0.28 && c.score <= 0.72)
    const explorePool = mid.length
      ? mid
      : pool.slice(0, Math.min(8, pool.length))
    const shuffled = [...explorePool].sort(() => Math.random() - 0.5)
    for (const candidate of shuffled) {
      if (!violatesDiversity(candidate.cell, artists, albums, covers)) {
        return { ...candidate, reason: 'explore' }
      }
    }
  }

  for (const candidate of pool) {
    if (!violatesDiversity(candidate.cell, artists, albums, covers))
      return candidate
  }

  return pool[0]
}

/**
 * Swap non-pinned duplicate artists/albums on the board when a diverse alternative exists.
 * @param {(SpeedDialCell | null)[]} board
 * @param {{ score: number, cell: SpeedDialCell, reason: string }[]} candidates
 * @param {Set<string>} used
 */
function rebalanceBoardDiversity(board, candidates, used) {
  for (let i = 0; i < BOARD_SIZE; i++) {
    const cell = board[i]
    if (!cell || cell.pinned) continue

    const { artists, albums, covers } = collectBoardKeys(board)
    const artist = cellArtistKey(cell)
    const album = cellAlbumKey(cell)
    const cover = cellCoverKey(cell)

    let dupArtist = false
    let dupAlbum = false
    let dupCover = false
    if (artist) {
      for (let j = 0; j < BOARD_SIZE; j++) {
        if (j === i || !board[j]) continue
        if (cellArtistKey(board[j]) === artist) dupArtist = true
      }
    }
    if (album) {
      for (let j = 0; j < BOARD_SIZE; j++) {
        if (j === i || !board[j]) continue
        if (cellAlbumKey(board[j]) === album) dupAlbum = true
      }
    }
    if (cover) {
      for (let j = 0; j < BOARD_SIZE; j++) {
        if (j === i || !board[j]) continue
        if (cellCoverKey(board[j]) === cover) dupCover = true
      }
    }
    if (!dupArtist && !dupAlbum && !dupCover) continue

    const altBoard = board.map((c, idx) => (idx === i ? null : c))
    const alt = pickNextCandidate(candidates, used, altBoard)
    if (!alt || alt.cell.id === cell.id) continue

    used.delete(cell.id)
    used.add(alt.cell.id)
    board[i] = { ...alt.cell, reason: alt.reason }
  }
}

/**
 * @param {SpeedDialCell} cell
 * @param {SessionContext} session
 */
function sessionBoost(cell, session) {
  let boost = 0
  if (cell.entityType === 'track' && session.trackIds.has(cell.entityId))
    boost += 0.38
  if (cell.entityType === 'artist' && session.artistKeys.has(cell.entityId))
    boost += 0.32
  if (cell.entityType === 'album' && session.albumKeys.has(cell.entityId))
    boost += 0.3
  const artist = cellArtistKey(cell)
  if (artist && session.artistKeys.has(artist)) boost += 0.18
  return boost
}

/** @param {Map<string, number>} hiddenWeights @param {Set<string>} used @param {string | null} [fatigueTrackId] @param {SessionContext} session */
async function buildAutoCandidates(
  hiddenWeights,
  used,
  fatigueTrackId = null,
  session,
) {
  /** @type {{ score: number, cell: SpeedDialCell, reason: string }[]} */
  const candidates = []
  const [launchScores, playbackStats] = await Promise.all([
    getEntityLaunchScores(14),
    getEntityPlaybackStats(14),
  ])
  const timeBucket = getTimeContextBucket()

  for (const [key, score] of [...launchScores.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    if (used.has(key)) continue
    const downweight = hiddenWeights.get(key) ?? 1
    if (downweight < 0.05) continue
    const [entityType, ...rest] = key.split(':')
    const entityId = rest.join(':')
    const cell = await resolveSlot({
      id: key,
      entityType,
      entityId,
      source: 'auto',
      position: -1,
      pinned: false,
      hidden: false,
      reason: reasonForStats(key, playbackStats),
      updatedAt: Date.now(),
    })
    if (!cell) continue
    let adjusted = scoreNextPlay(key, playbackStats, launchScores) || score
    adjusted += sessionBoost(cell, session)
    adjusted *= downweight
    if (
      fatigueTrackId &&
      cell.entityType === 'track' &&
      cell.entityId === fatigueTrackId
    ) {
      adjusted *= 0.55
    }
    if (
      reasonForStats(key, playbackStats) === 'time_context' &&
      timeBucket === 'late_night'
    ) {
      adjusted += 0.2
    } else if (reasonForStats(key, playbackStats) === 'time_context') {
      adjusted += 0.08
    }
    candidates.push({
      score: adjusted,
      cell,
      reason: reasonForStats(key, playbackStats),
    })
  }

  const recent = await getRecentTracks(12)
  for (const track of recent) {
    const key = entityKey('track', track.id)
    if (used.has(key)) continue
    const downweight = hiddenWeights.get(key) ?? 1
    if (downweight < 0.05) continue
    const cell = cellFromTrack(track, 'recent_return')
    let adjusted =
      Math.max(0.75, scoreNextPlay(key, playbackStats, launchScores)) +
      (launchScores.get(key) || 0) * 0.2 +
      sessionBoost(cell, session)
    adjusted *= downweight
    candidates.push({
      score: adjusted,
      cell,
      reason: 'recent_return',
    })
  }

  const artists = await getTopArtists(6)
  for (const artist of artists) {
    const key = entityKey('artist', artist.artistKey)
    if (used.has(key)) continue
    const downweight = hiddenWeights.get(key) ?? 1
    if (downweight < 0.05) continue
    const tracks = await getTracksByArtist(artist.artistKey)
    if (!tracks.length) continue
    const cell = cellFromArtist(artist, tracks, 'frequent_launch')
    let adjusted =
      (0.55 + (launchScores.get(key) || 0) + sessionBoost(cell, session)) *
      downweight
    candidates.push({
      score: adjusted,
      cell,
      reason: 'frequent_launch',
    })
  }

  const playlists = (await getPlaylists())
    .filter((p) => p.kind === 'user')
    .slice(0, 4)
  for (const playlist of playlists) {
    const key = entityKey('playlist', playlist.id)
    if (used.has(key)) continue
    const downweight = hiddenWeights.get(key) ?? 1
    if (downweight < 0.05) continue
    const tracks = await getPlaylistTracks(playlist.id)
    if (!tracks.length) continue
    candidates.push({
      score: (0.45 + (launchScores.get(key) || 0)) * downweight,
      cell: cellFromPlaylist(playlist, tracks, 'frequent_launch'),
      reason: 'frequent_launch',
    })
  }

  const recentAdded = await getRecentlyAdded(4)
  for (const track of recentAdded) {
    const key = entityKey('track', track.id)
    if (used.has(key)) continue
    const downweight = hiddenWeights.get(key) ?? 1
    if (downweight < 0.05) continue
    candidates.push({
      score: 0.3 * downweight,
      cell: cellFromTrack(track, 'recently_added'),
      reason: 'recently_added',
    })
  }

  const seen = new Set()
  return candidates
    .filter((item) => {
      if (seen.has(item.cell.id)) return false
      seen.add(item.cell.id)
      return item.score >= MIN_AUTO_SCORE || item.reason === 'recently_added'
    })
    .sort((a, b) => b.score - a.score)
}

/** @param {(SpeedDialCell | null)[]} board @param {SpeedDialCell[]} overflow */
function pagesFromBoard(board, overflow = []) {
  const primary = [
    ...board.filter(Boolean).slice(0, BOARD_SIZE),
    surpriseCell(),
  ]
  /** @type {SpeedDialPage[]} */
  const pages = [{ id: 'personal', label: '个人', cells: primary }]

  if (overflow.length) {
    for (let i = 0; i < overflow.length; i += BOARD_SIZE) {
      pages.push({
        id: `more-${i / BOARD_SIZE + 1}`,
        label: '更多',
        cells: [...overflow.slice(i, i + BOARD_SIZE), surpriseCell()],
      })
    }
  }

  return pages
}

/** @returns {Promise<SpeedDialPage[]>} */
export async function getSpeedDialPages(fatigueTrackId = null) {
  const trackCount = await db.tracks.count()
  if (!trackCount) return []

  const [slots, boardExcluded, hiddenWeights, session] = await Promise.all([
    getSpeedDialSlots(),
    getBoardExcludedKeys(),
    getHiddenDownweights(),
    getSessionContext(),
  ])
  /** @type {(SpeedDialCell | null)[]} */
  const board = Array(BOARD_SIZE).fill(null)
  const used = new Set()
  /** @type {SpeedDialCell[]} */
  const overflow = []
  let replacements = 0

  for (const slot of slots.filter(
    (s) => s.pinned && s.position >= 0 && s.position < BOARD_SIZE,
  )) {
    const cell = await resolveSlot(slot)
    if (!cell) continue
    board[slot.position] = cell
    used.add(cell.id)
  }

  for (const slot of slots.filter(
    (s) => !s.pinned && !s.hidden && s.position >= 0 && s.position < BOARD_SIZE,
  )) {
    if (board[slot.position]) continue
    const cell = await resolveSlot(slot)
    if (!cell || boardExcluded.has(cell.id) || used.has(cell.id)) continue
    board[slot.position] = cell
    used.add(cell.id)
  }

  const candidates = await buildAutoCandidates(
    hiddenWeights,
    used,
    fatigueTrackId,
    session,
  )
  const candidateById = new Map(candidates.map((c) => [c.cell.id, c]))

  for (let i = 0; i < BOARD_SIZE; i++) {
    const existing = board[i]
    if (!existing || existing.pinned) continue
    const ranked = candidateById.get(existing.id)
    const stale = !ranked || ranked.score < MIN_AUTO_SCORE
    if (!stale) continue
    if (replacements >= MAX_AUTO_REPLACEMENTS) continue
    const next = pickNextCandidate(candidates, used, board)
    if (!next) continue
    board[i] = { ...next.cell, reason: next.reason }
    used.delete(existing.id)
    used.add(next.cell.id)
    replacements += 1
    await persistAutoSpeedDialSlot(
      i,
      next.cell.entityType,
      next.cell.entityId,
      next.reason,
    )
  }

  for (let i = 0; i < BOARD_SIZE; i++) {
    if (board[i]) continue
    const next = pickNextCandidate(candidates, used, board, {
      explore: i === EXPLORE_SLOT,
    })
    if (!next) break
    board[i] = { ...next.cell, reason: next.reason }
    used.add(next.cell.id)
    await persistAutoSpeedDialSlot(
      i,
      next.cell.entityType,
      next.cell.entityId,
      next.reason,
    )
  }

  rebalanceBoardDiversity(board, candidates, used)

  for (const candidate of candidates) {
    if (used.has(candidate.cell.id)) continue
    overflow.push({ ...candidate.cell, reason: candidate.reason })
    used.add(candidate.cell.id)
    if (overflow.length >= 16) break
  }

  return pagesFromBoard(board, overflow)
}

/** @returns {Promise<SpeedDialCell[]>} */
export async function getSpeedDialEditCells() {
  const pages = await getSpeedDialPages()
  return pages[0]?.cells.filter((cell) => cell.variant !== 'surprise') ?? []
}

/** @param {SpeedDialPage[]} pages */
export function speedDialAllTracks(pages) {
  const seen = new Set()
  /** @type {import('./types.js').Track[]} */
  const tracks = []
  for (const page of pages) {
    for (const cell of page.cells) {
      if (cell.variant === 'surprise') continue
      for (const track of cell.tracks) {
        if (seen.has(track.id)) continue
        seen.add(track.id)
        tracks.push(track)
      }
    }
  }
  return tracks
}

/** @param {SpeedDialPage[]} pages */
export function speedDialTrackIds(pages) {
  const ids = new Set()
  for (const page of pages) {
    for (const cell of page.cells) {
      if (cell.variant === 'surprise') continue
      for (const track of cell.tracks) ids.add(track.id)
    }
  }
  return [...ids]
}
