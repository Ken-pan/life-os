/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker'

const CACHE = `aios-sw-${version}`
const ASSETS = [...build, ...files]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(ASSETS)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

/**
 * @param {Request} request
 * @param {URL} url
 */
function isSameOriginAsset(request, url) {
  if (url.origin !== self.location.origin) return false
  if (request.mode === 'navigate') return false
  if (ASSETS.includes(url.pathname)) return true
  return /\.(?:js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|webmanifest)$/i.test(url.pathname)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never cache opaque third-party or cross-origin API traffic
  if (url.origin !== self.location.origin) return

  // Navigation: network-first, fallback to SPA shell
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const response = await fetch(request)
          if (response instanceof Response && response.ok) {
            return response
          }
        } catch {
          /* offline */
        }
        return (
          (await cache.match('/')) ||
          (await cache.match('/index.html')) ||
          Response.error()
        )
      })(),
    )
    return
  }

  // Same-origin GET assets: cache-first
  if (isSameOriginAsset(request, url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const cached = await cache.match(request)
        if (cached) return cached
        try {
          const response = await fetch(request)
          if (
            response instanceof Response &&
            response.ok &&
            response.type === 'basic'
          ) {
            await cache.put(request, response.clone())
          }
          return response
        } catch (err) {
          const fallback = await cache.match(request)
          if (fallback) return fallback
          throw err
        }
      })(),
    )
  }
})
