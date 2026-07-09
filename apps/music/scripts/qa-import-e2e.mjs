/**
 * M-1: Full import pipeline E2E — local file → upload → tags → sync.
 *
 * Usage:
 *   npm run dev
 *   MUSIC_QA_URL=http://127.0.0.1:5189 npm run qa:import
 *
 * Optional:
 *   MUSIC_QA_IMPORT_FILE=/path/to/track.mp3
 *   SUPABASE_SERVICE_ROLE_KEY=…  (cloud row verification; skips if unset)
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { waitForQaUrl } from '../../../scripts/qa-health.mjs'
import {
  LIFE_OS_SUPABASE_PUBLISHABLE_KEY,
  LIFE_OS_SUPABASE_URL,
} from '../../../packages/sync/src/supabaseClient.js'
import {
  injectLifeOsSession,
  loadMusicQaEnv,
  signInForMusicQa,
} from './ia-qa-auth.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const baseUrl = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5189'
const defaultFixture = resolve(__dirname, 'fixtures/qa-import-fixture.mp3')

const importFile =
  process.env.MUSIC_QA_IMPORT_FILE ??
  (existsSync(defaultFixture) ? defaultFixture : '')

if (!importFile || !existsSync(importFile)) {
  console.error(
    'M-1 import E2E: missing file — set MUSIC_QA_IMPORT_FILE or add scripts/fixtures/qa-import-fixture.mp3',
  )
  process.exit(1)
}

/** @type {{ step: string; status: 'pass'|'fail'|'warn'|'skip'; detail: string }[]} */
const report = []
const log = (step, status, detail) => {
  report.push({ step, status, detail })
  const icon =
    status === 'pass' ? '✓' : status === 'warn' ? '!' : status === 'skip' ? '–' : '✗'
  console.log(`${icon} [${step}] ${detail}`)
}

function trackIdFromFile(path) {
  const buf = readFileSync(path)
  return createHash('sha256').update(buf).digest('hex')
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** @param {import('@supabase/supabase-js').SupabaseClient} db @param {string} userId @param {string} trackId */
async function fetchCloudTrack(db, userId, trackId) {
  const { data: meta } = await db
    .from('music_track_meta')
    .select('*')
    .eq('user_id', userId)
    .eq('track_id', trackId)
    .maybeSingle()
  const { data: enrich } = await db
    .from('track_enrichment')
    .select('*')
    .eq('user_id', userId)
    .eq('track_id', trackId)
    .maybeSingle()
  const { data: tags } = await db
    .from('track_tags')
    .select('tag_slug, confidence, source')
    .eq('user_id', userId)
    .eq('track_id', trackId)
  return { meta, enrich, tags: tags ?? [] }
}

await waitForQaUrl(baseUrl, { timeoutMs: 60_000 })

const env = loadMusicQaEnv(root)
const session = await signInForMusicQa(env)
const userId = session.user.id

const trackId = trackIdFromFile(importFile)
log('0-setup', 'pass', `import file=${importFile} track_id=${trackId.slice(0, 12)}…`)

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
let adminDb = null
if (serviceKey) {
  adminDb = createClient(LIFE_OS_SUPABASE_URL, serviceKey, {
    db: { schema: 'music' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const before = await fetchCloudTrack(adminDb, userId, trackId)
  log(
    '0-cloud-before',
    'pass',
    `meta=${Boolean(before.meta)} storage=${before.meta?.storage_path || '(empty)'} tags=${before.tags.length}`,
  )
} else {
  log('0-cloud-before', 'skip', 'SUPABASE_SERVICE_ROLE_KEY unset — skip cloud assertions')
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

const consoleErrors = []
const progressLog = []
page.on('console', (msg) => {
  const text = msg.text()
  if (
    msg.type() === 'error' &&
    !text.includes('Multiple GoTrueClient instances detected')
  ) {
    consoleErrors.push(text)
  }
})

await injectLifeOsSession(page, session, baseUrl)
await wait(1500)

await page.goto(`${baseUrl}/import`, { waitUntil: 'domcontentloaded' })
const hint = await page.locator('.page-sub').innerText().catch(() => '')
if (hint.includes('Supabase') || hint.includes('上传')) {
  log('1-import-ui', 'pass', `Logged-in hint: ${hint.slice(0, 60)}…`)
} else {
  log('1-import-ui', 'warn', `Hint may be offline-only: ${hint.slice(0, 80)}`)
}

await page.locator('input[type="file"]').setInputFiles(importFile)

const progressEl = page.locator('.wrap p').last()
const deadline = Date.now() + 120_000
let lastProgress = ''
while (Date.now() < deadline) {
  const txt = (await progressEl.innerText().catch(() => '')).trim()
  if (txt && txt !== lastProgress) {
    progressLog.push(txt)
    lastProgress = txt
    process.stdout.write(`  … ${txt}\n`)
  }
  if (page.url().includes('/library')) break
  await wait(500)
}

const landedLibrary = page.url().includes('/library')
log(
  '2-import-flow',
  landedLibrary ? 'pass' : 'fail',
  landedLibrary
    ? `library redirect (${progressLog.length} progress updates)`
    : `stuck on ${page.url()} last="${lastProgress}"`,
)

const localState = await page.evaluate(async (id) => {
  const open = indexedDB.open('musicos_library')
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const tr = await new Promise((res, rej) => {
    const tx = db.transaction('tracks', 'readonly')
    const req = tx.objectStore('tracks').get(id)
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  db.close()
  return tr
    ? {
        title: tr.title,
        storagePath: tr.storagePath || '',
        hasBlob: Boolean(tr.audioBlob || tr.size),
      }
    : null
}, trackId)

if (localState?.storagePath || localState?.hasBlob) {
  log(
    '3-local-idb',
    'pass',
    `storagePath=${localState.storagePath || '(blob only)'} title=${localState.title || '?'}`,
  )
} else {
  log('3-local-idb', 'fail', localState ? 'no storagePath/blob' : 'track missing in IDB')
}

if (adminDb) {
  await wait(5000)
  const after = await fetchCloudTrack(adminDb, userId, trackId)
  const uploaded = Boolean(after.meta?.storage_path)
  log(
    '4-cloud-upload',
    uploaded ? 'pass' : 'warn',
    uploaded ? `storage_path=${after.meta.storage_path}` : 'storage_path empty (upload may lag)',
  )
  log(
    '5-cloud-tags',
    after.tags.length > 0 ? 'pass' : 'warn',
    `${after.tags.length} tags status=${after.enrich?.tagging_status ?? 'none'}`,
  )
} else {
  log('4-cloud-upload', 'skip', 'no service role key')
  log('5-cloud-tags', 'skip', 'no service role key')
}

if (consoleErrors.length) {
  log('6-console', 'warn', `${consoleErrors.length} console errors`)
} else {
  log('6-console', 'pass', 'No blocking console errors')
}

await browser.close()

const fails = report.filter((r) => r.status === 'fail')
console.log(
  `\nM-1 import E2E: pass=${report.filter((r) => r.status === 'pass').length} warn=${report.filter((r) => r.status === 'warn').length} fail=${fails.length}`,
)
process.exit(fails.length ? 1 : 0)
