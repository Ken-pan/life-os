import {
  db,
  slugKey,
  trackWords,
  ensureBuiltinPlaylists,
  getAllTracks,
  hydrateTrack,
  trackNeedsLyrics,
} from './db.js'
import { upsertAlbumArt, albumHasArt } from './albumArtStore.js'
import { parseId3, parseFilename, isValidMeta } from './id3.js'
import { lyricsMatchKey } from './lyrics.js'
import { lookupRemoteAlbumName } from './albumArt.js'
import { repairMissingArtModern } from './artResolver.js'
import { getSignedAudioUrl } from './cloudAudio.js'
import { fetchLyricsForTrack } from './lyricsFetch.js'
import { scheduleAutoCloudPush } from './sync.js'

const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i
const LRC_EXT = /\.lrc$/i
const CLOUD_SNIFF_BYTES = 512 * 1024
const AUTO_LYRICS_BATCH_LIMIT = 24
const AUTO_LYRICS_DELAY_MS = 350
const METADATA_REPAIR_MIN_GAP_MS = 10 * 60 * 1000

/** @param {FileList | File[]} files @param {(done: number, total: number) => void} [onProgress] @param {{ autoMaintain?: boolean }} [opts] */
export async function importMediaFiles(files, onProgress, opts = {}) {
  const list = [...files]
  const audio = list.filter((f) => AUDIO_EXT.test(f.name))
  const lrcs = list.filter((f) => LRC_EXT.test(f.name))
  const total = audio.length + lrcs.length
  let done = 0

  const { count: audioCount, trackIds } = await importAudioFiles(audio, (d) => {
    done = d
    onProgress?.(done, total || 1)
  })

  const lrcCount = await importLrcFiles(lrcs, (d) => {
    done = audio.length + d
    onProgress?.(done, total || 1)
  })

  if (audioCount > 0 && opts.autoMaintain !== false) {
    scheduleAutoCloudPush()
    scheduleLibraryMaintenance({ trackIds, delayMs: 1800 })
  }

  return { audioCount, lrcCount, total: audioCount + lrcCount, trackIds }
}

/** @param {FileList | File[]} files @param {(done: number, total: number) => void} [onProgress] */
export async function importAudioFiles(files, onProgress) {
  await ensureBuiltinPlaylists()
  const list = [...files].filter((f) => AUDIO_EXT.test(f.name))
  let done = 0
  /** @type {string[]} */
  const trackIds = []

  for (const file of list) {
    const buffer = await file.arrayBuffer()
    const tags = parseId3(buffer) || {}
    const fromName = parseFilename(file.name)
    const title = tags.title || fromName.title
    const artist = tags.artist || fromName.artist
    const album = isValidMeta(tags.album)
      ? String(tags.album).trim()
      : '未知专辑'
    const duration = await readDuration(file)

    /** @type {Blob | undefined} */
    let artBlob
    if (tags.picture) {
      artBlob = new Blob([tags.picture.data], { type: tags.picture.mime })
    }

    const albumKey = slugKey(`${artist}::${album}`)

    const fileBuf = await file.arrayBuffer()
    const id = await hashBuffer(fileBuf)
    const existing = await db.tracks.get(id)
    if (existing?.objectUrl) URL.revokeObjectURL(existing.objectUrl)

    /** @type {import('./types.js').Track & { audioBlob: Blob }} */
    const track = {
      id,
      title,
      artist,
      album,
      albumKey,
      artistKey: slugKey(artist),
      duration,
      mime: file.type || 'audio/mpeg',
      size: file.size,
      addedAt: existing?.addedAt || Date.now(),
      playCount: existing?.playCount || 0,
      liked: existing?.liked || 0,
      lyrics: tags.lyrics || existing?.lyrics,
      fileName: file.name,
      words: [],
      // 物化为按值存储的 Blob：iOS 上直接存 File 会以底层临时文件引用入库，
      // 选择器的临时拷贝被系统回收后 IndexedDB 读回的就是空 blob
      audioBlob: new Blob([fileBuf], { type: file.type || 'audio/mpeg' }),
    }
    track.words = trackWords(track)
    await db.tracks.put(track)
    trackIds.push(id)
    if (artBlob) {
      await upsertAlbumArt({ albumKey, artist, album, artBlob })
    }
    hydrateTrack(track)
    done += 1
    onProgress?.(done, list.length)
  }

  return { count: done, trackIds }
}

/**
 * Attach standalone .lrc files to matching library tracks (by title / artist - title / fileName).
 * @param {FileList | File[]} files @param {(done: number, total: number) => void} [onProgress]
 */
export async function importLrcFiles(files, onProgress) {
  const list = [...files].filter((f) => LRC_EXT.test(f.name))
  if (!list.length) return 0

  const tracks = await getAllTracks()
  let matched = 0
  let done = 0

  for (const file of list) {
    const text = await file.text()
    if (!text.trim()) {
      done += 1
      onProgress?.(done, list.length)
      continue
    }

    const key = lyricsMatchKey(file.name)
    const track = tracks.find((tr) => {
      const candidates = [
        lyricsMatchKey(tr.title),
        lyricsMatchKey(`${tr.artist} - ${tr.title}`),
        lyricsMatchKey(`${tr.artist}-${tr.title}`),
        lyricsMatchKey(tr.fileName || ''),
      ]
      return candidates.includes(key)
    })

    if (track) {
      await db.tracks.update(track.id, { lyrics: text })
      track.lyrics = text
      matched += 1
    }

    done += 1
    onProgress?.(done, list.length)
  }

  if (matched) scheduleAutoCloudPush()
  return matched
}

/**
 * Re-parse ID3 tags for local blobs and cloud-backed tracks.
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function rescanTrackMetadata(onProgress) {
  const tracks = await getAllTracks()
  const scannable = tracks.filter((t) => t.audioBlob || t.storagePath)
  let updated = 0
  let done = 0

  for (const track of scannable) {
    try {
      const tags = await id3FromTrack(track)
      /** @type {Partial<import('./types.js').Track>} */
      const patch = metaPatchFromTags(track, tags)

      if (Object.keys(patch).length) {
        await db.tracks.update(track.id, patch)
        updated += 1
      }
    } catch {
      /* skip corrupt / unreachable files */
    }

    done += 1
    onProgress?.(done, scannable.length)
  }

  if (updated) scheduleAutoCloudPush()
  return { scanned: scannable.length, updated }
}

/**
 * Re-parse filenames with updated heuristics (Title-Artist vs Artist-Title).
 * @param {string[]} [trackIds] optional scope — only these tracks
 * @returns {Promise<number>}
 */
export async function repairFilenameMetadata(trackIds) {
  const scope = trackIds?.length ? new Set(trackIds) : null
  const tracks = scope
    ? (await db.tracks.bulkGet(trackIds)).filter(Boolean)
    : await getAllTracks()
  let repaired = 0

  for (const track of tracks) {
    if (scope && !scope.has(track.id)) continue
    if (!track.fileName) continue
    const parsed = parseFilename(track.fileName)
    if (!isValidMeta(parsed.title) || !isValidMeta(parsed.artist)) continue

    const symmetricSwap =
      track.title === parsed.artist &&
      track.artist === parsed.title &&
      parsed.title !== parsed.artist
    const needsFix =
      symmetricSwap ||
      ((!isValidMeta(track.title) || track.title === '未命名') &&
        parsed.title !== track.title) ||
      ((!isValidMeta(track.artist) || track.artist === '未知艺术家') &&
        parsed.artist !== track.artist)

    if (!needsFix) continue

    /** @type {Partial<import('./types.js').Track>} */
    const patch = {
      title: parsed.title,
      artist: parsed.artist,
      artistKey: slugKey(parsed.artist),
      words: trackWords({
        ...track,
        title: parsed.title,
        artist: parsed.artist,
      }),
    }
    if (track.album && track.album !== '未知专辑') {
      patch.albumKey = slugKey(`${parsed.artist}::${track.album}`)
    }
    await db.tracks.update(track.id, patch)
    repaired += 1
  }

  if (repaired) scheduleAutoCloudPush()
  return repaired
}

/** @param {import('./types.js').Track} track */
function isGarbledAlbum(album) {
  return Boolean(album && album !== '未知专辑' && !isValidMeta(album))
}

/**
 * Fix garbled album names from ID3 or iTunes lookup (local + cloud-only tracks).
 * @returns {Promise<number>} count of tracks repaired
 */
export async function repairGarbledMetadata() {
  const tracks = await getAllTracks()
  const targets = tracks.filter((t) => isGarbledAlbum(t.album))
  let repaired = 0

  for (const track of targets) {
    try {
      const tags = await id3FromTrack(track)
      let album = isValidMeta(tags.album) ? String(tags.album).trim() : ''
      if (!album) {
        album =
          (await lookupRemoteAlbumName(track.artist, track.title)) || '未知专辑'
      }
      if (!isValidMeta(album) || album === track.album) continue

      const artist = isValidMeta(tags.artist)
        ? String(tags.artist).trim()
        : track.artist
      /** @type {Partial<import('./types.js').Track>} */
      const patch = {
        album,
        albumKey: slugKey(`${artist}::${album}`),
        words: trackWords({ ...track, album, artist }),
      }
      if (isValidMeta(tags.artist) && tags.artist !== track.artist) {
        patch.artist = artist
        patch.artistKey = slugKey(artist)
      }
      await db.tracks.update(track.id, patch)
      repaired += 1
    } catch {
      /* skip */
    }
  }

  if (repaired) scheduleAutoCloudPush()
  return repaired
}

/** @type {Promise<number> | null} */
let metaRepairPromise = null
let lastMetadataRepairAt = 0

/** Idempotent; repairs garbled album names after sync / on library load. */
export function ensureMetadataRepaired(opts = {}) {
  if (!opts.force && Date.now() - lastMetadataRepairAt < METADATA_REPAIR_MIN_GAP_MS)
    return Promise.resolve(0)
  if (!metaRepairPromise) {
    metaRepairPromise = (async () => {
      const state = await import('./state.svelte.js')
      state.maintBegin('metadata')
      try {
        await repairFilenameMetadata()
        const repaired = await repairGarbledMetadata()
        lastMetadataRepairAt = Date.now()
        if (repaired > 0) state.bumpLibraryEpoch()
        return repaired
      } finally {
        state.maintEnd('metadata')
        metaRepairPromise = null
      }
    })()
  }
  return metaRepairPromise
}

/** @param {import('./types.js').Track} track */
async function id3FromTrack(track) {
  if (track.audioBlob instanceof Blob) {
    return parseId3(await track.audioBlob.arrayBuffer()) || {}
  }
  if (track.storagePath) {
    const url = await getSignedAudioUrl(track.storagePath)
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${CLOUD_SNIFF_BYTES - 1}` },
    })
    if (res.ok || res.status === 206) {
      return parseId3(await res.arrayBuffer()) || {}
    }
  }
  return {}
}

/**
 * @param {import('./types.js').Track} track
 * @param {{ title?: string, artist?: string, album?: string, lyrics?: string, lyricsSynced?: boolean, picture?: { mime: string, data: Uint8Array } }} tags
 */
function metaPatchFromTags(track, tags) {
  /** @type {Partial<import('./types.js').Track>} */
  const patch = {}

  if (tags.lyrics && tags.lyrics !== track.lyrics) patch.lyrics = tags.lyrics
  if (tags.title && isValidMeta(tags.title) && tags.title !== track.title)
    patch.title = tags.title
  if (tags.artist && isValidMeta(tags.artist) && tags.artist !== track.artist) {
    patch.artist = tags.artist
    patch.artistKey = slugKey(tags.artist)
  }
  if (tags.album && isValidMeta(tags.album) && tags.album !== track.album) {
    patch.album = tags.album
    patch.albumKey = slugKey(`${patch.artist || track.artist}::${tags.album}`)
  }
  if (tags.picture && !albumHasArt(track.albumKey)) {
    void upsertAlbumArt({
      albumKey: track.albumKey,
      artist: track.artist,
      album: track.album,
      artBlob: new Blob([tags.picture.data], { type: tags.picture.mime }),
    })
  }

  if (patch.title || patch.artist || patch.album) {
    patch.words = trackWords({ ...track, ...patch })
  }
  return patch
}

/**
 * Backfill missing covers: local ID3 → cloud sniff → iTunes lookup (concurrent, blob materialized).
 * @returns {Promise<number>} count of tracks repaired
 */
export async function repairMissingArt() {
  const tracks = await db.tracks.toArray()
  const repaired = await repairMissingArtModern(tracks)
  if (repaired) scheduleAutoCloudPush()
  return repaired
}

/**
 * Backfill missing lyrics via remote APIs (lrclib / QQ / NetEase / lyrics.ovh).
 * @param {(done: number, total: number) => void} [onProgress]
 * @param {string[]} [trackIds] optional scope
 * @param {{ force?: boolean, limit?: number, delayMs?: number }} [opts]
 * @returns {Promise<{ total: number, repaired: number }>}
 */
export async function repairMissingLyrics(onProgress, trackIds, opts = {}) {
  const all = await db.tracks.toArray()
  const scope = trackIds?.length ? new Set(trackIds) : null
  let targets = all.filter(
    (t) => trackNeedsLyrics(t) && (!scope || scope.has(t.id)),
  )
  if (opts.limit && opts.limit > 0) targets = targets.slice(0, opts.limit)
  let repaired = 0
  let done = 0

  for (const track of targets) {
    try {
      const fetched = await fetchLyricsForTrack(track, { force: opts.force })
      if (fetched?.text) {
        await db.tracks.update(track.id, { lyrics: fetched.text })
        repaired += 1
      }
    } catch {
      /* skip */
    }

    done += 1
    onProgress?.(done, targets.length)
    await new Promise((r) => setTimeout(r, opts.delayMs ?? AUTO_LYRICS_DELAY_MS))
  }

  if (repaired) scheduleAutoCloudPush()
  return { total: targets.length, repaired }
}

/** @type {Promise<number> | null} */
let lyricsRepairPromise = null

/** Idempotent; fetches remote lyrics and syncs to Supabase when logged in.
 *  Reports live progress to `libraryMaintenance` so the settings page can show
 *  a progress bar instead of a manual "fetch lyrics" button. */
export function ensureLyricsRepaired(opts = {}) {
  if (!lyricsRepairPromise) {
    lyricsRepairPromise = (async () => {
      const state = await import('./state.svelte.js')
      state.maintBegin('lyrics')
      try {
        const { repaired } = await repairMissingLyrics(
          (done, total) => state.maintProgress(done, total),
          undefined,
          { limit: AUTO_LYRICS_BATCH_LIMIT, ...opts },
        )
        if (repaired > 0) {
          const { refreshQueueMetadata } = await import('./player.svelte.js')
          state.bumpLibraryEpoch()
          await refreshQueueMetadata()
        }
        return repaired
      } finally {
        state.maintEnd('lyrics')
        lyricsRepairPromise = null
      }
    })()
  }
  return lyricsRepairPromise
}

let autoLyricsScheduled = false

/**
 * Kick off one gentle background lyrics backfill per session, on idle and only
 * when online. No-ops instantly when nothing needs lyrics (no network calls),
 * so it's safe to call on every app boot. This replaces the manual settings
 * "fetch lyrics" button — the library fills itself in the background.
 * @param {number} [delayMs]
 */
export function scheduleAutoLyricsBackfill(delayMs = 4000) {
  if (autoLyricsScheduled || typeof window === 'undefined') return
  autoLyricsScheduled = true
  const run = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    void ensureLyricsRepaired().catch(() => 0)
  }
  const idle = /** @type {any} */ (window).requestIdleCallback
  if (typeof idle === 'function') {
    idle(() => setTimeout(run, delayMs), { timeout: delayMs + 2000 })
  } else {
    setTimeout(run, delayMs)
  }
}

/** @type {ReturnType<typeof setTimeout> | null} */
let maintenanceTimer = null

/**
 * Queue light background cleanup after imports/sync without stacking duplicate jobs.
 * @param {{ trackIds?: string[], lyrics?: boolean, art?: boolean, metadata?: boolean, delayMs?: number }} [opts]
 */
export function scheduleLibraryMaintenance(opts = {}) {
  if (maintenanceTimer) clearTimeout(maintenanceTimer)
  maintenanceTimer = setTimeout(() => {
    maintenanceTimer = null
    void (async () => {
      if (opts.metadata ?? true) await ensureMetadataRepaired().catch(() => 0)
      if (opts.art ?? true) await ensureArtRepaired().catch(() => 0)
      if (opts.lyrics ?? true) {
        if (opts.trackIds?.length) {
          await repairMissingLyrics(undefined, opts.trackIds, {
            limit: opts.trackIds.length,
          }).catch(() => ({ total: 0, repaired: 0 }))
        } else {
          await ensureLyricsRepaired().catch(() => 0)
        }
      }
    })()
  }, opts.delayMs ?? 1200)
}

/** @type {Promise<number> | null} */
let artRepairPromise = null

/** Idempotent while in-flight; re-runs after completion when new tracks need covers. */
export function ensureArtRepaired() {
  if (artRepairPromise) return artRepairPromise

  artRepairPromise = (async () => {
    const state = await import('./state.svelte.js')
    state.maintBegin('art')
    try {
      const repaired = await repairMissingArt()
      if (repaired > 0) {
        const { refreshQueueMetadata } = await import('./player.svelte.js')
        state.bumpLibraryEpoch()
        await refreshQueueMetadata()
      }
      return repaired
    } finally {
      state.maintEnd('art')
      artRepairPromise = null
    }
  })()

  return artRepairPromise
}

/** @param {File} file */
async function readDuration(file) {
  return new Promise((resolve) => {
    const audio = new Audio()
    const url = URL.createObjectURL(file)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0)
      URL.revokeObjectURL(url)
    }
    audio.onerror = () => {
      resolve(0)
      URL.revokeObjectURL(url)
    }
    audio.src = url
  })
}

/** @param {ArrayBuffer} buf */
async function hashBuffer(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** @returns {Promise<{ tracks: import('./types.js').Track[], playlists: import('./types.js').Playlist[], playlistTracks: import('./types.js').PlaylistTrackRow[] }>} */
export async function exportLibraryJson() {
  const tracks = await db.tracks.toArray()
  const playlists = await db.playlists.toArray()
  const playlistTracks = await db.playlistTracks.toArray()
  return {
    tracks: tracks.map(
      ({ objectUrl, artUrl, audioBlob, artBlob, ...rest }) => rest,
    ),
    playlists,
    playlistTracks,
  }
}
