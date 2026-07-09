import { browser } from '$app/environment'
import { db } from './db.js'
import { objectUrlForBlob, revokeObjectUrlKey } from './artUrlCache.js'
import { shouldCacheAudioToIndexedDB } from './networkPolicy.js'

/** Max cloud tracks kept as full blobs in IndexedDB. */
export const MAX_AUDIO_BLOB_CACHE = 12

/** @type {Map<string, { objectUrl: string, size: number }>} */
const memoryByTrackId = new Map()

/**
 * @param {string} trackId
 * @returns {string | null}
 */
export function peekCachedAudioUrl(trackId) {
  if (!trackId) return null
  return memoryByTrackId.get(trackId)?.objectUrl || null
}

/**
 * @param {string} trackId
 * @returns {Promise<string | null>}
 */
export async function loadCachedAudioUrl(trackId) {
  if (!browser || !trackId) return null
  const hit = peekCachedAudioUrl(trackId)
  if (hit) return hit

  try {
    const row = await db.audioBlobs.get(trackId)
    if (!row?.blob || !(row.blob instanceof Blob)) return null
    const objectUrl = objectUrlForBlob(`audio:${trackId}`, row.blob)
    memoryByTrackId.set(trackId, { objectUrl, size: row.size || row.blob.size })
    return objectUrl
  } catch {
    return null
  }
}

/**
 * @param {string} trackId
 * @param {string} storagePath
 * @param {Blob} blob
 * @param {string} [mime]
 */
export async function putCachedAudioBlob(
  trackId,
  storagePath,
  blob,
  mime = '',
) {
  if (!browser || !trackId || !(blob instanceof Blob)) return
  const objectUrl = objectUrlForBlob(`audio:${trackId}`, blob)
  memoryByTrackId.set(trackId, { objectUrl, size: blob.size })
  await db.audioBlobs.put({
    trackId,
    storagePath,
    blob,
    mime: mime || blob.type || 'application/octet-stream',
    size: blob.size,
    cachedAt: Date.now(),
  })
}

/**
 * Drop cached blobs except optional keep ids (LRU trim).
 * @param {string[]} [keepTrackIds]
 */
export async function trimAudioBlobCache(keepTrackIds = []) {
  if (!browser) return
  const keep = new Set(keepTrackIds.filter(Boolean))
  try {
    const rows = await db.audioBlobs.orderBy('cachedAt').toArray()
    const toDelete = rows
      .filter((row) => !keep.has(row.trackId))
      .slice(0, Math.max(0, rows.length - MAX_AUDIO_BLOB_CACHE))
    if (!toDelete.length) return
    await db.audioBlobs.bulkDelete(toDelete.map((row) => row.trackId))
    for (const row of toDelete) {
      memoryByTrackId.delete(row.trackId)
      revokeObjectUrlKey(`audio:${row.trackId}`)
    }
  } catch {
    /* ignore */
  }
}

/** @type {Map<string, Promise<void>>} */
const inflightFullCache = new Map()

/**
 * Progressively download a cloud track into IndexedDB (after play or on good network).
 * @param {Pick<import('./types.js').Track, 'id' | 'storagePath' | 'mime'>} track
 * @param {string} url
 * @param {string[]} [keepTrackIds]
 */
export function scheduleFullAudioBlobCache(track, url, keepTrackIds = []) {
  if (!browser || !track?.id || !url || url.startsWith('blob:')) return
  if (!shouldCacheAudioToIndexedDB()) return
  if (memoryByTrackId.has(track.id)) return

  const key = track.id
  const existing = inflightFullCache.get(key)
  if (existing) return

  const job = (async () => {
    try {
      const cached = await loadCachedAudioUrl(track.id)
      if (cached) return

      const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
      if (!response.ok) return
      const blob = await response.blob()
      if (!blob.size) return
      await putCachedAudioBlob(
        track.id,
        track.storagePath || '',
        blob,
        track.mime || blob.type,
      )
      await trimAudioBlobCache([track.id, ...keepTrackIds])
    } catch {
      /* offline or expired URL */
    } finally {
      inflightFullCache.delete(key)
    }
  })()

  inflightFullCache.set(key, job)
}
