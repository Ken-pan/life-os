/* Replaced at build time — see apps/music/vite.config.js */
const CACHE_VERSION = '__MUSICOS_BUILD_ID__'
const STATIC_CACHE = `musicos-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `musicos-runtime-${CACHE_VERSION}`
const AUDIO_CACHE = `musicos-audio-${CACHE_VERSION}`
const RUNTIME_CACHE_LIMIT = 96
const AUDIO_CACHE_LIMIT = 4

const PRECACHE = ['/manifest.webmanifest', '/icon.svg']

/** @param {string} cacheName @param {number} limit */
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= limit) return
  await Promise.all(
    keys.slice(0, keys.length - limit).map((key) => cache.delete(key)),
  )
}

/** @param {Cache} cache @param {Request} request @param {Response} response */
async function putRuntime(cache, request, response) {
  await cache.put(request, response)
  await trimCache(RUNTIME_CACHE, RUNTIME_CACHE_LIMIT)
}

/** @param {URL} url */
function isMusicStorageAudio(url) {
  return /\/storage\/v1\/object\/(sign|public)\/music\//.test(url.pathname)
}

/** @param {Request} request */
async function handleMusicAudioFetch(request) {
  const cache = await caches.open(AUDIO_CACHE)
  const cached = await cache.match(request.url)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (
      response.ok &&
      response.status === 200 &&
      !request.headers.has('range')
    ) {
      await cache.put(request.url, response.clone())
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
    const cache = await caches.open(AUDIO_CACHE)
    const existing = await cache.match(url)
    if (existing) return
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (response.ok && response.status === 200) {
      await cache.put(url, response.clone())
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
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
                key !== AUDIO_CACHE,
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

  if (/^https:\/\/is\d+-ssl\.mzstatic\.com\//.test(url.href)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const network = fetch(request)
          .then((response) => {
            if (response.ok) void putRuntime(cache, request, response.clone())
            return response
          })
          .catch(() => cached)

        return cached || network
      }),
    )
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
              void caches
                .open(RUNTIME_CACHE)
                .then((cache) => putRuntime(cache, request, response.clone()))
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
            void caches
              .open(RUNTIME_CACHE)
              .then((cache) => putRuntime(cache, request, response.clone()))
          }
          return response
        })
        .catch(() => cached)

      return cached || network
    }),
  )
})
