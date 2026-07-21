#!/usr/bin/env node
/**
 * P5 Final Visual Audit — review shot batch (post Knife 6).
 *
 * Output:
 *   docs/qa/evidence/kenos-uiux-rescue/p5-final-audit-review-2026-07-20/
 *
 * Usage:
 *   node scripts/qa/kenos-p5-final-audit-review-capture.mjs [--port 5197]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const OUT = join(
  root,
  'docs/qa/evidence/kenos-uiux-rescue/p5-final-audit-review-2026-07-20',
)
mkdirSync(OUT, { recursive: true })

function arg(flag, fallback = '') {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const BASE = `http://127.0.0.1:${arg('--port', '5197')}`

async function seed(page, { clearContinue = false } = {}) {
  await page.goto(`${BASE}/?kenosDemo=1`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((clear) => {
    localStorage.setItem('aios_demo', '1')
    localStorage.setItem('kenos_phase2_demo', '1')
    if (clear) localStorage.removeItem('kenos.spaceSwitcher.v1')
  }, clearContinue)
  await page
    .reload({ waitUntil: 'networkidle' })
    .catch(() => page.reload({ waitUntil: 'domcontentloaded' }))
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important}`,
  })
  await page.waitForTimeout(450)
}

async function openContinue(page, preferSidebar) {
  const selectors = preferSidebar
    ? [
        '[data-testid="kenos-space-switcher-sidebar"]',
        '[data-testid="kenos-space-switcher-trigger"]',
        '[data-testid="kenos-today-continue"]',
        '[data-testid="kenos-space-switcher-fab"]',
      ]
    : [
        '[data-testid="kenos-today-continue"]',
        '[data-testid="kenos-space-switcher-fab"]',
        '[data-testid="kenos-space-switcher-trigger"]',
        '[data-testid="kenos-space-switcher-sidebar"]',
      ]
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    if ((await loc.count()) === 0) continue
    if (!(await loc.isVisible().catch(() => false))) continue
    await loc.click({ force: true, timeout: 4000 }).catch(() => {})
    await page.waitForSelector('.space-switcher-sheet-bg', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(350)
    if ((await page.locator('.space-switcher-sheet-bg').count()) > 0) return true
  }
  return false
}

const CASES = [
  { id: '01-today-390', path: '/', w: 390, h: 844, mobile: true, scheme: 'light' },
  { id: '02-today-768', path: '/', w: 768, h: 1024, mobile: true, scheme: 'light' },
  { id: '03-today-1440', path: '/', w: 1440, h: 900, mobile: false, scheme: 'light' },
  { id: '04-today-1440-dark', path: '/', w: 1440, h: 900, mobile: false, scheme: 'dark' },
  { id: '05-spaces-390', path: '/spaces', w: 390, h: 844, mobile: true, scheme: 'light' },
  { id: '06-spaces-1440', path: '/spaces', w: 1440, h: 900, mobile: false, scheme: 'light' },
  {
    id: '07-continue-390',
    path: '/',
    w: 390,
    h: 844,
    mobile: true,
    scheme: 'light',
    continue: true,
  },
  {
    id: '08-continue-768',
    path: '/',
    w: 768,
    h: 1024,
    mobile: true,
    scheme: 'light',
    continue: true,
  },
  {
    id: '09-continue-1440',
    path: '/',
    w: 1440,
    h: 900,
    mobile: false,
    scheme: 'light',
    continue: true,
    sidebar: true,
  },
  {
    id: '10-continue-1024-touch',
    path: '/',
    w: 1024,
    h: 768,
    mobile: true,
    scheme: 'light',
    continue: true,
    touchFirst: true,
  },
  {
    id: '11-continue-all-1440',
    path: '/',
    w: 1440,
    h: 900,
    mobile: false,
    scheme: 'light',
    continue: true,
    sidebar: true,
    expandAll: true,
  },
  {
    id: '12-today-offline-390',
    path: '/',
    w: 390,
    h: 844,
    mobile: true,
    scheme: 'light',
    offline: true,
  },
  { id: '13-inbox-1440', path: '/inbox', w: 1440, h: 900, mobile: false, scheme: 'light' },
  { id: '14-states-matrix-1280', path: '/uiux-states', w: 1280, h: 900, mobile: false, scheme: 'light', fullPage: true },
  { id: '15-states-matrix-dark', path: '/uiux-states', w: 1280, h: 900, mobile: false, scheme: 'dark', fullPage: true },
]

const browser = await chromium.launch({ headless: true })
const shots = []

try {
  for (const c of CASES) {
    const ctx = await browser.newContext({
      viewport: { width: c.w, height: c.h },
      deviceScaleFactor: 2,
      colorScheme: c.scheme,
      hasTouch: Boolean(c.mobile || c.touchFirst),
      isMobile: Boolean(c.mobile),
    })
    const page = await ctx.newPage()
    if (c.touchFirst) {
      await page.addInitScript(() => {
        const orig = window.matchMedia.bind(window)
        window.matchMedia = (q) => {
          if (q === '(pointer: fine)' || q === '(hover: hover)') {
            return {
              matches: false,
              media: q,
              addEventListener() {},
              removeEventListener() {},
              addListener() {},
              removeListener() {},
              onchange: null,
              dispatchEvent() {
                return false
              },
            }
          }
          return orig(q)
        }
      })
    }

    await seed(page)
    if (c.path !== '/') {
      await page.goto(`${BASE}${c.path}?kenosDemo=1`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForTimeout(400)
    }

    if (c.offline) {
      await page.evaluate(() => window.dispatchEvent(new Event('offline')))
      await page.waitForTimeout(250)
    }

    let layoutMode = null
    if (c.continue) {
      const opened = await openContinue(page, Boolean(c.sidebar))
      if (opened && c.expandAll) {
        const toggle = page.locator('.all-toggle').first()
        if (await toggle.count()) await toggle.click({ force: true }).catch(() => {})
        await page.waitForTimeout(300)
      }
      layoutMode = await page.evaluate(() =>
        [...(document.querySelector('.space-switcher-sheet-bg')?.classList || [])].find((x) =>
          x.startsWith('layout-'),
        ),
      )
    }

    const file = `${c.id}.png`
    await page.screenshot({
      path: join(OUT, file),
      fullPage: Boolean(c.fullPage),
    })
    shots.push({
      id: c.id,
      file,
      viewport: `${c.w}x${c.h}`,
      scheme: c.scheme,
      layoutMode,
      path: c.path,
    })
    console.log(`✓ ${c.id}${layoutMode ? ` (${layoutMode})` : ''}`)
    await ctx.close()
  }
} finally {
  await browser.close()
}

const manifest = {
  capturedAt: new Date().toISOString(),
  purpose: 'P5 Final Visual Audit — review batch',
  base: BASE,
  knives: '1–6 landed; audit-only shots',
  ownerReview: 'NOT OPEN',
  shots,
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))

const index = `# P5 Final Visual Audit — review shots

**Captured:** ${manifest.capturedAt}
**Base:** ${BASE}
**Owner Review:** NOT OPEN · Visual Quality still IN_PROGRESS until audit verdict

| # | File | Viewport | Notes |
| - | ---- | -------- | ----- |
${shots
  .map(
    (s) =>
      `| ${s.id} | \`${s.file}\` | ${s.viewport} ${s.scheme} | ${s.layoutMode || s.path} |`,
  )
  .join('\n')}

## How to review

1. Today rhythm (01–04): L1 vs L2 vs L3 weight
2. Spaces identity (05–06): rails + glyphs, not full-row dye
3. Continue hierarchy (07–11): mobile sheet / tablet form / desktop anchor / touch≥900 tablet-lg / All expanded
4. Offline (12): low-noise banner
5. Inbox + state matrix (13–15)
`

writeFileSync(join(OUT, 'INDEX.md'), index)
console.log(`\nWrote ${shots.length} shots → ${OUT}`)
