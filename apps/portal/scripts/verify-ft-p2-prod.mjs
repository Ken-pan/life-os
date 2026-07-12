/**
 * GYMS.PORTAL.2 production verification — Ken account · portal_today_summary · Fitness card UI
 *
 * Usage:
 *   npm run preview -- --host 127.0.0.1 --port 5195
 *   node apps/portal/scripts/verify-ft-p2-prod.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.PORTAL_QA_URL ?? 'http://127.0.0.1:5195'
const KEN_EMAIL = '334452284ken@gmail.com'
const LIFE_OS_AUTH_STORAGE_KEY = 'life_os_auth'
const OUT_DIR = resolve(
  fileURLToPath(
    new URL('../../../output/playwright/ft-p2-prod-verify', import.meta.url),
  ),
)

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))
const keyRes = spawnSync(
  'supabase',
  [
    'projects',
    'api-keys',
    '--project-ref',
    'iueozzuctstwvzbcxcyh',
    '-o',
    'json',
  ],
  { cwd: appRoot, encoding: 'utf8' },
)
if (keyRes.status !== 0) throw new Error(keyRes.stderr || 'api-keys failed')
const serviceKey = JSON.parse(keyRes.stdout).find(
  (x) => x.name === 'service_role',
)?.api_key
if (!serviceKey) throw new Error('service_role key missing')

const url = 'https://iueozzuctstwvzbcxcyh.supabase.co'
const publishable = JSON.parse(keyRes.stdout).find(
  (x) => x.type === 'publishable',
)?.api_key
if (!publishable) throw new Error('publishable key missing')

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const anon = createClient(url, publishable, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: KEN_EMAIL,
})
if (linkErr || !link?.properties?.hashed_token)
  throw linkErr ?? new Error('generateLink failed')

const { data: auth, error: authErr } = await anon.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: 'email',
})
if (authErr || !auth.session) throw authErr ?? new Error('verifyOtp failed')

const { data: summary, error: rpcErr } = await anon.rpc('portal_today_summary')
if (rpcErr) throw rpcErr

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(
  resolve(OUT_DIR, 'rpc-ken.json'),
  JSON.stringify(summary, null, 2),
  'utf8',
)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ key, session }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        }),
      )
    },
    { key: LIFE_OS_AUTH_STORAGE_KEY, session: auth.session },
  )
  await page.reload({ waitUntil: 'networkidle' })

  const fitnessCard = page.locator('.portal-summary-card', {
    hasText: '今日训练',
  })
  await fitnessCard.waitFor({ state: 'visible', timeout: 20000 })

  const value = (
    await fitnessCard.locator('.portal-summary-value').innerText()
  ).trim()
  const detail = (
    await fitnessCard.locator('.portal-summary-detail').innerText()
  ).trim()

  await page.screenshot({
    path: resolve(OUT_DIR, 'portal-fitness-summary-ken.png'),
    fullPage: true,
  })
  await fitnessCard.screenshot({
    path: resolve(OUT_DIR, 'portal-fitness-card-ken.png'),
  })

  const report = {
    capturedAt: new Date().toISOString(),
    account: KEN_EMAIL,
    baseUrl: BASE,
    rpcFitness: summary?.fitness ?? null,
    ui: { value, detail },
  }
  writeFileSync(
    resolve(OUT_DIR, 'report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  )

  console.log('RPC fitness:', JSON.stringify(summary?.fitness))
  console.log('UI value:', value)
  console.log('UI detail:', detail)
  console.log('Screenshots:', OUT_DIR)

  if (
    !value.includes('今日尚未训练') &&
    !value.includes('今日已练') &&
    !value.includes('今日训练中')
  ) {
    throw new Error(`unexpected fitness value: ${value}`)
  }
  if (
    summary?.fitness?.workedOutToday === false &&
    !detail.includes('上次：')
  ) {
    throw new Error(`expected last-workout detail, got: ${detail}`)
  }
} finally {
  await browser.close()
}

console.log('GYMS.PORTAL.2 production verify: PASS')
