/**
 * Portal smoke QA — 登录 → 五卡摘要 → pending 深链 → ⌘K（PORT.GROWTH.9）
 *
 * Usage:
 *   npm run preview -- --host 127.0.0.1 --port 5195
 *   PORTAL_QA_URL=http://127.0.0.1:5195 node scripts/qa-smoke.mjs
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import {
  LIFE_OS_SUPABASE_PUBLISHABLE_KEY,
  LIFE_OS_SUPABASE_URL,
} from '../../../packages/sync/src/supabaseClient.js'

const baseUrl = process.env.PORTAL_QA_URL ?? 'http://127.0.0.1:5195'
const LIFE_OS_AUTH_STORAGE_KEY = 'life_os_auth'

/** @param {string | null} href @param {string} label */
function assertInboxDeepLink(href, label) {
  if (!href) {
    fail(`${label}: missing href`)
    return
  }
  try {
    const url = new URL(href)
    if (url.pathname !== '/inbox') {
      fail(`${label}: expected /inbox path, got ${url.pathname}`)
    }
  } catch {
    fail(`${label}: invalid URL ${href}`)
  }
}

/** @type {string[]} */
const failures = []

function fail(msg) {
  failures.push(msg)
  console.error(`FAIL: ${msg}`)
}

async function signIn() {
  const email = process.env.UI_QA_EMAIL ?? 'p1a-rls-test-b@example.test'
  const password = process.env.UI_QA_PASSWORD ?? 'P1aTestPass!2026'
  const sb = createClient(LIFE_OS_SUPABASE_URL, LIFE_OS_SUPABASE_PUBLISHABLE_KEY, {
    auth: { storageKey: LIFE_OS_AUTH_STORAGE_KEY, persistSession: false },
  })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(error?.message ?? 'sign in failed')
  return data.session
}

async function injectSession(page, session) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ key, session: s }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: s.access_token,
          refresh_token: s.refresh_token,
          expires_at: s.expires_at,
          expires_in: s.expires_in,
          token_type: s.token_type,
          user: s.user,
        }),
      )
    },
    { key: LIFE_OS_AUTH_STORAGE_KEY, session },
  )
  await page.reload({ waitUntil: 'networkidle' })
}

const session = await signIn()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

try {
  await injectSession(page, session)
  await page.waitForSelector('.portal-page-header, .page-title', { timeout: 20000 })

  const title = await page.locator('.page-title').textContent()
  if (!title?.includes('选择应用')) fail('page title missing')

  const summaryCards = page.locator('.portal-summary-card:not(.portal-summary-card--loading)')
  await page.waitForTimeout(2000)
  const cardCount = await summaryCards.count()
  if (cardCount !== 5) fail(`expected 5 summary cards, got ${cardCount}`)

  const badge = page.locator('.portal-inbox-btn')
  if (await badge.isVisible().catch(() => false)) {
    assertInboxDeepLink(await badge.getAttribute('href'), 'pending badge')
  }

  const pendingLink = page.locator('.portal-pending-link')
  if (await pendingLink.isVisible().catch(() => false)) {
    assertInboxDeepLink(await pendingLink.getAttribute('href'), 'status pending link')
  }

  await page.keyboard.press('Meta+k')
  await page.waitForSelector('.command-palette-modal[open]', { timeout: 5000 })
  const cpItems = page.locator('.cp-item')
  const cpCount = await cpItems.count()
  if (cpCount < 5) fail(`command palette expected >=5 items, got ${cpCount}`)

  const plannerDeepLink = page.locator('.cp-item', { hasText: 'Planner · 今日' })
  if (!(await plannerDeepLink.isVisible().catch(() => false))) {
    fail('command palette missing Planner · 今日 deep link')
  }

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  if (await page.locator('.command-palette-modal[open]').isVisible().catch(() => false)) {
    fail('command palette did not close on Escape')
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`\nPortal smoke: ${failures.length} failure(s)`)
  process.exit(1)
}

console.log('Portal smoke: all checks passed')
