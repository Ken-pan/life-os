#!/usr/bin/env node
/**
 * Amazon purchase enrichment UI audit — desktop + mobile screenshots.
 *
 * Usage:
 *   npm run dev -- --port 5180
 *   npm run qa:amazon-enrichment
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dateTag = process.env.UI_QA_DATE ?? '2026-07-06'
const shotRoot = resolve(
  root,
  `docs/ui-qa-screenshots/amazon-enrichment-${dateTag}`,
)
const storageKey = 'life_os_auth'
const baseUrl = process.env.UI_QA_URL ?? 'http://localhost:5180'

const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 402, height: 874 },
]

mkdirSync(resolve(shotRoot, 'desktop'), { recursive: true })
mkdirSync(resolve(shotRoot, 'mobile'), { recursive: true })

function loadEnv() {
  return Object.fromEntries(
    readFileSync(resolve(root, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i), l.slice(i + 1)]
      }),
  )
}

const env = loadEnv()
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey, persistSession: false },
})

const email = process.env.UI_QA_EMAIL ?? 'p1a-rls-test-b@example.test'
const password = process.env.UI_QA_PASSWORD ?? 'P1aTestPass!2026'

const { data: auth, error } = await sb.auth.signInWithPassword({
  email,
  password,
})
if (error || !auth.session) {
  console.error('Auth failed:', error?.message)
  process.exit(1)
}

async function injectSession(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
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
    { key: storageKey, session: auth.session },
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
}

async function goHistoryInsights(page) {
  await page.goto(`${baseUrl}/history/insights`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const body = await page.locator('body').innerText()
  if (body.includes('正在加载交易数据')) {
    await page.waitForTimeout(3000)
  }
  if (!body.includes('全部流水') && !body.includes('All transactions')) {
    await page.screenshot({
      path: resolve(shotRoot, 'debug-history-failed.png'),
      fullPage: true,
    })
    throw new Error(`History insights not ready: ${body.slice(0, 240)}`)
  }
}

async function openLedgerFilters(page) {
  const toggle = page.locator('.ledger-filter-toggle')
  if (await toggle.count()) {
    const panel = page.locator('.ledger-filter-panel')
    if (!(await panel.evaluate((el) => el.classList.contains('open')))) {
      await toggle.click()
      await page.waitForTimeout(400)
    }
  }
}

async function closeLedgerFilters(page) {
  const done = page.locator('.ledger-filter-actions .btn').first()
  if (await done.count()) {
    await done.click()
    await page.waitForTimeout(300)
  }
}

async function searchLedger(page, query, viewportId) {
  await scrollToLedger(page)
  if (viewportId === 'mobile') {
    await openLedgerFilters(page)
  }
  const input = page.locator('.ledger-filters input.input').first()
  await input.scrollIntoViewIfNeeded()
  await input.fill('')
  await input.fill(query)
  await page.waitForTimeout(600)
  if (viewportId === 'mobile') {
    await closeLedgerFilters(page)
  }
}

async function scrollToLedger(page) {
  const ledger = page.locator('.ledger').first()
  if (await ledger.count()) {
    await ledger.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
  }
}

async function expandFirstEnrichment(page) {
  const toggle = page.locator('.purchase-enrichment-toggle').first()
  if (await toggle.count()) {
    const expanded = await toggle.getAttribute('aria-expanded')
    if (expanded !== 'true') {
      await toggle.click()
      await page.waitForTimeout(350)
    }
  }
}

async function capture(page, viewportId, name, opts = {}) {
  const path = resolve(shotRoot, viewportId, `${name}.png`)
  await page.screenshot({ path, fullPage: Boolean(opts.fullPage) })
  console.log(`CAPTURE [${viewportId}] ${name}`)
  return path
}

const browser = await chromium.launch()
const manifest = []

for (const vp of VIEWPORTS) {
  const page = await browser.newPage()
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await injectSession(page)
  await goHistoryInsights(page)

  manifest.push(
    await capture(page, vp.id, '01-history-insights-top', {
      fullPage: vp.id === 'desktop',
    }),
  )

  await scrollToLedger(page)
  manifest.push(await capture(page, vp.id, '02-ledger-default'))

  await searchLedger(page, 'Amazon', vp.id)
  await scrollToLedger(page)
  manifest.push(await capture(page, vp.id, '03-ledger-amazon-search-collapsed'))

  await expandFirstEnrichment(page)
  manifest.push(await capture(page, vp.id, '04-ledger-amazon-expanded'))

  await searchLedger(page, 'Optimum Nutrition', vp.id)
  await scrollToLedger(page)
  await expandFirstEnrichment(page)
  manifest.push(await capture(page, vp.id, '05-ledger-product-search'))

  await page.close()
}

await browser.close()

writeFileSync(
  resolve(shotRoot, 'manifest.json'),
  JSON.stringify({ dateTag, baseUrl, email, shots: manifest }, null, 2),
)

console.log(`\nScreenshots saved to:\n${shotRoot}`)
