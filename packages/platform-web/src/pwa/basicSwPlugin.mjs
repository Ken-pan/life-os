import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Life OS 基础 service worker 模板（portal / home / finance 同构逻辑的唯一真源）：
 * install 预缓存 + skipWaiting · activate 清旧缓存 + claim ·
 * SKIP_WAITING 消息 · 导航请求网络优先回退到 fallback ·
 * 同源 GET 网络优先写缓存、离线回退缓存。
 *
 * 复杂 SW（fitness / planner / music 的领域缓存策略）不在此模板范围。
 *
 * @param {{ cacheName: string, precache: string[], navigationFallback: string }} config
 */
export function renderBasicSw({ cacheName, precache, navigationFallback }) {
  return `// 由 @life-os/platform-web/pwa/basic-sw 在构建时生成 — 不要手改
const CACHE = ${JSON.stringify(cacheName)}
const PRECACHE = ${JSON.stringify(precache, null, 2)}
const NAV_FALLBACK = ${JSON.stringify(navigationFallback)}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(NAV_FALLBACK)),
    )
    return
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
        }
        return res
      })
      .catch(() => caches.match(request)),
  )
})
`
}

/**
 * Vite 插件：构建结束时把渲染好的 sw.js 写进输出目录。
 * cache 名自动带 build id（COMMIT_REF / DEPLOY_ID / dev 时间戳），
 * 保证每次部署都能替换旧缓存。
 *
 * @param {{ cachePrefix: string, precache: string[], navigationFallback?: string }} options
 */
export function lifeOsBasicSwPlugin({
  cachePrefix,
  precache,
  navigationFallback = '/',
}) {
  return {
    name: 'life-os-basic-sw',
    apply: 'build',
    closeBundle() {
      const buildId =
        process.env.COMMIT_REF ||
        process.env.DEPLOY_ID ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        `dev-${Date.now().toString(36)}`
      const sw = renderBasicSw({
        cacheName: `${cachePrefix}-${buildId}`,
        precache,
        navigationFallback,
      })
      for (const outDir of [
        join(process.cwd(), '.svelte-kit/output/client'),
        join(process.cwd(), 'build'),
      ]) {
        if (!existsSync(outDir)) continue
        writeFileSync(join(outDir, 'sw.js'), sw)
      }
    },
  }
}
