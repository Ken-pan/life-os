/**
 * Cross-app mobile horizontal inset QA (390px viewport).
 * Usage: build + preview apps first, then:
 *   node scripts/pwa/compare-mobile-inset.mjs
 * Env: FINANCE_QA_URL, MUSIC_QA_URL, PLANNER_QA_URL (defaults in PWA_APPS ports)
 */
import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { PWA_APPS } from './apps.config.mjs'

const EXPECT_PAD = 16

/** @param {import('playwright').Page} page */
function measureInset(page) {
  return page.evaluate((expectPad) => {
    const px = (v) => Math.round(parseFloat(v) || 0)
    const cs = (el) => (el ? getComputedStyle(el) : null)
    const tabbar = document.querySelector(
      '.mobile-tabbar, .nav.bottom-nav, nav.nav',
    )
    const main =
      document.querySelector('.main-wrap > .content') ||
      document.querySelector('#main-content > .wrap') ||
      document.querySelector('.main-col > .wrap')
    const chrome =
      document.querySelector('.page-header') ||
      document.querySelector('.appbar-inner')
    const first =
      document.querySelector(
        '.content .card, .wrap .track-row, .wrap .now-card, .wrap .sec-header, .wrap .portal-app-card',
      ) || main?.firstElementChild

    const issues = []
    const tabPadL = tabbar ? px(cs(tabbar).paddingLeft) : null
    const mainPadL = main ? px(cs(main).paddingLeft) : null
    const chromePadL = chrome ? px(cs(chrome).paddingLeft) : null
    const edgeToMain = main
      ? Math.round(main.getBoundingClientRect().left + px(cs(main).paddingLeft))
      : null
    const edgeToFirst = first
      ? Math.round(first.getBoundingClientRect().left)
      : null

    for (const [label, val] of [
      ['tabbar', tabPadL],
      ['main', mainPadL],
      ['chrome', chromePadL],
    ]) {
      if (val != null && val !== expectPad)
        issues.push(`${label} padL=${val}px (expected ${expectPad})`)
    }
    if (mainPadL != null && mainPadL > expectPad) {
      issues.push(`main padL=${mainPadL}px exceeds mobile gutter`)
    }

    return {
      tabPadL,
      mainPadL,
      chromePadL,
      edgeToMain,
      edgeToFirst,
      contentMode: document
        .querySelector('.main-wrap, .main-col')
        ?.getAttribute('data-content-mode'),
      issues,
    }
  }, EXPECT_PAD)
}

async function authFinance(page) {
  const envPath = 'apps/finance/.env.local'
  if (!existsSync(envPath)) return false
  const env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i), l.slice(i + 1)]
      }),
  )
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { storageKey: 'life_os_auth', persistSession: false },
  })
  const { data: auth, error } = await sb.auth.signInWithPassword({
    email: 'p1a-rls-test-b@example.test',
    password: 'P1aTestPass!2026',
  })
  if (error) return false
  await page.goto(`http://127.0.0.1:${PWA_APPS.finance.port}/`, {
    waitUntil: 'domcontentloaded',
  })
  await page.evaluate((session) => {
    localStorage.setItem('life_os_auth', JSON.stringify(session))
  }, auth.session)
  await page.reload({ waitUntil: 'networkidle' })
  return true
}

async function seedMusic(page) {
  await page.evaluate(() => {
    localStorage.setItem(
      'musicos_v1',
      JSON.stringify({ settings: { theme: 'light', locale: 'zh' } }),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
const report = { expectPad: EXPECT_PAD, apps: {} }
let failed = 0

const targets = [
  {
    id: 'music',
    port: PWA_APPS.music.port,
    path: '/',
    setup: seedMusic,
    wait: '.wrap',
  },
  {
    id: 'planner',
    port: PWA_APPS.planner.port,
    path: '/',
    setup: null,
    wait: '.wrap',
  },
  {
    id: 'finance',
    port: PWA_APPS.finance.port,
    path: '/',
    setup: authFinance,
    wait: '.content',
  },
]

for (const t of targets) {
  try {
    await page.goto(`http://127.0.0.1:${t.port}${t.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 8000,
    })
    if (t.setup) {
      if (t.id === 'finance') {
        const ok = await t.setup(page)
        if (!ok) {
          report.apps[t.id] = { skipped: 'auth/env unavailable' }
          continue
        }
      } else {
        await t.setup(page)
      }
    }
    await page.waitForSelector(t.wait, { timeout: 15000 })
    await page.waitForTimeout(400)
    const metrics = await measureInset(page)
    report.apps[t.id] = metrics
    if (metrics.issues?.length) failed += 1
  } catch (err) {
    report.apps[t.id] = { skipped: String(err.message || err) }
  }
}

console.log(JSON.stringify(report, null, 2))
await browser.close()
process.exit(failed > 0 ? 1 : 0)
