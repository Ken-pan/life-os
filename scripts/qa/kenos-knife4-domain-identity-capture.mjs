#!/usr/bin/env node
/**
 * P5 Knife 4 — domain identity evidence capture.
 * Usage: node scripts/qa/kenos-knife4-domain-identity-capture.mjs [--port 5197]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const OUT = join(root, 'docs/qa/evidence/kenos-uiux-rescue/p5-knife4-domain-identity')
mkdirSync(OUT, { recursive: true })

function arg(flag, fallback = '') {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const BASE = `http://127.0.0.1:${arg('--port', '5197')}`
const EXPECT = {
  training: '#C45C4A',
  plan: '#C9A227',
  money: '#3D9B6E',
  music: '#8B7EC8',
  home: '#6B7C8F',
  knowledge: '#5B6BBF',
  work: '#5B7C99',
  'work-focus': '#5B7C99',
}

async function seed(page, path = '/spaces?kenosDemo=1') {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
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
  await page.waitForTimeout(400)
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

    const spacesProbe = await page.evaluate((expect) => {
      const rows = [...document.querySelectorAll('[data-space-id]')]
      return rows.map((row) => {
        const id = row.getAttribute('data-space-id')
        const rail = row.querySelector('.accent')
        const icon = row.querySelector('.space-icon')
        return {
          id,
          railBg: rail ? getComputedStyle(rail).backgroundColor : null,
          hasIconSvg: Boolean(icon?.querySelector('svg')),
          expected: expect[id] || null,
        }
      })
    }, EXPECT)

    const fileSpaces = `spaces-${vp.id}.png`
    await page.screenshot({ path: join(OUT, fileSpaces), fullPage: false })

    await page.goto(`${BASE}/?kenosDemo=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(350)
    const fileToday = `today-spaces-${vp.id}.png`
    await page.screenshot({ path: join(OUT, fileToday), fullPage: false })
    const todayProbe = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Kenos Spaces"]')
      const rows = nav ? [...nav.querySelectorAll('a')] : []
      return {
        count: rows.length,
        withRail: rows.filter((a) => a.querySelector('.accent')).length,
        withIcon: rows.filter((a) => a.querySelector('svg')).length,
      }
    })

    const preferSidebar = vp.w >= 900
    const sel = preferSidebar
      ? '[data-testid="kenos-space-switcher-sidebar"]'
      : '[data-testid="kenos-space-switcher-fab"], [data-testid="kenos-space-switcher-trigger"]'
    const trigger = page.locator(sel).first()
    if (await trigger.count()) {
      await trigger.click({ force: true }).catch(() => {})
      await page.waitForSelector('.space-switcher-sheet-bg', { timeout: 5000 }).catch(() => {})
      const toggle = page.locator('.all-toggle').first()
      if (await toggle.count()) await toggle.click({ force: true }).catch(() => {})
      await page.waitForTimeout(400)
    }
    const fileContinue = `continue-all-${vp.id}.png`
    await page.screenshot({ path: join(OUT, fileContinue), fullPage: false })
    const continueProbe = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.space-switcher-sheet .item')]
      return {
        itemCount: items.length,
        withIcon: items.filter((li) => li.querySelector('.row-icon svg')).length,
      }
    })

    const expectedRows = spacesProbe.filter((r) => r.expected)
    const iconOk = expectedRows.every((r) => r.hasIconSvg)
    const distinctRails = new Set(expectedRows.map((r) => r.railBg)).size
    const row = {
      vp: vp.id,
      files: { spaces: fileSpaces, today: fileToday, continue: fileContinue },
      spacesProbe,
      todayProbe,
      continueProbe,
      iconOk,
      distinctRails,
    }
    shots.push(row)
    if (!iconOk || distinctRails < 5 || todayProbe.withIcon < 3) {
      failures.push({
        vp: vp.id,
        iconOk,
        distinctRails,
        todayProbe,
      })
    }
    console.log(
      `${failures.some((f) => f.vp === vp.id) ? '✗' : '✓'} ${vp.id} icons=${iconOk} distinctRails=${distinctRails} todayIcons=${todayProbe.withIcon}`,
    )
    await ctx.close()
  }
} finally {
  await browser.close()
}

const manifest = {
  capturedAt: new Date().toISOString(),
  knife: '4-domain-identity',
  base: BASE,
  expect: EXPECT,
  shots,
  failures,
  pass: failures.length === 0,
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(
  join(OUT, 'README.md'),
  `# P5 Knife 4 — Spaces domain identity

**Date:** ${manifest.capturedAt.slice(0, 10)}  
**Result:** ${manifest.pass ? 'PASS' : 'FAIL'}  
**Continuity:** untouched · Owner Review **NOT OPEN** · Visual **IN_PROGRESS**

## Identity tokens (≠ status / \`--critical\`)

| Space | Accent | Glyph |
| ----- | ------ | ----- |
| Training | #C45C4A warm coral | activity |
| Plan | #C9A227 amber | list-todo |
| Money | #3D9B6E green | wallet |
| Music | #8B7EC8 violet | music |
| Home | #6B7C8F blue-gray | home |
| Knowledge | #5B6BBF indigo | notebook |
| Work | #5B7C99 neutral blue | briefcase / focus |

Applied only as: 3px rail · glyph tint · faint hover/current tint.

Capture: \`node scripts/qa/kenos-knife4-domain-identity-capture.mjs\`
`,
)
console.log(manifest.pass ? 'PASS' : 'FAIL', OUT)
process.exit(manifest.pass ? 0 : 1)
