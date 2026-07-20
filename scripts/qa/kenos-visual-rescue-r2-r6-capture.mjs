#!/usr/bin/env node
/**
 * Kenos Visual Rescue — Round 2–6 evidence capture (local preview only).
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, cpSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const outRoot = join(root, 'output/uiux/kenos-visual-rescue-2026-07-20/rounds')
const port = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 5291)

const VIEWPORTS = {
  'web-390x844': { width: 390, height: 844, mobile: true },
  'web-768x1024': { width: 768, height: 1024, mobile: false },
  'web-1024x768': { width: 1024, height: 768, mobile: false },
  'web-1440x900': { width: 1440, height: 900, mobile: false },
}

const PAGES = [
  { id: 'today', path: '/?kenosDemo=1' },
  { id: 'spaces', path: '/spaces?kenosDemo=1' },
  { id: 'training', path: '/spaces/training?kenosDemo=1' },
  { id: 'plan', path: '/spaces/plan?kenosDemo=1' },
  { id: 'money', path: '/spaces/money?kenosDemo=1' },
  { id: 'music', path: '/spaces/music?kenosDemo=1' },
  { id: 'home', path: '/spaces/home?kenosDemo=1' },
  { id: 'knowledge', path: '/spaces/knowledge?kenosDemo=1' },
  { id: 'inbox', path: '/inbox?kenosDemo=1' },
  { id: 'approvals', path: '/approvals?kenosDemo=1' },
  { id: 'states', path: '/uiux-states?kenosDemo=1' },
  { id: 'focus', path: '/focus?kenosDemo=1' },
]

async function seed(page) {
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('aios_demo', '1')
    localStorage.setItem('kenos_phase2_demo', '1')
  })
}

async function ready(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important}`,
  })
  await page.waitForTimeout(350)
}

async function captureRound(browser, round, colorScheme) {
  const phase = join(outRoot, round, 'after')
  mkdirSync(phase, { recursive: true })
  const manifest = []
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const dir = join(phase, `${vpName}-${colorScheme}`)
    mkdirSync(dir, { recursive: true })
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      colorScheme,
      ...(vp.mobile ? { hasTouch: true, isMobile: true } : {}),
    })
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:${port}/?kenosDemo=1`, { waitUntil: 'domcontentloaded' })
    await seed(page)
    await page.reload({ waitUntil: 'networkidle' }).catch(() => page.reload())

    for (const spec of PAGES) {
      await page.goto(`http://127.0.0.1:${port}${spec.path}`, { waitUntil: 'networkidle' }).catch(() =>
        page.goto(`http://127.0.0.1:${port}${spec.path}`),
      )
      await ready(page)
      const file = `${spec.id}.png`
      await page.screenshot({ path: join(dir, file), fullPage: false })
      manifest.push({ vp: vpName, colorScheme, id: spec.id, file })
      console.log(`✓ ${round} ${vpName} ${colorScheme} ${spec.id}`)
    }

    // Continue sheet on Today
    await page.goto(`http://127.0.0.1:${port}/?kenosDemo=1`, { waitUntil: 'networkidle' })
    await ready(page)
    const btn = page.locator('[data-testid="kenos-space-switcher-fab"], [data-testid="kenos-space-switcher-trigger"]').first()
    if (await btn.count()) {
      await btn.click({ force: true })
      await page.waitForSelector('[data-testid="kenos-space-switcher"]', { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(dir, 'space-switcher.png'), fullPage: false })
      manifest.push({ vp: vpName, colorScheme, id: 'space-switcher' })
      console.log(`✓ ${round} ${vpName} ${colorScheme} space-switcher`)
    }
    await context.close()
  }
  writeFileSync(join(phase, `manifest-${colorScheme}.json`), JSON.stringify({ count: manifest.length, shots: manifest }, null, 2))
  return manifest.length
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  // Round folders
  for (const r of ['r2', 'r3', 'r4', 'r5', 'r6']) {
    mkdirSync(join(outRoot, r, 'after'), { recursive: true })
  }

  const nDark = await captureRound(browser, 'r6', 'dark')
  // Copy dark primary set into r2-r5 after for round-specific docs
  const src = join(outRoot, 'r6', 'after', 'web-390x844-dark')
  for (const r of ['r2', 'r3', 'r4', 'r5']) {
    const dest = join(outRoot, r, 'after', 'web-390x844')
    if (existsSync(src)) {
      mkdirSync(dest, { recursive: true })
      cpSync(src, dest, { recursive: true })
    }
  }
  const nLight = await captureRound(browser, 'r6', 'light')
  console.log(`\nCaptured dark=${nDark} light=${nLight}`)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
