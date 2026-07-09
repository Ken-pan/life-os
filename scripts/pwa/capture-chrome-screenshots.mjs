/**
 * PWA top/bottom chrome audit — viewport screenshots + metrics.
 * Usage (repo root, previews running or let script spawn them):
 *   node scripts/pwa/capture-chrome-screenshots.mjs
 *   PWA_APP=fitness,music node scripts/pwa/capture-chrome-screenshots.mjs
 */
import { chromium, devices } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { spawn } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import { PWA_APPS } from './apps.config.mjs'
import { resolveScreenshotDir } from '../qa/screenshot-output.mjs'

const { dir: OUT_DIR } = resolveScreenshotDir({
  app: 'pwa',
  suite: 'chrome-audit',
  importMetaUrl: import.meta.url,
})
const FILTER = process.env.PWA_APP?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/** @type {Record<string, import('child_process').ChildProcess>} */
const servers = {}

/** @param {string} id */
function startPreview(id) {
  const app = PWA_APPS[id]
  if (!app) throw new Error(`Unknown app: ${id}`)
  const child = spawn(
    'npm',
    [
      'run',
      'preview',
      '-w',
      app.workspace,
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      String(app.port),
    ],
    { stdio: 'ignore', detached: false },
  )
  servers[id] = child
  return app.port
}

/** @param {number} port */
async function waitForPort(port, ms = 60_000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Preview not ready on :${port}`)
}

/** @param {import('playwright').Page} page */
async function primeStandalonePwa(page) {
  await page.evaluate(() => {
    document.documentElement.classList.add('standalone-pwa')
    document.documentElement.style.setProperty('--app-vh', '100vh')
    document.documentElement.style.setProperty('--safe-top-effective', '59px')
    document.documentElement.style.setProperty(
      '--safe-bottom-effective',
      '34px',
    )
    document.documentElement.style.setProperty(
      '--mobile-tabbar-safe-padding',
      '34px',
    )
  })
  await page
    .waitForLoadState('networkidle', { timeout: 15_000 })
    .catch(() => {})
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    document.documentElement.classList.add('standalone-pwa')
    document.documentElement.style.setProperty('--app-vh', '100vh')
    document.documentElement.style.setProperty('--safe-top-effective', '59px')
    document.documentElement.style.setProperty(
      '--safe-bottom-effective',
      '34px',
    )
    document.documentElement.style.setProperty(
      '--mobile-tabbar-safe-padding',
      '34px',
    )
  })
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
      JSON.stringify({ settings: { theme: 'dark', locale: 'zh' } }),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
}

/** @param {import('playwright').Page} page */
async function collectChromeMetrics(page) {
  return page.evaluate(() => {
    const px = (v) => Math.round(parseFloat(v) || 0)
    const cs = (el) => (el ? getComputedStyle(el) : null)
    const tab =
      document.querySelector('.bottom-shell .nav') ||
      document.querySelector('.bottom-shell .mobile-tabbar') ||
      document.querySelector('.nav.bottom-nav') ||
      document.querySelector('nav.nav') ||
      document.querySelector('.mobile-tabbar')
    const tintTop = document.querySelector('.safari-chrome-tint-top')
    const tintBottom = document.querySelector('.safari-chrome-tint-bottom')
    const header =
      document.querySelector('.appbar') ||
      document.querySelector('.page-header') ||
      document.querySelector('.day-head') ||
      document.querySelector('.page-head')
    const shell = document.querySelector('.bottom-shell')
    const tabRect = tab?.getBoundingClientRect()
    const vh = window.innerHeight

    return {
      appVh: cs(document.documentElement).getPropertyValue('--app-vh').trim(),
      bodyHeight: cs(document.body).height,
      htmlHeight: cs(document.documentElement).height,
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height,
      tab: tab
        ? {
            bottom: Math.round(tabRect.bottom),
            height: Math.round(tabRect.height),
            paddingBottom: px(cs(tab).paddingBottom),
            bg: cs(tab).backgroundColor,
          }
        : null,
      bottomShell: shell
        ? {
            bottom: Math.round(shell.getBoundingClientRect().bottom),
            height: Math.round(shell.getBoundingClientRect().height),
          }
        : null,
      gapBelowTab: tab ? Math.round(vh - tabRect.bottom) : null,
      tintTop: tintTop
        ? { height: Math.round(tintTop.getBoundingClientRect().height) }
        : null,
      tintBottom: tintBottom
        ? {
            height: Math.round(tintBottom.getBoundingClientRect().height),
            bottom: Math.round(tintBottom.getBoundingClientRect().bottom),
          }
        : null,
      header: header
        ? {
            top: Math.round(header.getBoundingClientRect().top),
            paddingTop: px(cs(header).paddingTop),
            borderBottom: cs(header).borderBottomWidth,
          }
        : null,
    }
  })
}

async function main() {
  const ids = FILTER?.length
    ? FILTER.filter((id) => PWA_APPS[id]?.pwaTestEnabled !== false)
    : ['fitness', 'music', 'finance', 'planner']

  mkdirSync(OUT_DIR, { recursive: true })

  for (const id of ids) {
    const port = startPreview(id)
    await waitForPort(port)
  }

  const iphone = devices['iPhone 13']
  const browser = await chromium.launch()
  const context = await browser.newContext({
    ...iphone,
    colorScheme: 'dark',
  })
  const page = await context.newPage()
  const report = { capturedAt: new Date().toISOString(), apps: {} }

  for (const id of ids) {
    const app = PWA_APPS[id]
    const route = app.routes[0]
    try {
      await page.goto(`http://127.0.0.1:${app.port}${route.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      })
      if (id === 'finance') {
        const ok = await authFinance(page)
        if (!ok) throw new Error('finance auth unavailable')
      }
      if (id === 'music') await seedMusic(page)
      if (id === 'planner') {
        await page
          .waitForURL(/\/(calendar)?(\?.*)?$/, { timeout: 15_000 })
          .catch(() => {})
        await page
          .waitForLoadState('networkidle', { timeout: 15_000 })
          .catch(() => {})
      }
      await page.waitForSelector(app.waitSelector, { timeout: 45_000 })
      await primeStandalonePwa(page)

      const metrics = await collectChromeMetrics(page)
      const base = `${OUT_DIR}/${id}-${route.name}-chrome-audit`
      await page.screenshot({ path: `${base}-viewport.png` })
      await page.screenshot({ path: `${base}-full.png`, fullPage: true })

      report.apps[id] = { route: route.path, metrics }
      console.log(`✓ ${id} → ${base}-viewport.png`)
    } catch (err) {
      report.apps[id] = { error: String(err.message || err) }
      console.error(`✗ ${id}:`, err.message || err)
    }
  }

  writeFileSync(
    `${OUT_DIR}/chrome-audit-report.json`,
    JSON.stringify(report, null, 2),
  )
  console.log(`Report: ${OUT_DIR}/chrome-audit-report.json`)

  await browser.close()
  for (const child of Object.values(servers)) child.kill('SIGTERM')
}

main().catch((err) => {
  console.error(err)
  for (const child of Object.values(servers)) child.kill('SIGTERM')
  process.exit(1)
})
