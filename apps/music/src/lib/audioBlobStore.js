import { browser } from '$app/environment'
import { db } from './db.js'
import { objectUrlForBlob, revokeObjectUrlKey } from './artUrlCache.js'
import { shouldCacheAudioToIndexedDB } from './networkPolicy.js'

/** Max cloud tracks kept as full blobs in IndexedDB. */
export const MAX_AUDIO_BLOB_CACHE = 12

/** Parallel full-file downloads into IndexedDB (keep low on cellular / Continuity). */
export const MAX_FULL_CACHE_CONCURRENT = 2

/** @type {Map<string, { objectUrl: string, size: number }>} */
const memoryByTrackId = new Map()

/** @type {Map<string, Promise<void>>} */
const inflightFullCache = new Map()

/**
 * @typedef {{
 *   track: Pick<import('./types.js').Track, 'id' | 'storagePath' | 'mime'>,
 *   url: string,
 *   keepTrackIds: string[],
 * }} FullCacheJob
 */

/** @type {FullCacheJob[]} */
const fullCacheQueue = []

let fullCacheActive = 0

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

/**
 * @param {string} trackId
 */
function isQueuedFullCache(trackId) {
  return fullCacheQueue.some((job) => job.track.id === trackId)
}

/**
 * @param {FullCacheJob} job
 */
async function runFullAudioBlobCacheJob(job) {
  const { track, url, keepTrackIds } = job
  const cached = await loadCachedAudioUrl(track.id)
  if (cached) return

  // Opportunistic prefetch must not evict; play/warm passes keepTrackIds.
  if (keepTrackIds.length === 0) {
    try {
      const count = await db.audioBlobs.count()
      if (count >= MAX_AUDIO_BLOB_CACHE) return
    } catch {
      return
    }
  }

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
}

function pumpFullAudioBlobCache() {
  while (fullCacheActive < MAX_FULL_CACHE_CONCURRENT && fullCacheQueue.length) {
    const job = fullCacheQueue.shift()
    if (!job?.track?.id) continue
    const key = job.track.id
    fullCacheActive += 1
    const run = (async () => {
      try {
        await runFullAudioBlobCacheJob(job)
      } catch {
        /* offline or expired URL */
      } finally {
        fullCacheActive -= 1
        inflightFullCache.delete(key)
        pumpFullAudioBlobCache()
      }
    })()
    inflightFullCache.set(key, run)
  }
}

/**
 * Progressively download a cloud track into IndexedDB (after play or on good network).
 * Serialized with a small concurrency cap to avoid fetch/memory storms.
 * @param {Pick<import('./types.js').Track, 'id' | 'storagePath' | 'mime'>} track
 * @param {string} url
 * @param {string[]} [keepTrackIds]
 */
export function scheduleFullAudioBlobCache(track, url, keepTrackIds = []) {
  if (!browser || !track?.id || !url || url.startsWith('blob:')) return
  if (!shouldCacheAudioToIndexedDB()) return
  if (memoryByTrackId.has(track.id)) return
  if (inflightFullCache.has(track.id) || isQueuedFullCache(track.id)) return

  fullCacheQueue.push({
    track,
    url,
    keepTrackIds: Array.isArray(keepTrackIds) ? keepTrackIds : [],
  })
  pumpFullAudioBlobCache()
}

/**
 * Whether a full IDB download is already cached, queued, or in flight for this track.
 * @param {string} trackId
 */
export function isAudioBlobCachePendingOrReady(trackId) {
  if (!trackId) return false
  return (
    memoryByTrackId.has(trackId) ||
    inflightFullCache.has(trackId) ||
    isQueuedFullCache(trackId)
  )
}

/**
 * Idle-hydrate recent track blobs into the memory map for sync resolve hits.
 * @param {string[]} trackIds
 * @param {number} [limit]
 */
export async function hydrateRecentAudioCache(trackIds, limit = 8) {
  if (!browser || !trackIds?.length) return
  const unique = [...new Set(trackIds.filter(Boolean))].slice(0, limit)
  for (const id of unique) {
    if (memoryByTrackId.has(id)) continue
    await loadCachedAudioUrl(id)
  }
}

/**
 * Schedule hydrate on idle so UI stays responsive.
 * @param {string[]} trackIds
 * @param {number} [limit]
 */
export function scheduleHydrateRecentAudioCache(trackIds, limit = 8) {
  if (!browser || !trackIds?.length) return
  const run = () => {
    void hydrateRecentAudioCache(trackIds, limit).catch(() => {})
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2500 })
  } else {
    setTimeout(run, 400)
  }
}

/**
 * Offline cache stats for Settings.
 * @returns {Promise<{ count: number, bytes: number }>}
 */
export async function getAudioBlobCacheStats() {
  if (!browser) return { count: 0, bytes: 0 }
  try {
    const rows = await db.audioBlobs.toArray()
    let bytes = 0
    for (const row of rows) bytes += Number(row.size) || 0
    return { count: rows.length, bytes }
  } catch {
    return { count: 0, bytes: 0 }
  }
}
