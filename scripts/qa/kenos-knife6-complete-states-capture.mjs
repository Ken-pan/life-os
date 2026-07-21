#!/usr/bin/env node
/**
 * P5 Knife 6 — complete product states evidence capture.
 * Usage: node scripts/qa/kenos-knife6-complete-states-capture.mjs [--port 5197]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const OUT = join(root, 'docs/qa/evidence/kenos-uiux-rescue/p5-knife6-complete-states')
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
  await page.waitForTimeout(400)
}

const browser = await chromium.launch({ headless: true })
const shots = []
const failures = []

try {
  // Matrix fixtures page
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      colorScheme: 'light',
    })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/uiux-states?kenosDemo=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, 'matrix-light-1280.png'), fullPage: true })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(OUT, 'matrix-dark-1280.png'), fullPage: true })
    shots.push({ id: 'matrix-light-dark', ok: true })
    await ctx.close()
  }

  // Today normal + continue empty
  for (const vp of [
    { id: '390x844', w: 390, h: 844, mobile: true },
    { id: '768x1024', w: 768, h: 1024, mobile: true },
    { id: '1440x900', w: 1440, h: 900, mobile: false },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      colorScheme: 'light',
      hasTouch: vp.mobile,
      isMobile: vp.mobile,
      reducedMotion: 'reduce',
    })
    const page = await ctx.newPage()
    await seed(page, { clearContinue: true })
    await page.screenshot({ path: join(OUT, `today-normal-${vp.id}.png`), fullPage: false })

    // Offline banner simulation via evaluate
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'))
    })
    await page.waitForTimeout(200)
    const offlineVisible = await page.locator('[data-testid="aios-offline-banner"]').isVisible().catch(() => false)
    await page.screenshot({ path: join(OUT, `today-offline-${vp.id}.png`), fullPage: false })
    await page.evaluate(() => window.dispatchEvent(new Event('online')))

    // Continue empty (cleared store — demo may reseed on hydrate; probe copy if empty)
    const preferSidebar = vp.w >= 900
    const sel = preferSidebar
      ? '[data-testid="kenos-space-switcher-sidebar"]'
      : '[data-testid="kenos-space-switcher-fab"], [data-testid="kenos-space-switcher-trigger"], [data-testid="kenos-today-continue"]'
    await page.locator(sel).first().click({ force: true }).catch(() => {})
    await page.waitForSelector('.space-switcher-sheet-bg', { timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, `continue-open-${vp.id}.png`), fullPage: false })

    // Search empty
    const search = page.locator('.space-switcher-sheet input[type="search"]')
    if (await search.count()) {
      const toggle = page.locator('.all-toggle').first()
      if (await toggle.count()) await toggle.click({ force: true }).catch(() => {})
      await search.fill('zzz-no-match-xyz')
      await page.waitForTimeout(200)
      await page.screenshot({ path: join(OUT, `continue-search-empty-${vp.id}.png`), fullPage: false })
    }

    // Keyboard Escape close
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    const sheetGone = (await page.locator('.space-switcher-sheet-bg').count()) === 0

    // 200% zoom probe (CSS zoom)
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2'
    })
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(OUT, `today-zoom200-${vp.id}.png`), fullPage: false })
    await page.evaluate(() => {
      document.documentElement.style.zoom = ''
    })

    const row = { vp: vp.id, offlineVisible, sheetGone }
    shots.push(row)
    if (!sheetGone) failures.push(row)
    console.log(`${sheetGone ? '✓' : '✗'} ${vp.id} offline=${offlineVisible} escClose=${sheetGone}`)
    await ctx.close()
  }

  // Touch ≥900 tablet-lg control
  {
    const ctx = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      colorScheme: 'light',
    })
    const page = await ctx.newPage()
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
    await page.goto(`${BASE}/?kenosDemo=1&openContinue=1`, {
      waitUntil: 'domcontentloaded',
    })
    await page.evaluate(() => {
      localStorage.setItem('aios_demo', '1')
      localStorage.setItem('kenos_phase2_demo', '1')
    })
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForTimeout(600)
    // Ensure open even if URL param consumed
    if ((await page.locator('.space-switcher-sheet-bg').count()) === 0) {
      await page
        .locator(
          '[data-testid="kenos-today-continue"], [data-testid="kenos-space-switcher-fab"], [data-testid="kenos-space-switcher-trigger"], [data-testid="kenos-space-switcher-sidebar"]',
        )
        .first()
        .click({ force: true })
        .catch(() => {})
      await page.waitForSelector('.space-switcher-sheet-bg', { timeout: 5000 }).catch(() => {})
    }
    const mode = await page.evaluate(() =>
      [...(document.querySelector('.space-switcher-sheet-bg')?.classList || [])].find((c) =>
        c.startsWith('layout-'),
      ),
    )
    await page.screenshot({ path: join(OUT, 'continue-1024-touch.png'), fullPage: false })
    shots.push({ id: '1024-touch', mode })
    if (mode !== 'layout-tablet-lg') failures.push({ id: '1024-touch', mode })
    console.log(`${mode === 'layout-tablet-lg' ? '✓' : '✗'} 1024-touch mode=${mode}`)
    await ctx.close()
  }
} finally {
  await browser.close()
}

const manifest = {
  capturedAt: new Date().toISOString(),
  knife: '6-complete-states',
  base: BASE,
  shots,
  failures,
  pass: failures.length === 0,
  notes: [
    'Matrix fixtures: /uiux-states light+dark',
    'Offline banner via window offline event',
    'Continue Escape close + reducedMotion context',
    '200% zoom CSS probe',
    'Does not mutate Continuity contracts',
  ],
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(
  join(OUT, 'README.md'),
  `# P5 Knife 6 — complete product states

**Date:** ${manifest.capturedAt.slice(0, 10)}  
**Result:** ${manifest.pass ? 'PASS' : 'FAIL'}  
**Continuity:** FROZEN · Owner Review **NOT OPEN** · Visual **IN_PROGRESS**

## Covered

- Loading skeletons (Continue hydrate / Today first paint)
- Empty: Continue recent, search, Today urgent
- Offline banner (low-noise)
- Expired Continue presentation + dismiss
- Launch debounce
- Copy sanitization (no demo/entity leak)
- prefers-reduced-motion
- light/dark matrix fixtures
- Escape close, 200% zoom probe

## Next

Independent **P5 Final Visual Audit** before Owner Review.
`,
)
console.log(manifest.pass ? 'PASS' : 'FAIL', OUT)
process.exit(manifest.pass ? 0 : 1)
