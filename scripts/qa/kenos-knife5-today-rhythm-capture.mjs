#!/usr/bin/env node
/**
 * P5 Knife 5 — Today type / information rhythm evidence.
 * Usage: node scripts/qa/kenos-knife5-today-rhythm-capture.mjs [--port 5197]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const OUT = join(root, 'docs/qa/evidence/kenos-uiux-rescue/p5-knife5-today-rhythm')
mkdirSync(OUT, { recursive: true })

function arg(flag, fallback = '') {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const BASE = `http://127.0.0.1:${arg('--port', '5197')}`

async function seed(page) {
  await page.goto(`${BASE}/?kenosDemo=1`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.setItem('aios_demo', '1')
    localStorage.setItem('kenos_phase2_demo', '1')
  })
  await page
    .reload({ waitUntil: 'networkidle' })
    .catch(() => page.reload({ waitUntil: 'domcontentloaded' }))
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important}`,
  })
  await page.waitForTimeout(500)
}

const browser = await chromium.launch({ headless: true })
const shots = []
const failures = []

try {
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
    })
    const page = await ctx.newPage()
    await seed(page)

    const probe = await page.evaluate(() => {
      const l1 = document.querySelector('.today-level-1')
      const l2 = document.querySelector('.today-level-2')
      const l3 = document.querySelector('.today-level-3')
      const continueBtn = document.querySelector('[data-testid="kenos-today-continue"]')
      const hero = document.querySelector('.priority-row--hero')
      const queueStrong = document.querySelector('.today-level-1 .queue-row strong')
      const activityStrong = document.querySelector('.today-level-3 .activity-row strong')
      const title = document.querySelector('.kenos-page-title')
      const asof = document.querySelector('.status-line--asof, .status-line--quiet')
      const fs = (el) => (el ? Number.parseFloat(getComputedStyle(el).fontSize) : null)
      const gap = (el) => {
        if (!el) return null
        const s = getComputedStyle(el)
        return Number.parseFloat(s.gap || s.rowGap || '0')
      }
      return {
        hasLevels: Boolean(l1 && l2 && l3),
        hasContinue: Boolean(continueBtn),
        hasHero: Boolean(hero),
        titleFs: fs(title),
        heroTitleFs: hero ? fs(hero.querySelector('strong')) : null,
        queueFs: fs(queueStrong),
        activityFs: fs(activityStrong),
        asofFs: fs(asof),
        levelGap: gap(document.querySelector('.today-workspace')),
        l1Order: l1?.compareDocumentPosition(l2) & Node.DOCUMENT_POSITION_FOLLOWING ? 'l1-before-l2' : 'bad',
        l2Order: l2?.compareDocumentPosition(l3) & Node.DOCUMENT_POSITION_FOLLOWING ? 'l2-before-l3' : 'bad',
      }
    })

    const file = `today-${vp.id}.png`
    await page.screenshot({ path: join(OUT, file), fullPage: false })

    // Scroll to L3 for second frame on desktop
    let fileL3 = null
    if (vp.w >= 768) {
      await page.evaluate(() => {
        document.querySelector('.today-level-3')?.scrollIntoView({ block: 'start' })
      })
      await page.waitForTimeout(200)
      fileL3 = `today-l3-${vp.id}.png`
      await page.screenshot({ path: join(OUT, fileL3), fullPage: false })
    }

    // Continue opens from Today CTA
    let continueOpen = false
    if (probe.hasContinue) {
      await page.getByTestId('kenos-today-continue').click({ force: true })
      await page.waitForSelector('.space-switcher-sheet-bg', { timeout: 4000 }).catch(() => {})
      continueOpen = await page.locator('.space-switcher-sheet-bg').count().then((n) => n > 0)
      const fileC = `today-continue-${vp.id}.png`
      await page.screenshot({ path: join(OUT, fileC), fullPage: false })
    }

    const weightOk =
      probe.hasLevels &&
      probe.hasContinue &&
      probe.l1Order === 'l1-before-l2' &&
      probe.l2Order === 'l2-before-l3' &&
      (probe.queueFs == null ||
        probe.activityFs == null ||
        probe.queueFs >= (probe.activityFs || 0) + 4) &&
      (probe.asofFs == null || probe.asofFs <= 13)

    const row = { vp: vp.id, file, fileL3, probe, continueOpen, weightOk }
    shots.push(row)
    if (!weightOk || !continueOpen) failures.push(row)
    console.log(
      `${weightOk && continueOpen ? '✓' : '✗'} ${vp.id} levels=${probe.hasLevels} continue=${continueOpen} queueFs=${probe.queueFs} activityFs=${probe.activityFs}`,
    )
    await ctx.close()
  }
} finally {
  await browser.close()
}

const manifest = {
  capturedAt: new Date().toISOString(),
  knife: '5-today-rhythm',
  base: BASE,
  shots,
  failures,
  pass: failures.length === 0,
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(
  join(OUT, 'README.md'),
  `# P5 Knife 5 — Today type & information rhythm

**Date:** ${manifest.capturedAt.slice(0, 10)}  
**Result:** ${manifest.pass ? 'PASS' : 'FAIL'}  
**Continuity:** untouched · Owner Review **NOT OPEN** · Visual **IN_PROGRESS**

## Levels

1. Focus + Inbox queue (strongest)
2. Work / Spaces signals + shortcuts (medium)
3. System activity (weakest)

Weight differentials (not global font scale-up). Continue CTA: \`kenos-today-continue\`.

Capture: \`node scripts/qa/kenos-knife5-today-rhythm-capture.mjs\`
`,
)
console.log(manifest.pass ? 'PASS' : 'FAIL', OUT)
process.exit(manifest.pass ? 0 : 1)
