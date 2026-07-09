import * as tus from 'tus-js-client'
import { browser } from '$app/environment'
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase.js'
import { MUSIC_TABLES as T } from './supabaseTables.js'
import { db, getAllTracks } from './db.js'
import { t } from './i18n/index.js'
import { loadCachedAudioUrl, peekCachedAudioUrl } from './audioBlobStore.js'
import { getPrefetchLimit, getWarmByteMode } from './networkPolicy.js'

export const MUSIC_BUCKET = 'music'
export const MUSIC_COVERS_BUCKET = 'music-covers'

/** Files above this use TUS resumable upload (Supabase recommendation). */
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024

const SIGNED_TTL_SEC = 3600
const AUDIO_UPLOAD_CONCURRENCY = 2
const RETRY_DELAYS_MS = [350, 1000]
const SIGNED_URL_BATCH_SIZE = 24

const SIGNED_URL_CACHE_KEY = 'musicos_signed_url_cache'

/** @returns {Map<string, { url: string, expiresAt: number }>} */
function loadSignedUrlCache() {
  if (!browser) return new Map()
  try {
    const raw = localStorage.getItem(SIGNED_URL_CACHE_KEY)
    if (!raw) return new Map()
    const now = Date.now()
    const entries = Object.entries(JSON.parse(raw)).filter(
      ([, v]) => v && v.expiresAt > now + 60_000,
    )
    return new Map(entries)
  } catch {
    return new Map()
  }
}

/** @type {Map<string, { url: string, expiresAt: number }>} */
const signedUrlCache = loadSignedUrlCache()
/** @type {Map<string, Promise<string>>} */
const signedUrlInflight = new Map()
/** @type {ReturnType<typeof setTimeout> | null} */
let signedUrlCachePersistTimer = null

function persistSignedUrlCache() {
  if (!browser) return
  clearTimeout(signedUrlCachePersistTimer)
  signedUrlCachePersistTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        SIGNED_URL_CACHE_KEY,
        JSON.stringify(Object.fromEntries(signedUrlCache)),
      )
    } catch {
      /* storage full/unavailable, skip */
    }
  }, 200)
}
/** @type {Map<string, Promise<string>>} */
const coverUploadInflight = new Map()
/** @type {Promise<typeof import('./albumArtStore.js')> | null} */
let albumArtModulePromise = null

async function requireUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error(t('sync.notSignedIn'))
  return data.user
}

/**
 * @param {Pick<import('./types.js').Track, 'mime' | 'fileName' | 'id'>} track
 */
export function storagePathForTrack(userId, track) {
  return `${userId}/${track.id}.${extForTrack(track)}`
}

/** @param {Pick<import('./types.js').Track, 'mime' | 'fileName'>} track */
function extForTrack(track) {
  const name = track.fileName || ''
  const m = name.match(/\.([a-z0-9]+)$/i)
  if (m) return m[1].toLowerCase()
  /** @type {Record<string, string>} */
  const mimeMap = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/webm': 'webm',
  }
  return mimeMap[track.mime || ''] || 'mp3'
}

/** @param {Blob} blob */
function extForImageBlob(blob) {
  const type = (blob.type || '').toLowerCase()
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  if (type.includes('jpg') || type.includes('jpeg')) return 'jpg'
  return 'jpg'
}

/** @param {string} value */
function hashPathPart(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @param {unknown} err */
function isRetryableError(err) {
  const status = Number(
    err && typeof err === 'object' && 'statusCode' in err
      ? /** @type {{ statusCode?: number }} */ (err).statusCode
      : err && typeof err === 'object' && 'status' in err
        ? /** @type {{ status?: number }} */ (err).status
        : 0,
  )
  const message =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err
        ? String(/** @type {{ message?: unknown }} */ (err).message || '')
        : ''
  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    /timeout|network|fetch|rate|temporar/i.test(message)
  )
}

/**
 * @template T
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withRetry(work) {
  /** @type {unknown} */
  let lastError
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await work()
    } catch (err) {
      lastError = err
      if (!isRetryableError(err) || attempt >= RETRY_DELAYS_MS.length) throw err
      await sleep(RETRY_DELAYS_MS[attempt])
    }
  }
  throw lastError
}

async function albumArtStore() {
  albumArtModulePromise ||= import('./albumArtStore.js')
  return albumArtModulePromise
}

/**
 * @param {string} path
 * @returns {string | null}
 */
export function peekSignedAudioUrl(path) {
  if (!path) return null
  const cached = signedUrlCache.get(path)
  const now = Date.now()
  if (cached && cached.expiresAt > now + 60_000) return cached.url
  return null
}

/**
 * @param {string} path
 * @param {number} [ttlSec]
 * @returns {Promise<string>}
 */
/**
 * Drop a cached signed URL so the next resolve fetches a fresh token.
 * @param {string} path
 */
export function invalidateSignedAudioUrl(path) {
  if (!path) return
  signedUrlCache.delete(path)
  persistSignedUrlCache()
}

/**
 * @param {string[]} paths
 * @param {number} [ttlSec]
 */
async function signAudioPathsBatch(paths, ttlSec = SIGNED_TTL_SEC) {
  if (!paths.length) return
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()
  if (sessionError || !sessionData.session) return

  const now = Date.now()
  for (let i = 0; i < paths.length; i += SIGNED_URL_BATCH_SIZE) {
    const chunk = paths.slice(i, i + SIGNED_URL_BATCH_SIZE)
    const { data, error } = await supabase.storage
      .from(MUSIC_BUCKET)
      .createSignedUrls(chunk, ttlSec)
    if (error || !data) continue
    for (const row of data) {
      if (row.error || !row.signedUrl || !row.path) continue
      signedUrlCache.set(row.path, {
        url: row.signedUrl,
        expiresAt: now + ttlSec * 1000,
      })
    }
  }
  persistSignedUrlCache()
}

const SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60_000

/**
 * Silently refresh signed URLs that expire within 5 minutes.
 * @param {number} [limit]
 */
export async function refreshExpiringSignedUrls(limit = 32) {
  if (!browser) return
  const now = Date.now()
  const expiring = [...signedUrlCache.entries()]
    .filter(([, v]) => v && v.expiresAt - now < SIGNED_URL_REFRESH_MARGIN_MS)
    .map(([path]) => path)
    .slice(0, limit)
  if (!expiring.length) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  await signAudioPathsBatch(expiring).catch(() => {})
}

export async function getSignedAudioUrl(path, ttlSec = SIGNED_TTL_SEC) {
  if (!path) throw new Error(t('cloudAudio.noPath'))
  const hit = peekSignedAudioUrl(path)
  if (hit) return hit

  const inflight = signedUrlInflight.get(path)
  if (inflight) return inflight

  const job = (async () => {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()
    if (sessionError || !sessionData.session)
      throw new Error(t('sync.notSignedIn'))

    const { data, error } = await supabase.storage
      .from(MUSIC_BUCKET)
      .createSignedUrl(path, ttlSec)
    if (error || !data?.signedUrl)
      throw error || new Error(t('cloudAudio.signedFailed'))

    const now = Date.now()
    signedUrlCache.set(path, {
      url: data.signedUrl,
      expiresAt: now + ttlSec * 1000,
    })
    persistSignedUrlCache()
    return data.signedUrl
  })().finally(() => {
    signedUrlInflight.delete(path)
  })

  signedUrlInflight.set(path, job)
  return job
}

/**
 * Cap prefetch volume on Save-Data / slow cellular.
 * @param {number} limit
 * @returns {number}
 */
function prefetchLimitForNetwork(limit) {
  return getPrefetchLimit(limit)
}

/**
 * Synchronous URL when already cached or local — keeps iOS user-gesture chain when possible.
 * @param {import('./types.js').Track} track
 * @returns {string}
 */
/** @param {import('./types.js').Track | null | undefined} track */
export function hasPlayableSource(track) {
  if (!track) return false
  if (track.audioBlob instanceof Blob) return true
  if (typeof track.objectUrl === 'string' && track.objectUrl) return true
  if (typeof track.storagePath === 'string' && track.storagePath) return true
  return false
}

export function resolvePlayUrlSync(track) {
  if (!track) return ''
  if (track.objectUrl) return track.objectUrl
  if (track.audioBlob && browser) {
    track.objectUrl = URL.createObjectURL(track.audioBlob)
    return track.objectUrl
  }
  const cached = peekCachedAudioUrl(track.id)
  if (cached) return cached
  if (track.storagePath) return peekSignedAudioUrl(track.storagePath) || ''
  return ''
}

/**
 * Resolve a playable URL: prefer local blob, IndexedDB cache, else signed cloud URL.
 * @param {import('./types.js').Track} track
 * @returns {Promise<string>}
 */
export async function resolvePlayUrl(track) {
  const sync = resolvePlayUrlSync(track)
  if (sync) return sync
  const cached = await loadCachedAudioUrl(track.id)
  if (cached) return cached
  if (track?.storagePath) return getSignedAudioUrl(track.storagePath)
  return ''
}

/**
 * Warm signed URL cache for cloud tracks (call after sync).
 * Uses createSignedUrls in batches; does not fetch audio bytes (no track ids).
 * @param {string[]} paths
 * @param {number} [limit]
 */
export async function prefetchSignedUrls(paths, limit = 24) {
  const capped = prefetchLimitForNetwork(limit)
  if (capped <= 0) return
  const unique = [...new Set(paths.filter(Boolean))]
  const pending = unique.filter((p) => !peekSignedAudioUrl(p)).slice(0, capped)
  if (!pending.length) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  await signAudioPathsBatch(pending).catch(() => {})
}

/**
 * Batch-sign missing URLs and ask the SW to precache audio bytes.
 * @param {Pick<import('./types.js').Track, 'id' | 'storagePath' | 'audioBlob'>[]} tracks
 * @param {number} [limit]
 */
export async function prefetchTracksAudio(tracks, limit = 24) {
  const capped = prefetchLimitForNetwork(limit)
  if (capped <= 0 || !browser) return

  const cloud = tracks.filter(
    (tr) =>
      tr &&
      typeof tr.storagePath === 'string' &&
      tr.storagePath &&
      !(tr.audioBlob instanceof Blob),
  )
  if (!cloud.length) return

  const uniquePaths = [
    ...new Set(cloud.map((tr) => /** @type {string} */ (tr.storagePath))),
  ]
  const pending = uniquePaths
    .filter((p) => !peekSignedAudioUrl(p))
    .slice(0, capped)
  if (pending.length) {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    await signAudioPathsBatch(pending).catch(() => {})
  }

  const { precacheAudioInServiceWorker } = await import('./audioPrecache.js')
  const {
    scheduleFullAudioBlobCache,
    isAudioBlobCachePendingOrReady,
    peekCachedAudioUrl,
  } = await import('./audioBlobStore.js')
  const warmMode = getWarmByteMode()
  const warmed = new Set()
  for (const tr of cloud) {
    if (warmed.size >= capped) break
    const path = tr.storagePath
    if (!path || warmed.has(path)) continue
    if (peekCachedAudioUrl(tr.id) || isAudioBlobCachePendingOrReady(tr.id)) {
      warmed.add(path)
      continue
    }
    const url = peekSignedAudioUrl(path)
    if (!url) continue
    warmed.add(path)
    if (warmMode === 'full') {
      scheduleFullAudioBlobCache(tr, url)
      // Prefer IDB as durable full cache; skip SW full duplicate download.
    } else if (warmMode === 'range') {
      precacheAudioInServiceWorker(url, tr.id, { mode: 'range' })
    }
  }
}

/**
 * @param {Blob | File} blob
 * @param {string} path
 * @param {string} contentType
 * @param {(ratio: number) => void} [onProgress]
 */
async function uploadBlob(blob, path, contentType, onProgress) {
  if (blob.size > RESUMABLE_THRESHOLD) {
    await uploadResumable(blob, path, contentType, onProgress)
    return
  }

  await withRetry(async () => {
    const { error } = await supabase.storage
      .from(MUSIC_BUCKET)
      .upload(path, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: contentType || 'application/octet-stream',
      })
    if (error) throw error
  })
  onProgress?.(1)
}

/**
 * Upload the locally cached album cover to the public cover bucket and return its URL.
 * Best-effort by design: audio upload must not fail just because art sync is unavailable.
 * @param {import('./types.js').Track} track
 * @param {{ id: string }} [user]
 * @returns {Promise<string>}
 */
export async function uploadTrackAlbumArt(track, user) {
  const currentUser = user || (await requireUser())
  const { peekAlbumArt, setAlbumArtRemoteUrl } = await albumArtStore()
  const row = peekAlbumArt(track.albumKey)
  if (row?.artRemoteUrl?.startsWith('https://')) return row.artRemoteUrl
  if (!(row?.artBlob instanceof Blob)) return ''

  const key = `${currentUser.id}:${track.albumKey}`
  const inflight = coverUploadInflight.get(key)
  if (inflight) return inflight

  const job = (async () => {
    const contentType = row.artBlob.type || 'image/jpeg'
    const albumHash = hashPathPart(
      track.albumKey || `${track.artist}::${track.album}`,
    )
    const version = Number(row.updatedAt) || hashPathPart(track.id)
    const path = `${currentUser.id}/albums/${albumHash}-${version}.${extForImageBlob(row.artBlob)}`
    await withRetry(async () => {
      const { error } = await supabase.storage
        .from(MUSIC_COVERS_BUCKET)
        .upload(path, row.artBlob, {
          cacheControl: '31536000',
          upsert: true,
          contentType,
        })
      if (error) throw error
    })

    const { data } = supabase.storage
      .from(MUSIC_COVERS_BUCKET)
      .getPublicUrl(path)
    const publicUrl = data?.publicUrl || ''
    if (publicUrl) {
      await setAlbumArtRemoteUrl(
        track.albumKey,
        track.artist,
        track.album,
        publicUrl,
      )
    }
    return publicUrl
  })().finally(() => {
    coverUploadInflight.delete(key)
  })

  coverUploadInflight.set(key, job)
  return job
}

/**
 * @param {Blob | File} blob
 * @param {string} path
 * @param {string} contentType
 * @param {(ratio: number) => void} [onProgress]
 */
async function uploadResumable(blob, path, contentType, onProgress) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error(t('sync.notSignedIn'))
  }

  const endpoint = `${SUPABASE_URL}/storage/v1/upload/resumable`

  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: MUSIC_BUCKET,
        objectName: path,
        contentType: contentType || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: RESUMABLE_THRESHOLD,
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (bytesTotal > 0) onProgress?.(bytesUploaded / bytesTotal)
      },
      onSuccess: () => {
        onProgress?.(1)
        resolve(undefined)
      },
    })

    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    }, reject)
  })
}

/**
 * Upload one local track's audio to private Storage and persist storage_path.
 * @param {import('./types.js').Track & { audioBlob?: Blob }} track
 * @param {(ratio: number) => void} [onProgress]
 * @param {{ id: string }} [user]
 */
export async function uploadTrackAudio(track, onProgress, user) {
  const currentUser = user || (await requireUser())
  const blob = track.audioBlob
  if (!blob) throw new Error(t('cloudAudio.noLocalAudio'))

  const path = storagePathForTrack(currentUser.id, track)
  const contentType = track.mime || blob.type || 'application/octet-stream'
  await uploadBlob(blob, path, contentType, onProgress)
  let artRemoteUrl = ''
  try {
    artRemoteUrl = await uploadTrackAlbumArt(track, currentUser)
  } catch {
    artRemoteUrl = ''
  }

  const payload = {
    user_id: currentUser.id,
    track_id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    album_key: track.albumKey,
    artist_key: track.artistKey,
    duration: track.duration,
    liked: track.liked,
    play_count: track.playCount,
    added_at: track.addedAt,
    lyrics: track.lyrics || '',
    storage_path: path,
    mime_type: contentType,
    size_bytes: blob.size,
  }
  if (artRemoteUrl) payload.art_remote_url = artRemoteUrl

  await withRetry(async () => {
    const { error } = await supabase.from(T.trackMeta).upsert(payload)
    if (error) throw error
  })

  await db.tracks.update(track.id, {
    storagePath: path,
    mime: contentType,
    size: blob.size,
  })

  return path
}

/**
 * @param {(import('./types.js').Track & { audioBlob?: Blob })[]} tracks
 * @param {{ id: string }} user
 * @param {(info: { done: number, total: number, title: string }) => void} [onProgress]
 */
async function uploadTrackPool(tracks, user, onProgress) {
  let index = 0
  let done = 0
  let uploaded = 0
  let failed = 0
  let totalBytes = 0

  async function next() {
    while (index < tracks.length) {
      const track = tracks[index++]
      onProgress?.({ done, total: tracks.length, title: track.title })
      try {
        await uploadTrackAudio(track, undefined, user)
        uploaded += 1
        totalBytes += track.size || track.audioBlob?.size || 0
      } catch {
        failed += 1
      } finally {
        done += 1
        onProgress?.({ done, total: tracks.length, title: track.title })
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(AUDIO_UPLOAD_CONCURRENCY, tracks.length) },
      () => next(),
    ),
  )
  onProgress?.({ done: tracks.length, total: tracks.length, title: '' })
  return { uploaded, failed, totalBytes }
}

/**
 * Upload all local tracks that have audio but no storagePath yet.
 * @param {(info: { done: number, total: number, title: string }) => void} [onProgress]
 * @returns {Promise<{ uploaded: number, skipped: number, failed: number, totalBytes: number }>}
 */
/**
 * Upload specific local tracks by id (import pipeline).
 * @param {string[]} trackIds
 * @param {(info: { done: number, total: number, title: string }) => void} [onProgress]
 */
export async function uploadTracksByIds(trackIds, onProgress) {
  if (!trackIds.length) {
    return { uploaded: 0, failed: 0, totalBytes: 0 }
  }
  const rows = await db.tracks.bulkGet(trackIds)
  const pending = rows.filter((tr) => tr?.audioBlob && !tr.storagePath)
  if (!pending.length) return { uploaded: 0, failed: 0, totalBytes: 0 }
  const user = await requireUser()
  return uploadTrackPool(pending, user, onProgress)
}

export async function uploadPendingAudio(onProgress) {
  const tracks = await getAllTracks()
  const pending = tracks.filter((tr) => tr.audioBlob && !tr.storagePath)
  const result = pending.length
    ? await uploadTrackPool(pending, await requireUser(), onProgress)
    : { uploaded: 0, failed: 0, totalBytes: 0 }
  return {
    uploaded: result.uploaded,
    skipped: tracks.length - pending.length,
    failed: result.failed,
    totalBytes: result.totalBytes,
  }
}

/**
 * Count tracks ready to upload vs already on cloud.
 * @returns {Promise<{ pending: number, cloud: number, localAudio: number, localOnly: number, pendingBytes: number }>}
 */
export async function cloudAudioStats() {
  const tracks = await getAllTracks()
  let pending = 0
  let cloud = 0
  let localAudio = 0
  let localOnly = 0
  let pendingBytes = 0
  for (const tr of tracks) {
    if (tr.audioBlob) localAudio += 1
    if (tr.storagePath) cloud += 1
    if (tr.audioBlob && !tr.storagePath) {
      pending += 1
      pendingBytes += tr.size || tr.audioBlob.size || 0
    } else if (!tr.audioBlob && !tr.storagePath) localOnly += 1
  }
  return { pending, cloud, localAudio, localOnly, pendingBytes }
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
