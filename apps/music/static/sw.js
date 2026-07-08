/* Replaced at build time — see apps/music/vite.config.js */
const CACHE_VERSION = '__MUSICOS_BUILD_ID__'
const STATIC_CACHE = `musicos-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `musicos-runtime-${CACHE_VERSION}`
const AUDIO_CACHE = 'musicos-audio-v2'
const ART_CACHE = 'musicos-art-v2'
const RUNTIME_CACHE_LIMIT = 128
const AUDIO_CACHE_LIMIT = 8
const ART_CACHE_LIMIT = 320

const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/favicon-16.png',
  '/favicon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/notify-192.png',
  '/brand-circle-dark-48.png',
  '/brand-circle-dark-96.png',
  '/brand-circle-light-48.png',
  '/brand-circle-light-96.png',
]

/** @param {string} cacheName @param {number} limit */
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= limit) return
  await Promise.all(
    keys.slice(0, keys.length - limit).map((key) => cache.delete(key)),
  )
}

/** @param {string} cacheName @param {RequestInfo | URL} request @param {Response} response @param {number} limit */
async function putCache(cacheName, request, response, limit) {
  const cache = await caches.open(cacheName)
  await cache.put(request, response)
  await trimCache(cacheName, limit)
}

/** @param {URL} url */
function isMusicStorageAudio(url) {
  return /\/storage\/v1\/object\/(sign|public)\/music\//.test(url.pathname)
}

/** @param {URL} url @param {string} bucket */
function stableStorageObjectPath(url, bucket) {
  const match = url.pathname.match(
    new RegExp(`/storage/v1/object/(?:sign|public)/${bucket}/(.+)$`),
  )
  try {
    return match?.[1] ? decodeURIComponent(match[1]) : ''
  } catch {
    return match?.[1] || ''
  }
}

/** @param {URL} url */
function audioCacheKey(url) {
  const path = stableStorageObjectPath(url, 'music')
  return path
    ? `${self.location.origin}/__musicos_cache__/audio/${encodeURIComponent(path)}`
    : url.href
}

/** @param {URL} url */
function isMusicCoverArt(url) {
  return /\/storage\/v1\/object\/(sign|public)\/music-covers\//.test(
    url.pathname,
  )
}

/** @param {URL} url */
function isArtworkUrl(url) {
  return (
    isMusicCoverArt(url) ||
    /^https:\/\/is\d+-ssl\.mzstatic\.com\//.test(url.href)
  )
}

/** @param {URL} url */
function artworkCacheKey(url) {
  if (isMusicCoverArt(url)) {
    const path = stableStorageObjectPath(url, 'music-covers')
    if (path) {
      return `${self.location.origin}/__musicos_cache__/art/${encodeURIComponent(path)}`
    }
  }
  return `${url.origin}${url.pathname}`
}

/** @param {Response} response */
function isCacheableAssetResponse(response) {
  return response.ok || response.type === 'opaque'
}

/** @param {Response} cached @param {Request} request */
async function responseForRange(cached, request) {
  const range = request.headers.get('range')
  const match = range?.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return null

  const buffer = await cached.clone().arrayBuffer()
  const size = buffer.byteLength
  let start = 0
  let end = size - 1
  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2])
    start = Math.max(size - suffixLength, 0)
  } else {
    start = match[1] ? Number(match[1]) : 0
    end = match[2] ? Number(match[2]) : size - 1
  }
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${size}`,
      },
    })
  }

  const slice = buffer.slice(start, Math.min(end + 1, size))
  const headers = new Headers(cached.headers)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Content-Length', String(slice.byteLength))
  headers.set(
    'Content-Range',
    `bytes ${start}-${start + slice.byteLength - 1}/${size}`,
  )
  return new Response(slice, {
    status: 206,
    statusText: 'Partial Content',
    headers,
  })
}

/** @param {Request} request */
async function handleMusicAudioFetch(request) {
  const cache = await caches.open(AUDIO_CACHE)
  const key = audioCacheKey(new URL(request.url))
  const cached = await cache.match(key)
  if (cached) {
    if (request.headers.has('range')) {
      const ranged = await responseForRange(cached, request)
      if (ranged) return ranged
    }
    return cached
  }

  try {
    const response = await fetch(request)
    if (
      response.ok &&
      response.status === 200 &&
      !request.headers.has('range')
    ) {
      await cache.put(key, response.clone())
      await trimCache(AUDIO_CACHE, AUDIO_CACHE_LIMIT)
    }
    return response
  } catch (err) {
    if (cached) return cached
    throw err
  }
}

/** @param {string} url @param {string} trackId */
async function precacheAudioUrl(url, trackId) {
  if (!url || url.startsWith('blob:')) return
  try {
    const key = audioCacheKey(new URL(url))
    const cache = await caches.open(AUDIO_CACHE)
    const existing = await cache.match(key)
    if (existing) return
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (response.ok && response.status === 200) {
      await cache.put(key, response.clone())
      await trimCache(AUDIO_CACHE, AUDIO_CACHE_LIMIT)
    }
    void trackId
  } catch {
    /* offline or expired signed URL */
  }
}

/** @param {string[]} keepTrackIds */
async function purgeAudioCache(keepTrackIds) {
  const keep = keepTrackIds.filter(Boolean)
  const cache = await caches.open(AUDIO_CACHE)
  const keys = await cache.keys()
  await Promise.all(
    keys.map(async (req) => {
      if (keep.some((id) => req.url.includes(id))) return
      await cache.delete(req)
    }),
  )
}

/** @param {Request} request */
async function handleArtworkFetch(request) {
  const key = artworkCacheKey(new URL(request.url))
  const cache = await caches.open(ART_CACHE)
  const cached = await cache.match(key)
  const network = fetch(request)
    .then((response) => {
      if (isCacheableAssetResponse(response)) {
        void cache
          .put(key, response.clone())
          .then(() => trimCache(ART_CACHE, ART_CACHE_LIMIT))
      }
      return response
    })
    .catch((err) => {
      if (cached) return cached
      throw err
    })

  return cached || network
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null))),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('musicos-') &&
                key !== STATIC_CACHE &&
                key !== RUNTIME_CACHE &&
                key !== AUDIO_CACHE &&
                key !== ART_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  if (data.type === 'PRECACHE_AUDIO') {
    event.waitUntil(precacheAudioUrl(data.url, data.trackId))
    return
  }
  if (data.type === 'PURGE_AUDIO_CACHE') {
    event.waitUntil(purgeAudioCache(data.keepTrackIds || []))
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (isMusicStorageAudio(url)) {
    event.respondWith(handleMusicAudioFetch(request))
    return
  }

  if (isArtworkUrl(url)) {
    event.respondWith(handleArtworkFetch(request))
    return
  }

  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/')),
      ),
    )
    return
  }

  if (url.pathname.startsWith('/_app/immutable/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              void putCache(
                RUNTIME_CACHE,
                request,
                response.clone(),
                RUNTIME_CACHE_LIMIT,
              )
            }
            return response
          }),
      ),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            void putCache(
              RUNTIME_CACHE,
              request,
              response.clone(),
              RUNTIME_CACHE_LIMIT,
            )
          }
          return response
        })
        .catch((err) => {
          if (cached) return cached
          throw err
        })

      return cached || network
    }),
  )
})
