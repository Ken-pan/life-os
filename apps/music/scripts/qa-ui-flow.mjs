/**
 * Music UI E2E — route smoke + library play + queue (M-P2).
 * Simulates post-import state via IndexedDB seed (full import optional via MUSIC_QA_IMPORT_FILE).
 *
 * Usage:
 *   npm run dev
 *   MUSIC_QA_URL=http://127.0.0.1:5189 npm run qa:ui-flow
 */
import { chromium } from 'playwright'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { waitForQaUrl } from '../../../scripts/qa-health.mjs'
import {
  injectLifeOsSession,
  loadMusicQaEnv,
  signInForMusicQa,
} from './ia-qa-auth.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const baseUrl = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5189'

await waitForQaUrl(baseUrl, { timeoutMs: 60_000 })

const ROUTES = [
  '/',
  '/library',
  '/browse',
  '/search',
  '/import',
  '/playlists',
  '/liked',
  '/settings',
]

/** Known cloud track in QA user's library (see qa-playback-seeded.mjs). */
const CLOUD_TRACK = {
  id: '39b39136a309402406aaebc7be1e7888925dea3c77a045f8174133db218e7996',
  title: 'Anti-Hero',
  artist: 'Taylor Swift',
  album: '未知专辑',
  duration: 200,
  mime: 'audio/mpeg',
  size: 8061293,
}

const LOCAL_TRACK = {
  id: 'qa-ui-flow-local-track-002',
  title: 'QA Local B',
  artist: 'Life OS QA',
  album: 'Smoke Suite',
  duration: 180,
  mime: 'audio/mpeg',
  size: 1024,
}

/** @type {{ step: string; ok: boolean; detail?: string }[]} */
const report = []

function log(step, ok, detail = '') {
  report.push({ step, ok, detail })
  const icon = ok ? 'PASS' : 'FAIL'
  console.log(`${icon} [${step}]${detail ? ` ${detail}` : ''}`)
}

let env
try {
  env = loadMusicQaEnv(root)
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}

let session
try {
  session = await signInForMusicQa(env)
} catch (e) {
  console.error('Auth failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
})
const page = await context.newPage()

try {
  await injectLifeOsSession(page, session, baseUrl)
  log('auth', true, session.user.email)

  for (const route of ROUTES) {
    try {
      const res = await page.goto(`${baseUrl}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      if (!res?.ok()) {
        log(`route:${route}`, false, `HTTP ${res?.status() ?? 'unknown'}`)
        continue
      }
      await page.waitForSelector('.app-shell', { timeout: 15000 })
      log(`route:${route}`, true)
    } catch (e) {
      log(`route:${route}`, false, e instanceof Error ? e.message : String(e))
    }
  }

  const userId = session.user.id
  const seeded = await page.evaluate(
    async ({ cloud, local, userId: uid }) => {
      const slug = (s) => (s || 'unknown').trim().toLowerCase() || 'unknown'
      const rows = [
        {
          ...cloud,
          albumKey: slug(`${cloud.artist}::${cloud.album}`),
          artistKey: slug(cloud.artist),
          addedAt: Date.now() - 1000,
          playCount: 0,
          liked: 0,
          storagePath: `${uid}/${cloud.id}.mp3`,
          words: `${cloud.title} ${cloud.artist} ${cloud.album}`
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean),
        },
        {
          ...local,
          albumKey: slug(`${local.artist}::${local.album}`),
          artistKey: slug(local.artist),
          addedAt: Date.now(),
          playCount: 0,
          liked: 0,
          words: `${local.title} ${local.artist} ${local.album}`
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean),
        },
      ]

      return new Promise((resolveSeed) => {
        const req = indexedDB.open('musicos_library')
        req.onupgradeneeded = () => {}
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('tracks', 'readwrite')
          const store = tx.objectStore('tracks')
          for (const row of rows) store.put(row)
          tx.oncomplete = () => resolveSeed({ ok: true, count: rows.length })
          tx.onerror = () =>
            resolveSeed({ ok: false, err: String(tx.error ?? 'tx failed') })
        }
        req.onerror = () => resolveSeed({ ok: false, err: 'idb open failed' })
      })
    },
    { cloud: CLOUD_TRACK, local: LOCAL_TRACK, userId },
  )

  if (!seeded.ok) {
    log('seed-idb', false, seeded.err)
  } else {
    log('seed-idb', true, `${seeded.count} tracks`)
  }

  await page.goto(`${baseUrl}/library`, { waitUntil: 'networkidle' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/library`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.track-row', { timeout: 15000 })
  const rowCount = await page.locator('.track-row').count()
  log('library-rows', rowCount >= 2, `visible rows=${rowCount}`)

  const queued = await page.evaluate(async () => {
    const { getAllTracks } = await import('/src/lib/db.js')
    const { playTracks } = await import('/src/lib/player.svelte.js')
    const tracks = await getAllTracks()
    if (tracks.length < 2) return { ok: false, count: tracks.length }
    playTracks(tracks, 0, 'qa-ui-flow')
    return { ok: true, count: tracks.length, first: tracks[0]?.title }
  })
  log(
    'play-library',
    queued.ok,
    queued.ok ? `playTracks(${queued.count}) from ${queued.first}` : `tracks=${queued.count}`,
  )
  await page.waitForTimeout(2000)

  const queueBtn = page
    .locator('.mini-player')
    .getByRole('button', { name: '播放队列' })
  if (await queueBtn.count()) {
    await queueBtn.click()
    await page.waitForURL('**/now-playing**', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(800)
  }

  const queueState = await page.evaluate(async () => {
    const { player } = await import('/src/lib/player.svelte.js')
    return {
      length: player.queue.length,
      index: player.index,
      titles: player.queue.map((t) => t.title),
      playing: player.playing,
    }
  })
  log(
    'queue-ui',
    queueState.length >= 2,
    `queue=${queueState.length} idx=${queueState.index} titles=${queueState.titles.join(' | ')}`,
  )

  const mini = await page.locator('.mini-player').innerText().catch(() => '')
  const miniOk = /Anti-Hero|Taylor|QA Local/i.test(mini)
  log('mini-player', miniOk, mini.slice(0, 80))

  await page.goto(`${baseUrl}/import`, { waitUntil: 'networkidle' })
  const importHeading = await page.locator('h1').first().textContent()
  log(
    'import-page',
    Boolean(importHeading?.trim()),
    importHeading?.trim() ?? 'missing h1',
  )
} catch (e) {
  console.error('Setup failed:', e instanceof Error ? e.message : e)
  await browser.close()
  process.exit(1)
}

await browser.close()

const fails = report.filter((r) => !r.ok)
console.log(`\n--- Summary ---\nTotal: ${report.length}, Failed: ${fails.length}`)
if (fails.length) {
  for (const f of fails) console.error(`  ${f.step}: ${f.detail ?? ''}`)
  process.exit(1)
}
console.log('Music UI flow OK')
