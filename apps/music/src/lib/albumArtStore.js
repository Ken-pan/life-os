import { db } from './db.js'
import { objectUrlForBlob } from './artUrlCache.js'
import { fetchRemoteArtBlob } from './fetchUtils.js'

/** @typedef {{ albumKey: string, artist: string, album: string, artBlob?: Blob, artRemoteUrl?: string, updatedAt: number }} AlbumArtRow */

/** @type {Map<string, AlbumArtRow>} */
let cache = new Map()

/** @type {Promise<void> | null} */
let cachePromise = null

/** @type {Set<string>} */
const materializeInflight = new Set()

export async function ensureAlbumArtCache() {
  if (cachePromise) return cachePromise
  cachePromise = refreshAlbumArtCache()
  return cachePromise
}

export async function refreshAlbumArtCache() {
  const rows = /** @type {AlbumArtRow[]} */ (await db.albumArt.toArray())
  cache = new Map(rows.map((row) => [row.albumKey, row]))
}

/** @param {string} albumKey */
export function peekAlbumArt(albumKey) {
  return cache.get(albumKey) || null
}

/** @param {string} albumKey */
export function albumHasArt(albumKey) {
  const row = peekAlbumArt(albumKey)
  if (!row) return false
  if (row.artBlob instanceof Blob) return true
  return (
    typeof row.artRemoteUrl === 'string' &&
    row.artRemoteUrl.startsWith('https://')
  )
}

/** @param {string} albumKey */
export function artUrlForAlbumKey(albumKey) {
  const row = peekAlbumArt(albumKey)
  if (!row) return undefined
  if (row.artBlob instanceof Blob) {
    return objectUrlForBlob(`album:${albumKey}`, row.artBlob)
  }
  if (
    typeof row.artRemoteUrl === 'string' &&
    row.artRemoteUrl.startsWith('https://')
  ) {
    return row.artRemoteUrl
  }
  return undefined
}

/**
 * @param {{ albumKey: string, artist: string, album: string, artBlob?: Blob, artRemoteUrl?: string }} input
 */
export async function upsertAlbumArt(input) {
  const existing = peekAlbumArt(input.albumKey)
  /** @type {AlbumArtRow} */
  const next = {
    albumKey: input.albumKey,
    artist: input.artist,
    album: input.album,
    updatedAt: Date.now(),
    artBlob: existing?.artBlob,
    artRemoteUrl: existing?.artRemoteUrl,
  }

  if (input.artBlob instanceof Blob) {
    next.artBlob = input.artBlob
    delete next.artRemoteUrl
  } else if (
    input.artRemoteUrl?.startsWith('https://') &&
    !(next.artBlob instanceof Blob)
  ) {
    next.artRemoteUrl = input.artRemoteUrl
  }

  await db.albumArt.put(next)
  cache.set(input.albumKey, next)
  return next
}

/** @param {string} albumKey */
export function scheduleAlbumArtMaterialize(albumKey) {
  if (materializeInflight.has(albumKey)) return
  materializeInflight.add(albumKey)

  void (async () => {
    try {
      const row = peekAlbumArt(albumKey) || (await db.albumArt.get(albumKey))
      if (!row || row.artBlob instanceof Blob) return
      if (
        typeof row.artRemoteUrl !== 'string' ||
        !row.artRemoteUrl.startsWith('https://')
      )
        return

      const blob = await fetchRemoteArtBlob(row.artRemoteUrl)
      if (!blob) return

      await upsertAlbumArt({
        albumKey: row.albumKey,
        artist: row.artist,
        album: row.album,
        artBlob: blob,
      })

      const { bumpLibraryEpoch } = await import('./state.svelte.js')
      bumpLibraryEpoch()
    } catch {
      /* best-effort */
    } finally {
      materializeInflight.delete(albumKey)
    }
  })()
}

/** @param {string} albumKey @param {string | null | undefined} remoteUrl */
export async function setAlbumArtRemoteUrl(albumKey, artist, album, remoteUrl) {
  if (!remoteUrl?.startsWith('https://')) return
  await upsertAlbumArt({ albumKey, artist, album, artRemoteUrl: remoteUrl })
}
