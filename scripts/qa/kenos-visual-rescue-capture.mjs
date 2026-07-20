#!/usr/bin/env node
/**
 * Kenos Visual Quality Rescue — individual page capture (not contact-sheet only).
 *
 * Captures stable demo pages at fixed viewports into:
 *   output/uiux/kenos-visual-rescue-YYYY-MM-DD/<phase>/<viewport>/
 *
 * Usage:
 *   node scripts/qa/kenos-visual-rescue-capture.mjs --phase baseline
 *   node scripts/qa/kenos-visual-rescue-capture.mjs --phase baseline --only web
 *   node scripts/qa/kenos-visual-rescue-capture.mjs --phase baseline --port 5291
 */
import { chromium, devices } from 'playwright'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const DATE = '2026-07-20'
const outRoot = join(root, 'output/uiux', `kenos-visual-rescue-${DATE}`)

function arg(flag, fallback = '') {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const phase = arg('--phase', 'baseline')
const only = arg('--only', 'web') // web | all
const preferredPort = Number(arg('--port', '5291'))

const VIEWPORTS = {
  'web-390x844': { width: 390, height: 844, mobile: true },
  'web-768x1024': { width: 768, height: 1024, mobile: false },
  'web-1024x768': { width: 1024, height: 768, mobile: false },
  'web-1440x900': { width: 1440, height: 900, mobile: false },
}

/** Stable Kenos demo routes (non-auth). */
const AIOS_PAGES = [
  { id: 'today', path: '/?kenosDemo=1' },
  { id: 'assistant', path: '/assistant?kenosDemo=1' },
  { id: 'spaces', path: '/spaces?kenosDemo=1' },
  { id: 'inbox', path: '/inbox?kenosDemo=1' },
  { id: 'approvals', path: '/approvals?kenosDemo=1' },
  { id: 'activity', path: '/activity?kenosDemo=1' },
  { id: 'training', path: '/spaces/training?kenosDemo=1' },
  { id: 'work', path: '/work?kenosDemo=1' },
  { id: 'focus', path: '/focus?kenosDemo=1' },
]

const DOMAIN_PAGES = [
  { app: 'planner', id: 'planner-home', path: '/', port: 5188, workspace: 'planner-os' },
  { app: 'fitness', id: 'fitness-home', path: '/', port: 5189, workspace: 'fitness-os' },
  { app: 'finance', id: 'finance-today', path: '/home/today', port: 5190, workspace: 'finance-os', seed: 'fos_demo' },
  { app: 'music', id: 'music-home', path: '/', port: 5191, workspace: 'music-os' },
  { app: 'home', id: 'home-plan', path: '/plan', port: 5192, workspace: 'home-os' },
]

async function seedKenos(page) {
  await page.evaluate(() => {
    localStorage.setItem('aios_demo', '1')
    localStorage.setItem('kenos_phase2_demo', '1')
  })
}

async function waitReady(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  // Disable CSS animations for stable shots
  await page.addStyleTag({
    content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
  })
  await page.waitForTimeout(400)
}

async function captureAios(browser, port) {
  const manifest = []
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const dir = join(outRoot, phase, vpName)
    mkdirSync(dir, { recursive: true })
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
      ...(vp.mobile ? { hasTouch: true, isMobile: true } : {}),
    })
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await seedKenos(page)

    for (const spec of AIOS_PAGES) {
      const url = `http://127.0.0.1:${port}${spec.path}`
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() =>
        page.goto(url, { waitUntil: 'domcontentloaded' }),
      )
      await waitReady(page)
      const file = `${spec.id}.png`
      const path = join(dir, file)
      await page.screenshot({ path, fullPage: false })
      manifest.push({ viewport: vpName, id: spec.id, path: `${phase}/${vpName}/${file}`, url: spec.path })
      console.log(`✓ ${vpName} ${spec.id}`)
    }

    // Space Switcher open state on Today
    await page.goto(`http://127.0.0.1:${port}/?kenosDemo=1`, { waitUntil: 'domcontentloaded' })
    await seedKenos(page)
    await waitReady(page)
    const trigger = page.locator('[data-testid="kenos-space-switcher-sidebar"], [data-testid="kenos-space-switcher-fab"], [aria-label="Open Space switcher"]').first()
    if (await trigger.count()) {
      try {
        await trigger.click({ force: true, timeout: 3000 })
        await page.waitForTimeout(500)
        const file = 'space-switcher.png'
        await page.screenshot({ path: join(dir, file), fullPage: false })
        manifest.push({ viewport: vpName, id: 'space-switcher', path: `${phase}/${vpName}/${file}` })
        console.log(`✓ ${vpName} space-switcher`)
      } catch (err) {
        console.warn(`✗ ${vpName} space-switcher: ${err.message || err}`)
      }
    }
    await context.close()
  }
  return manifest
}

async function captureDomainDesktop(browser) {
  const dir = join(outRoot, phase, 'web-1440x900-domains')
  mkdirSync(dir, { recursive: true })
  const manifest = []
  // Use existing preview ports if up; otherwise skip with note
  for (const spec of DOMAIN_PAGES) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    })
    const page = await context.newPage()
    const base = `http://127.0.0.1:${spec.port}`
    try {
      const res = await page.goto(`${base}${spec.path}`, { waitUntil: 'domcontentloaded', timeout: 8000 })
      if (!res || !res.ok()) throw new Error(`HTTP ${res?.status()}`)
      if (spec.seed === 'fos_demo') {
        await page.evaluate(() => localStorage.setItem('fos_demo', '1'))
        await page.reload({ waitUntil: 'domcontentloaded' })
      }
      await waitReady(page)
      const file = `${spec.id}.png`
      await page.screenshot({ path: join(dir, file), fullPage: false })
      manifest.push({ id: spec.id, path: `${phase}/web-1440x900-domains/${file}`, ok: true })
      console.log(`✓ domain ${spec.id}`)
    } catch (err) {
      manifest.push({ id: spec.id, ok: false, error: String(err.message || err) })
      console.warn(`✗ domain ${spec.id}: ${err.message || err}`)
    }
    await context.close()
  }
  return manifest
}

async function main() {
  mkdirSync(join(outRoot, phase), { recursive: true })
  const browser = await chromium.launch({ headless: true })
  let aiosManifest = []
  if (only === 'web' || only === 'all') {
    aiosManifest = await captureAios(browser, preferredPort)
  }
  const domainManifest = await captureDomainDesktop(browser)
  await browser.close()

  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
  const index = {
    phase,
    sha,
    capturedAt: new Date().toISOString(),
    aios: aiosManifest,
    domains: domainManifest,
  }
  writeFileSync(join(outRoot, phase, 'manifest.json'), JSON.stringify(index, null, 2))
  console.log(`Wrote ${join(outRoot, phase, 'manifest.json')} (${aiosManifest.length} aios shots)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
