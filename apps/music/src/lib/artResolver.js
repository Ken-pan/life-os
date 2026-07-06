import { db, hydrateTrack } from './db.js'
import {
  upsertAlbumArt,
  albumHasArt,
  artUrlForAlbumKey,
  refreshAlbumArtCache,
} from './albumArtStore.js'
import { objectUrlForBlob } from './artUrlCache.js'
import { fetchRemoteArtBlob } from './fetchUtils.js'
import {
  lookupRemoteArtUrl,
  artBlobFromBuffer,
  artBlobFromCloudTrack,
  trackNeedsArt,
} from './albumArt.js'

const REPAIR_CONCURRENCY = 4
const ITUNES_LOOKUP_GAP_MS = 120

/** @type {Map<string, Promise<string | null>>} */
const albumResolveInflight = new Map()

/**
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T) => Promise<void>} worker
 */
export async function runPool(items, concurrency, worker) {
  if (!items.length) return
  let index = 0
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const i = index
        index += 1
        await worker(items[i])
      }
    },
  )
  await Promise.all(runners)
}

export { objectUrlForBlob } from './artUrlCache.js'

/**
 * Resolve missing cover for one album (viewport / on-demand).
 * @param {{ albumKey: string, artist: string, album: string, title?: string }} meta
 */
export async function requestArtForAlbum(meta) {
  const key = meta.albumKey
  if (albumHasArt(key)) return artUrlForAlbumKey(key) ?? null

  const inflight = albumResolveInflight.get(key)
  if (inflight) return inflight

  const job = (async () => {
    const remote = await lookupRemoteArtUrl(
      meta.artist,
      meta.album,
      meta.title || '',
    )
    if (!remote) return null

    let blob = null
    try {
      blob = await fetchRemoteArtBlob(remote)
    } catch {
      blob = null
    }

    await upsertAlbumArt({
      albumKey: key,
      artist: meta.artist,
      album: meta.album,
      artBlob: blob || undefined,
      artRemoteUrl: blob ? undefined : remote,
    })

    const { bumpLibraryEpoch } = await import('./state.svelte.js')
    bumpLibraryEpoch()
    return artUrlForAlbumKey(key) ?? remote
  })().finally(() => {
    albumResolveInflight.delete(key)
  })

  albumResolveInflight.set(key, job)
  return job
}

/**
 * @param {import('./types.js').Track} track
 * @returns {Promise<import('./types.js').Track | null>}
 */
export async function resolveTrackArtSources(track) {
  if (!trackNeedsArt(track)) return track

  if (track.audioBlob instanceof Blob) {
    try {
      const artBlob = artBlobFromBuffer(await track.audioBlob.arrayBuffer())
      if (artBlob) {
        await upsertAlbumArt({
          albumKey: track.albumKey,
          artist: track.artist,
          album: track.album,
          artBlob,
        })
        return hydrateTrack({ ...track })
      }
    } catch {
      /* skip */
    }
  }

  if (track.storagePath) {
    try {
      const artBlob = await artBlobFromCloudTrack(track)
      if (artBlob) {
        await upsertAlbumArt({
          albumKey: track.albumKey,
          artist: track.artist,
          album: track.album,
          artBlob,
        })
        return hydrateTrack({ ...track })
      }
    } catch {
      /* skip */
    }
  }

  await requestArtForAlbum({
    albumKey: track.albumKey,
    artist: track.artist,
    album: track.album,
    title: track.title,
  })
  const updated = await db.tracks.get(track.id)
  return updated ? hydrateTrack(updated) : null
}

/** @param {import('./types.js').Track[]} tracks @returns {Promise<number>} */
export async function repairMissingArtModern(tracks) {
  await refreshAlbumArtCache()
  let repaired = 0

  await runPool(
    tracks.filter((t) => trackNeedsArt(t)),
    REPAIR_CONCURRENCY,
    async (track) => {
      if (albumHasArt(track.albumKey)) return

      if (track.audioBlob instanceof Blob) {
        try {
          const artBlob = artBlobFromBuffer(await track.audioBlob.arrayBuffer())
          if (artBlob) {
            await upsertAlbumArt({
              albumKey: track.albumKey,
              artist: track.artist,
              album: track.album,
              artBlob,
            })
            repaired += 1
            return
          }
        } catch {
          /* skip */
        }
      }

      if (track.storagePath) {
        try {
          const artBlob = await artBlobFromCloudTrack(track)
          if (artBlob) {
            await upsertAlbumArt({
              albumKey: track.albumKey,
              artist: track.artist,
              album: track.album,
              artBlob,
            })
            repaired += 1
          }
        } catch {
          /* skip */
        }
      }
    },
  )

  const remaining = await db.tracks.toArray()
  /** @type {Map<string, import('./types.js').Track>} */
  const sampleByAlbum = new Map()
  for (const track of remaining) {
    if (!trackNeedsArt(track)) continue
    if (!sampleByAlbum.has(track.albumKey))
      sampleByAlbum.set(track.albumKey, track)
  }

  for (const [albumKey, sample] of sampleByAlbum) {
    if (albumHasArt(albumKey)) continue

    const remote = await lookupRemoteArtUrl(
      sample.artist,
      sample.album,
      sample.title,
    )
    await new Promise((r) => setTimeout(r, ITUNES_LOOKUP_GAP_MS))
    if (!remote) continue

    let blob = null
    try {
      blob = await fetchRemoteArtBlob(remote)
    } catch {
      blob = null
    }

    await upsertAlbumArt({
      albumKey,
      artist: sample.artist,
      album: sample.album,
      artBlob: blob || undefined,
      artRemoteUrl: blob ? undefined : remote,
    })
    repaired += 1

    const { bumpLibraryEpoch } = await import('./state.svelte.js')
    bumpLibraryEpoch()
  }

  return repaired
}
