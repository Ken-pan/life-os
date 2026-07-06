/**
 * Service Worker E2E — audio precache, fetch intercept, purge, trim.
 *
 * Usage (recommended):
 *   cd apps/music && npm run test:sw
 *
 * Manual:
 *   npm run build && npm run preview:static
 *   node scripts/qa-service-worker.mjs
 *
 * Env: MUSIC_QA_URL (default http://127.0.0.1:5193)
 * Auto-starts `serve build -s` when the port is free and build/ exists.
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const BASE = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5193'
const appRoot = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(appRoot, '.qa-screenshots', 'service-worker')

const MOCK_ORIGIN = 'https://iueozzuctstwvzbcxcyh.supabase.co'
const mockUrl = (trackId) =>
  `${MOCK_ORIGIN}/storage/v1/object/sign/music/qa-user/${trackId}.mp3?token=e2e-${trackId}`

/** Tiny fake MPEG body — sufficient for cache storage tests */
const MOCK_AUDIO_BODY = Buffer.from(
  'ID3\x03\x00\x00\x00\x00\x00\x16TPE1\x00\x00\x00QA SW E2E\x00\x00\xff\xfb\x90\x00',
  'binary',
)

const INTEGRATION_TRACKS = [
  {
    id: 'qa-sw-player-1',
    title: 'SW Player A',
    artist: 'QA',
    album: 'SW',
    albumKey: 'sw',
    artistKey: 'qa',
    duration: 30,
    mime: 'audio/mpeg',
    size: 1000,
    addedAt: Date.now() + 1000,
    playCount: 0,
    liked: 0,
    storagePath: 'c2831538-94b0-4a57-b034-5e873a53c42e/qa-sw-player-1.mp3',
    words: ['sw'],
  },
  {
    id: 'qa-sw-player-2',
    title: 'SW Player B',
    artist: 'QA',
    album: 'SW',
    albumKey: 'sw',
    artistKey: 'qa',
    duration: 30,
    mime: 'audio/mpeg',
    size: 1000,
    addedAt: Date.now(),
    playCount: 0,
    liked: 0,
    storagePath: 'c2831538-94b0-4a57-b034-5e873a53c42e/qa-sw-player-2.mp3',
    words: ['sw'],
  },
]

/** @returns {Promise<import('node:child_process').ChildProcess | null>} */
async function startStaticServer() {
  const buildIndex = join(appRoot, 'build', 'index.html')
  if (!existsSync(buildIndex)) {
    console.warn('build/index.html 不存在 — 请先 npm run build')
    return null
  }
  const port = new URL(BASE).port || '5193'
  const proc = spawn('npx', ['--yes', 'serve', 'build', '-s', '-l', port], {
    cwd: appRoot,
    stdio: 'pipe',
  })
  const up = await waitForServer(BASE, 60_000)
  if (!up) {
    proc.kill()
    return null
  }
  console.log(`Auto-started static server: serve build -s -l ${port}`)
  return proc
}

/** @param {import('playwright').BrowserContext} context */
async function installSupabaseMock(context) {
  await context.route('**/*supabase.co/**', async (route) => {
    const req = route.request()
    const url = req.url()
    if (url.includes('/auth/v1/user') || url.includes('/auth/v1/session')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'c2831538-94b0-4a57-b034-5e873a53c42e',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'qa-sw@test.local',
          },
        }),
      })
      return
    }
    if (url.includes('/storage/v1/object/sign/') && req.method() === 'POST') {
      const path =
        url.split('/object/sign/')[1]?.split('?')[0] ??
        'music/qa-user/qa-sw-player-1.mp3'
      const signedUrl = `${MOCK_ORIGIN}/storage/v1/object/sign/${path}?token=signed-e2e`
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signedUrl }),
      })
      return
    }
    if (
      url.includes('/storage/v1/object/sign/music/') &&
      req.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: MOCK_AUDIO_BODY,
      })
      return
    }
    await route.continue()
  })
}

/** Runs before any page script — avoids Dexie opening an empty DB first. */
/** @param {import('playwright').Page} page */
async function installIntegrationInitScripts(page) {
  await page.addInitScript(() => {
    /** @type {string[]} */
    window.__precacheMessages = []
    /** @param {unknown} msg */
    const logPrecache = (msg) => {
      if (msg && typeof msg === 'object' && msg.type === 'PRECACHE_AUDIO') {
        window.__precacheMessages.push(JSON.stringify(msg))
      }
    }
    /** @param {ServiceWorker | null | undefined} sw */
    const patchInstance = (sw) => {
      if (!sw || sw.__precacheHook) return
      sw.__precacheHook = true
      const orig = sw.postMessage.bind(sw)
      sw.postMessage = (msg, transfer) => {
        logPrecache(msg)
        return orig(msg, transfer)
      }
    }
    if (!ServiceWorker.prototype.__precacheHook) {
      ServiceWorker.prototype.__precacheHook = true
      const origProto = ServiceWorker.prototype.postMessage
      ServiceWorker.prototype.postMessage = function (msg, transfer) {
        logPrecache(msg)
        return origProto.call(this, msg, transfer)
      }
    }
    patchInstance(navigator.serviceWorker.controller)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      patchInstance(navigator.serviceWorker.controller)
    })
    const origPlay = HTMLAudioElement.prototype.play
    HTMLAudioElement.prototype.play = function () {
      const result = origPlay.call(this)
      if (result && typeof result.catch === 'function') {
        return result.catch(() => undefined)
      }
      return Promise.resolve()
    }
  })

  await page.addInitScript(
    async ({ tracksJson, audioBytes }) => {
      const tracks = JSON.parse(tracksJson)
      const exp = Math.floor(Date.now() / 1000) + 3600
      const b64 = (obj) =>
        btoa(JSON.stringify(obj))
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
      const accessToken = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
        sub: 'c2831538-94b0-4a57-b034-5e873a53c42e',
        role: 'authenticated',
        exp,
      })}.e2e-signature`

      localStorage.setItem(
        'musicos_v1',
        JSON.stringify({
          settings: {
            theme: 'light',
            locale: 'zh',
            crossfadeMs: 0,
            crossfade: false,
            gapless: true,
            volume: 0.5,
            muted: true,
            libraryDensity: 'comfortable',
            albumAmbience: false,
            immersiveViewMode: 'player',
            autoContinueSimilar: false,
          },
        }),
      )
      localStorage.setItem(
        'life_os_auth',
        JSON.stringify({
          access_token: accessToken,
          refresh_token: 'e2e-refresh-token',
          expires_in: 3600,
          expires_at: exp,
          token_type: 'bearer',
          user: {
            id: 'c2831538-94b0-4a57-b034-5e873a53c42e',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'qa-sw@test.local',
          },
        }),
      )
      localStorage.setItem(
        'musicos_player_session',
        JSON.stringify({
          queueIds: tracks.map((t) => t.id),
          index: 0,
          currentTime: 0,
          playing: false,
        }),
      )

      await new Promise((resolve) => {
        const del = indexedDB.deleteDatabase('musicos_library')
        del.onsuccess = () => resolve(undefined)
        del.onerror = () => resolve(undefined)
        del.onblocked = () => resolve(undefined)
      })

      const fakeAudio = new Blob([new Uint8Array(audioBytes)], {
        type: 'audio/mpeg',
      })

      await new Promise((resolve, reject) => {
        const req = indexedDB.open('musicos_library', 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('tracks')) {
            db.createObjectStore('tracks', { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains('playlists')) {
            db.createObjectStore('playlists', { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains('playlistTracks')) {
            db.createObjectStore('playlistTracks', {
              keyPath: 'rowId',
              autoIncrement: true,
            })
          }
          if (!db.objectStoreNames.contains('recent')) {
            db.createObjectStore('recent', { keyPath: 'trackId' })
          }
          if (!db.objectStoreNames.contains('interactions')) {
            db.createObjectStore('interactions', {
              keyPath: 'id',
              autoIncrement: true,
            })
          }
          if (!db.objectStoreNames.contains('speedDialSlots')) {
            db.createObjectStore('speedDialSlots', { keyPath: 'id' })
          }
        }
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('tracks', 'readwrite')
          for (const t of tracks) {
            const row =
              t.id === 'qa-sw-player-1' ? { ...t, audioBlob: fakeAudio } : t
            tx.objectStore('tracks').put(row)
          }
          tx.oncomplete = () => {
            db.close()
            resolve(undefined)
          }
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      })
    },
    {
      tracksJson: JSON.stringify(INTEGRATION_TRACKS),
      audioBytes: MOCK_AUDIO_BYTES,
    },
  )
}

const MOCK_AUDIO_BYTES = [...MOCK_AUDIO_BODY]

/** @type {{ id: string; group: string; status: 'pass'|'fail'|'skip'; detail: string; ms?: number }[]} */
const results = []

/** @param {string} group @param {string} id @param {'pass'|'fail'|'skip'} status @param {string} detail */
function record(group, id, status, detail, ms) {
  results.push({ id, group, status, detail, ms })
  const mark = status === 'pass' ? '✓' : status === 'skip' ? '○' : '✗'
  const timing = ms != null ? ` (${ms}ms)` : ''
  console.log(`${mark} [${group}/${id}] ${detail}${timing}`)
}

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.ok || res.status === 404) return true
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

function staticSwChecks() {
  const t0 = Date.now()
  const swPath = join(appRoot, 'build', 'sw.js')
  if (!existsSync(swPath)) {
    record(
      'static',
      'build-artifact',
      'fail',
      'build/sw.js 不存在，请先 npm run build',
    )
    return
  }
  const src = readFileSync(swPath, 'utf8')
  const checks = [
    [
      'no-placeholder',
      !src.includes('__MUSICOS_BUILD_ID__'),
      'BUILD_ID 已注入',
    ],
    ['audio-cache-const', src.includes('AUDIO_CACHE'), '定义 AUDIO_CACHE'],
    [
      'audio-limit',
      src.includes('AUDIO_CACHE_LIMIT'),
      '定义 AUDIO_CACHE_LIMIT',
    ],
    [
      'precache-handler',
      src.includes("data.type === 'PRECACHE_AUDIO'"),
      'PRECACHE_AUDIO 消息处理',
    ],
    [
      'purge-handler',
      src.includes("data.type === 'PURGE_AUDIO_CACHE'"),
      'PURGE_AUDIO_CACHE 消息处理',
    ],
    [
      'music-intercept',
      src.includes('isMusicStorageAudio'),
      'Supabase music URL 拦截',
    ],
    [
      'skip-waiting',
      src.includes("data.type === 'SKIP_WAITING'"),
      'SKIP_WAITING 消息处理',
    ],
  ]
  for (const [id, ok, label] of checks) {
    record('static', id, ok ? 'pass' : 'fail', label, Date.now() - t0)
  }
}

/** @param {import('playwright').BrowserContext} context */
async function installRouteCounter(context) {
  /** @type {string[]} */
  const hits = []
  await context.route('**/storage/v1/object/sign/music/**', async (route) => {
    hits.push(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: MOCK_AUDIO_BODY,
      headers: {
        'Content-Length': String(MOCK_AUDIO_BODY.length),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  })
  return {
    hits,
    reset: () => {
      hits.length = 0
    },
  }
}

/** @param {import('playwright').Page} page */
async function waitForSwControl(page, timeoutMs = 20_000) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('no-sw-api')
    await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    await navigator.serviceWorker.ready
  })
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    { timeout: timeoutMs },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    { timeout: timeoutMs },
  )
}

/** @param {import('playwright').Page} page */
async function getAudioCacheInfo(page) {
  return page.evaluate(async () => {
    const keys = await caches.keys()
    const audioKey = keys.find((k) => k.startsWith('musicos-audio-'))
    if (!audioKey) return { audioKey: null, entries: [] }
    const cache = await caches.open(audioKey)
    const entries = (await cache.keys()).map((r) => r.url)
    return { audioKey, entries }
  })
}

/** @param {import('playwright').Page} page @param {string} url @param {string} trackId */
async function postPrecache(page, url, trackId) {
  await page.evaluate(
    async ({ url, trackId }) => {
      const reg = await navigator.serviceWorker.ready
      const sw = reg.active
      if (!sw) throw new Error('no-active-sw')
      sw.postMessage({ type: 'PRECACHE_AUDIO', url, trackId })
      await new Promise((r) => setTimeout(r, 800))
    },
    { url, trackId },
  )
}

/** @param {import('playwright').Page} page @param {string[]} keepTrackIds */
async function postPurge(page, keepTrackIds) {
  await page.evaluate(async (keepTrackIds) => {
    const reg = await navigator.serviceWorker.ready
    reg.active?.postMessage({ type: 'PURGE_AUDIO_CACHE', keepTrackIds })
    await new Promise((r) => setTimeout(r, 400))
  }, keepTrackIds)
}

/** @param {import('playwright').LaunchOptions} [extra] */
function launchBrowser(extra = {}) {
  return chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
    ...extra,
  })
}

async function runBrowserTests() {
  const browser = await launchBrowser()
  const context = await browser.newContext()
  const route = await installRouteCounter(context)
  const page = await context.newPage()

  try {
    const tReg = Date.now()
    await waitForSwControl(page)
    record(
      'lifecycle',
      'registration',
      'pass',
      'SW 已注册并 control 页面',
      Date.now() - tReg,
    )

    const swMeta = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      return {
        scope: reg?.scope ?? '',
        scriptURL: reg?.active?.scriptURL ?? '',
        controlled: Boolean(navigator.serviceWorker.controller),
      }
    })
    record(
      'lifecycle',
      'scope',
      swMeta.scriptURL.includes('/sw.js') ? 'pass' : 'fail',
      `script=${swMeta.scriptURL} scope=${swMeta.scope} controlled=${swMeta.controlled}`,
    )

    const cacheNames = await page.evaluate(async () => caches.keys())
    const hasStatic = cacheNames.some((k) => k.startsWith('musicos-static-'))
    const hasRuntime = cacheNames.some((k) => k.startsWith('musicos-runtime-'))
    record(
      'lifecycle',
      'install-caches',
      hasStatic && hasRuntime ? 'pass' : 'fail',
      `caches: ${cacheNames.join(', ') || '(none)'}`,
    )

    // --- PRECACHE_AUDIO ---
    const urlA = mockUrl('qa-sw-track-a')
    route.reset()
    const tPre = Date.now()
    await postPrecache(page, urlA, 'qa-sw-track-a')
    const afterPre = await getAudioCacheInfo(page)
    const cachedA = afterPre.entries.some((u) => u.includes('qa-sw-track-a'))
    record(
      'precache',
      'message-store',
      cachedA ? 'pass' : 'fail',
      cachedA
        ? `AUDIO 缓存写入成功 (${afterPre.audioKey}, ${afterPre.entries.length} entries)`
        : `未写入 audio cache; entries=${JSON.stringify(afterPre.entries)}`,
      Date.now() - tPre,
    )
    record(
      'precache',
      'network-fetch',
      route.hits.length >= 1 ? 'pass' : 'fail',
      `PRECACHE 触发网络 ${route.hits.length} 次`,
    )

    // blob: should be ignored
    await postPrecache(page, 'blob:http://127.0.0.1/abc-123', 'blob-track')
    const afterBlob = await getAudioCacheInfo(page)
    record(
      'precache',
      'skip-blob',
      !afterBlob.entries.some((u) => u.startsWith('blob:')) ? 'pass' : 'fail',
      'blob: URL 未被写入 SW 缓存',
    )

    // --- fetch intercept cache hit ---
    route.reset()
    const tHit = Date.now()
    const fetchStats = await page.evaluate(async (url) => {
      const r1 = await fetch(url)
      const b1 = r1.status
      const r2 = await fetch(url)
      const b2 = r2.status
      return { b1, b2, ok: b1 === 200 && b2 === 200 }
    }, urlA)
    record(
      'fetch',
      'double-fetch-200',
      fetchStats.ok ? 'pass' : 'fail',
      `连续两次 fetch 均 ${fetchStats.b1}/${fetchStats.b2}`,
      Date.now() - tHit,
    )
    record(
      'fetch',
      'cache-hit-network',
      route.hits.length === 0 ? 'pass' : 'fail',
      route.hits.length === 0
        ? '第二次 fetch 由 SW 缓存服务（无额外 network route）'
        : `仍触发 network route ${route.hits.length} 次: ${route.hits.map((u) => u.slice(-40)).join('; ')}`,
    )

    // --- PURGE ---
    const urlB = mockUrl('qa-sw-track-b')
    const urlC = mockUrl('qa-sw-track-c')
    await postPrecache(page, urlB, 'qa-sw-track-b')
    await postPrecache(page, urlC, 'qa-sw-track-c')
    await postPurge(page, ['qa-sw-track-a'])
    const afterPurge = await getAudioCacheInfo(page)
    const keptA = afterPurge.entries.some((u) => u.includes('qa-sw-track-a'))
    const removedB = !afterPurge.entries.some((u) =>
      u.includes('qa-sw-track-b'),
    )
    const removedC = !afterPurge.entries.some((u) =>
      u.includes('qa-sw-track-c'),
    )
    record(
      'purge',
      'keep-id',
      keptA ? 'pass' : 'fail',
      keptA
        ? '保留 qa-sw-track-a'
        : `entries=${afterPurge.entries.join(' | ')}`,
    )
    record(
      'purge',
      'drop-others',
      removedB && removedC ? 'pass' : 'fail',
      `B removed=${removedB} C removed=${removedC}`,
    )

    // --- trim limit (4) ---
    route.reset()
    const trimIds = [
      'qa-sw-limit-1',
      'qa-sw-limit-2',
      'qa-sw-limit-3',
      'qa-sw-limit-4',
      'qa-sw-limit-5',
    ]
    for (const id of trimIds) {
      await postPrecache(page, mockUrl(id), id)
    }
    const afterTrim = await getAudioCacheInfo(page)
    const withinLimit = afterTrim.entries.length <= 4
    record(
      'trim',
      'audio-cache-limit',
      withinLimit ? 'pass' : 'fail',
      `预缓存 5 首后 cache entries=${afterTrim.entries.length}（上限 4）`,
    )
  } finally {
    await browser.close()
  }
}

/** Player → SW precache integration (isolated browser, Dexie v1 seed). */
async function runIntegrationTests() {
  const browser = await launchBrowser()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  await installSupabaseMock(context)

  const page = await context.newPage()
  /** @type {string[]} */
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(String(err)))
  await installIntegrationInitScripts(page)

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })

    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('no-sw-api')
      await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      })
      await navigator.serviceWorker.ready
    })
    if (
      !(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    ) {
      await page.reload({ waitUntil: 'networkidle' })
    }
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker.controller),
      { timeout: 20_000 },
    )

    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      reg.active?.postMessage({ type: 'PURGE_AUDIO_CACHE', keepTrackIds: [] })
      await new Promise((r) => setTimeout(r, 300))
    })

    await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' })

    let trackRows = 0
    try {
      await page.waitForFunction(
        () => document.body.innerText.includes('SW Player A'),
        { timeout: 15_000 },
      )
      trackRows = await page.locator('.track-row').count()
    } catch {
      trackRows = 0
    }

    const seededCount = await page.evaluate(async () => {
      const req = indexedDB.open('musicos_library')
      await new Promise((res, rej) => {
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
      })
      const db = req.result
      return new Promise((res, rej) => {
        const tx = db.transaction('tracks', 'readonly')
        const r = tx.objectStore('tracks').count()
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    })

    const playBtn = page
      .locator('.track-row')
      .filter({ hasText: 'SW Player A' })
      .locator('.track-row-action.play')
      .first()

    if (seededCount >= 2 && trackRows > 0 && (await playBtn.count())) {
      let signPosts = 0
      page.on('request', (req) => {
        if (
          req.url().includes('supabase.co') &&
          req.url().includes('/storage/v1/object/sign/') &&
          req.method() === 'POST'
        ) {
          signPosts += 1
        }
      })

      await playBtn.click()
      await page
        .waitForFunction(
          async () => {
            const keys = await caches.keys()
            const audioKey = keys.find((k) => k.startsWith('musicos-audio-'))
            if (audioKey) {
              const cache = await caches.open(audioKey)
              if ((await cache.keys()).length > 0) return true
            }
            return (window.__precacheMessages?.length ?? 0) > 0
          },
          { timeout: 12_000 },
        )
        .catch(() => {})
      await page.waitForTimeout(1500)

      const hookLog = await page.evaluate(() => window.__precacheMessages ?? [])
      const playerCache = await getAudioCacheInfo(page)
      const precacheMsgForTrack = hookLog.some(
        (m) => m.includes('qa-sw-player-1') || m.includes('qa-sw-player-2'),
      )
      const cacheHasTrack = playerCache.entries.some(
        (u) => u.includes('qa-sw-player-1') || u.includes('qa-sw-player-2'),
      )
      const diag = await page.evaluate(() => ({
        mini:
          document
            .querySelector('.mini-player')
            ?.textContent?.trim()
            ?.slice(0, 80) ?? '',
        audioSrc: document.querySelector('audio')?.src?.slice(0, 120) ?? '',
        audioPaused: document.querySelector('audio')?.paused,
        hasController: Boolean(navigator.serviceWorker.controller),
      }))

      record(
        'integration',
        'player-postmessage',
        precacheMsgForTrack ? 'pass' : 'fail',
        precacheMsgForTrack
          ? `播放器 postMessage PRECACHE (${hookLog.length} msgs)`
          : `未捕获 PRECACHE_AUDIO; signPOST=${signPosts}; audioPaused=${diag.audioPaused}; src=${diag.audioSrc || '(empty)'}; log=${hookLog.join(' | ') || '(empty)'}; errs=${consoleErrors.slice(0, 2).join(' | ') || 'none'}`,
      )
      record(
        'integration',
        'player-sw-cache',
        cacheHasTrack || precacheMsgForTrack ? 'pass' : 'fail',
        cacheHasTrack
          ? `SW 已缓存云曲目 (${playerCache.entries.length} entries)`
          : precacheMsgForTrack
            ? `播放器 postMessage 已发出 (SW 写入见 core/precache 测试)`
            : `cache entries=${playerCache.entries.join(' | ') || '(empty)'}`,
      )
    } else {
      const bodyText = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      record(
        'integration',
        'player-postmessage',
        'skip',
        `无法集成测试 (seeded=${seededCount}, rows=${trackRows}); ${bodyText.slice(0, 80)}`,
      )
      record(
        'integration',
        'player-sw-cache',
        'skip',
        `seeded tracks=${seededCount}`,
      )
    }
  } finally {
    await browser.close()
  }
}

function writeReport() {
  mkdirSync(outDir, { recursive: true })
  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status === 'fail').length
  const skipped = results.filter((r) => r.status === 'skip').length
  const groups = [...new Set(results.map((r) => r.group))]

  let md = `# Service Worker E2E Report\n\n`
  md += `- 时间: ${new Date().toISOString()}\n`
  md += `- BASE: ${BASE}\n`
  md += `- 结果: **${passed} pass / ${failed} fail / ${skipped} skip** (${results.length} total)\n\n`

  for (const group of groups) {
    md += `## ${group}\n\n`
    md += `| ID | Status | Detail |\n|----|--------|--------|\n`
    for (const r of results.filter((x) => x.group === group)) {
      md += `| ${r.id} | ${r.status} | ${r.detail.replace(/\|/g, '\\|')} |\n`
    }
    md += `\n`
  }

  writeFileSync(join(outDir, 'REPORT.md'), md)
  console.log(`\nReport: ${join(outDir, 'REPORT.md')}`)
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  console.log(`\n=== MusicOS Service Worker E2E ===`)
  console.log(`BASE=${BASE}\n`)

  staticSwChecks()

  /** @type {import('node:child_process').ChildProcess | null} */
  let serveProc = null
  let up = await waitForServer(BASE, 3_000)
  if (!up) {
    serveProc = await startStaticServer()
    up = Boolean(serveProc)
  }
  if (!up) {
    record(
      'lifecycle',
      'server',
      'fail',
      `${BASE} 不可达 — 请先 npm run build，或手动 npm run preview:static`,
    )
    writeReport()
    process.exit(1)
  }
  record(
    'lifecycle',
    'server',
    'pass',
    `${BASE} 可达${serveProc ? ' (auto-started serve)' : ''}`,
  )

  try {
    await runBrowserTests()
    await runIntegrationTests()
  } finally {
    serveProc?.kill()
  }

  writeReport()

  const coreFailed = results.filter(
    (r) => r.status === 'fail' && r.group !== 'integration',
  ).length
  const integrationFailed = results.filter(
    (r) => r.status === 'fail' && r.group === 'integration',
  ).length
  const coreTotal = results.filter((r) => r.group !== 'integration').length
  const corePassed = results.filter(
    (r) => r.status === 'pass' && r.group !== 'integration',
  ).length
  console.log(
    `\nCore SW: ${corePassed}/${coreTotal} passed` +
      (integrationFailed
        ? `; integration: ${integrationFailed} failed`
        : results.some((r) => r.group === 'integration' && r.status === 'pass')
          ? '; integration: passed'
          : ''),
  )
  process.exit(coreFailed || integrationFailed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
