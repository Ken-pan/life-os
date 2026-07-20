#!/usr/bin/env node
/**
 * P5 footnote-fix capture — verify P1–P3 after Continue overlay remediation.
 *
 * Evidence:
 *   docs/qa/evidence/kenos-uiux-rescue/p5-footnote-fix-2026-07-20/
 *
 * Usage:
 *   node scripts/qa/kenos-continue-footnote-fix-capture.mjs
 *   node scripts/qa/kenos-continue-footnote-fix-capture.mjs --port 5197
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const OUT = join(
  root,
  'docs/qa/evidence/kenos-uiux-rescue/p5-footnote-fix-2026-07-20',
)

function arg(flag, fallback = '') {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const BASE = `http://127.0.0.1:${arg('--port', '5197')}`

const CASES = [
  {
    id: '390x844',
    width: 390,
    height: 844,
    expectMode: 'layout-mobile',
    hasTouch: true,
    isMobile: true,
  },
  {
    id: '768x1024',
    width: 768,
    height: 1024,
    expectMode: 'layout-tablet',
    hasTouch: true,
    isMobile: true,
  },
  {
    id: '1024x768-touch',
    width: 1024,
    height: 768,
    expectMode: 'layout-tablet-lg',
    hasTouch: true,
    isMobile: true,
    // force touch-first media
    emulateMedia: { forcedColors: undefined },
  },
  {
    id: '1024x768-fine',
    width: 1024,
    height: 768,
    expectMode: 'layout-desktop',
    hasTouch: false,
    isMobile: false,
  },
  {
    id: '1440x900-fine',
    width: 1440,
    height: 900,
    expectMode: 'layout-desktop',
    hasTouch: false,
    isMobile: false,
  },
]

async function seed(page) {
  await page.goto(`${BASE}/?kenosDemo=1`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.setItem('aios_demo', '1')
    localStorage.setItem('kenos_phase2_demo', '1')
    localStorage.removeItem('kenos.spaceSwitcher.v1')
    localStorage.removeItem('kenos_continue_v1')
    localStorage.removeItem('kenos_space_switcher_v1')
  })
  await page.reload({ waitUntil: 'networkidle' }).catch(() =>
    page.reload({ waitUntil: 'domcontentloaded' }),
  )
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  await page.addStyleTag({
    content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
  })
  await page.waitForTimeout(350)
}

async function openContinue(page, { preferSidebar }) {
  const selectors = preferSidebar
    ? [
        '[data-testid="kenos-space-switcher-sidebar"]',
        '[data-testid="kenos-space-switcher-trigger"]',
        '[data-testid="kenos-space-switcher-fab"]',
      ]
    : [
        '[data-testid="kenos-space-switcher-fab"]',
        '[data-testid="kenos-space-switcher-trigger"]',
        '[data-testid="kenos-space-switcher-sidebar"]',
      ]
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    if ((await loc.count()) === 0) continue
    if (!(await loc.isVisible().catch(() => false))) continue
    await loc.click({ force: true, timeout: 4000 })
    await page.waitForSelector('.space-switcher-sheet-bg', { timeout: 5000 })
    await page.waitForTimeout(400)
    return sel
  }
  throw new Error('No Continue trigger found')
}

async function probe(page) {
  return page.evaluate(() => {
    const bg = document.querySelector('.space-switcher-sheet-bg')
    const sheet = document.querySelector('.space-switcher-sheet')
    const toggle = document.querySelector('.all-toggle-label, #switcher-all')
    const sidebar = document.querySelector('aside.chat-sidebar, aside.sidebar')
    if (!bg || !sheet) return { open: false }
    const sr = sheet.getBoundingClientRect()
    const sideR = sidebar?.getBoundingClientRect?.()
    const list = sheet.querySelector('.list')
    const listStyle = list ? getComputedStyle(list) : null
    return {
      open: true,
      layoutClass: bg.className,
      mode: [...bg.classList].find((c) => c.startsWith('layout-')) || null,
      allToggleText: (toggle?.textContent || '').replace(/\s+/g, ' ').trim(),
      sheetWidth: Math.round(sr.width),
      sheetLeft: Math.round(sr.left),
      sheetTop: Math.round(sr.top),
      leftRatio: Number((sr.left / window.innerWidth).toFixed(3)),
      widthRatio: Number((sr.width / window.innerWidth).toFixed(3)),
      sidebarRight: sideR ? Math.round(sideR.right) : null,
      clearanceFromSidebar:
        sideR && sr.left >= sideR.right
          ? Math.round(sr.left - sideR.right)
          : sideR
            ? Math.round(sr.left - sideR.right)
            : null,
      listBorderTop: listStyle?.borderTopWidth || null,
      listBorderBottom: listStyle?.borderBottomWidth || null,
      fine: matchMedia('(pointer: fine)').matches,
      hover: matchMedia('(hover: hover)').matches,
    }
  })
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const shots = []
const failures = []

try {
  for (const c of CASES) {
    const context = await browser.newContext({
      viewport: { width: c.width, height: c.height },
      deviceScaleFactor: 2,
      colorScheme: 'light',
      hasTouch: Boolean(c.hasTouch),
      isMobile: Boolean(c.isMobile),
    })
    const page = await context.newPage()

    // Touch-first ≥900: Playwright still reports fine pointer on desktop Chromium
    // unless we override matchMedia used by continueOverlayMode.
    if (c.id.includes('touch') && c.width >= 900) {
      await page.addInitScript(() => {
        const orig = window.matchMedia.bind(window)
        window.matchMedia = (query) => {
          if (query === '(pointer: fine)') {
            return {
              matches: false,
              media: query,
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
          if (query === '(hover: hover)') {
            return {
              matches: false,
              media: query,
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
          return orig(query)
        }
      })
    }

    await seed(page)
    const preferSidebar = c.width >= 900 && !c.id.includes('touch')
    const trigger = await openContinue(page, { preferSidebar })
    const probes = await probe(page)
    const file = `fix-open-${c.id}.png`
    await page.screenshot({ path: join(OUT, file), fullPage: false })

    const modeOk = probes.mode === c.expectMode
    const allMatch = /All Spaces · (\d+)/.exec(probes.allToggleText || '')
    const allCountOk = Boolean(allMatch && Number(allMatch[1]) >= 6)
    const clearanceOk =
      probes.mode !== 'layout-desktop' ||
      (probes.clearanceFromSidebar != null && probes.clearanceFromSidebar >= 8) ||
      (probes.sidebarRight == null && probes.leftRatio >= 0.08)

    const hairlineOk =
      probes.listBorderTop === '0px' || probes.listBorderTop === null

    const row = {
      case: c.id,
      expectMode: c.expectMode,
      modeOk,
      allCountOk,
      clearanceOk,
      hairlineOk,
      trigger,
      file,
      probes,
    }
    shots.push(row)
    if (!modeOk || !allCountOk || !clearanceOk) {
      failures.push({
        case: c.id,
        modeOk,
        allCountOk,
        clearanceOk,
        probes,
      })
    }
    console.log(
      `${modeOk && allCountOk && clearanceOk ? '✓' : '✗'} ${c.id} mode=${probes.mode} all="${probes.allToggleText}" left=${probes.sheetLeft} clearance=${probes.clearanceFromSidebar}`,
    )
    await context.close()
  }
} finally {
  await browser.close()
}

const manifest = {
  capturedAt: new Date().toISOString(),
  base: BASE,
  knife: 'footnote-fix-P1-P3',
  criteria: {
    P1: 'desktop left clears sidebar by ≥8px (or leftRatio≥0.08)',
    P2: 'All Spaces · N with N ≥ 6 (full catalog, not remainder)',
    P3: 'list has no outer border-top box',
  },
  shots,
  failures,
  pass: failures.length === 0,
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(
  join(OUT, 'README.md'),
  `# P5 footnote fix capture — P1/P2/P3

**Date:** ${manifest.capturedAt.slice(0, 10)}  
**Base:** ${BASE}  
**Result:** ${manifest.pass ? 'PASS' : 'FAIL'}

| ID | Check |
| -- | ----- |
| P1 | Desktop anchored panel clears sidebar (≥8px) |
| P2 | \`All Spaces · N\` with N ≥ catalog size (demo ≥6) |
| P3 | List hairlines only (no outer list border box) |

See \`manifest.json\` for probes.
`,
)

console.log(`\nWrote ${OUT}`)
console.log(manifest.pass ? 'PASS' : `FAIL (${failures.length})`)
process.exit(manifest.pass ? 0 : 1)
