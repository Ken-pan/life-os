#!/usr/bin/env node
/**
 * Four-knife rescue capture — full-size shots only (no contact sheet).
 * Proves empty bridges gone; captures Continue + Desktop Web; labels macOS as N/A.
 *
 *   node scripts/qa/kenos-visual-four-knife-capture.mjs --port 5291
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const outDir = join(root, 'docs/qa/evidence/kenos-uiux-rescue/four-knife')

function arg(flag, fallback = '') {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const port = Number(arg('--port', '5291'))
const base = `http://127.0.0.1:${port}`

const VIEWPORTS = {
  ios: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
}

const AIOS = [
  { id: 'ios-today', path: '/?kenosDemo=1', vp: 'ios' },
  { id: 'ios-spaces', path: '/spaces?kenosDemo=1', vp: 'ios' },
  { id: 'ios-inbox', path: '/inbox?kenosDemo=1', vp: 'ios' },
  { id: 'ios-continue', path: '/?kenosDemo=1', vp: 'ios', openContinue: true },
  { id: 'desktop-today', path: '/?kenosDemo=1', vp: 'desktop' },
  { id: 'desktop-spaces', path: '/spaces?kenosDemo=1', vp: 'desktop' },
  {
    id: 'desktop-continue',
    path: '/?kenosDemo=1',
    vp: 'desktop',
    openContinue: true,
  },
  // Prove bridge pages do not render product placeholder UI
  {
    id: 'bridge-gone-plan',
    path: '/spaces/plan?kenosDemo=1',
    vp: 'ios',
    assertNoBridge: true,
  },
]

async function seed(page) {
  await page.addInitScript(() => {
    localStorage.setItem('aios_demo', '1')
    localStorage.setItem('kenos_phase2_demo', '1')
  })
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  await page.addStyleTag({
    content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
  })
  await page.waitForTimeout(500)
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const manifest = []

  for (const shot of AIOS) {
    const vp = VIEWPORTS[shot.vp]
    const context = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: shot.vp === 'ios' ? 2 : 1,
      isMobile: shot.vp === 'ios',
      hasTouch: shot.vp === 'ios',
    })
    await seed(context)
    const page = await context.newPage()
    // Prevent popup tabs during bridge redirect proof
    page.on('popup', async (p) => {
      await p.close().catch(() => {})
    })
    await page.goto(`${base}${shot.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await settle(page)

    if (shot.assertNoBridge) {
      const hasBridge = await page
        .locator('[data-testid^="domain-bridge-"]')
        .count()
      const hasTech =
        (await page.getByText('shell-integrated').count()) +
        (await page.getByText('state-restored deep link').count()) +
        (await page.getByText('非真正嵌入').count())
      manifest.push({
        id: shot.id,
        bridgeNodes: hasBridge,
        engineeringCopyHits: hasTech,
        note:
          hasBridge || hasTech
            ? 'FAIL still shows bridge UI'
            : 'PASS no bridge product UI',
      })
      // Still screenshot whatever is on screen (launch flash or spaces)
    }

    if (shot.openContinue) {
      const btn = page
        .getByTestId('kenos-space-switcher-fab')
        .or(page.getByTestId('kenos-space-switcher-trigger'))
        .or(page.getByTestId('kenos-space-switcher-sidebar'))
      await btn
        .first()
        .click({ timeout: 5000 })
        .catch(() => {})
      await page.waitForTimeout(400)
    }

    const file = join(outDir, `${shot.id}.png`)
    await page.screenshot({ path: file, fullPage: false })
    manifest.push({ id: shot.id, file, viewport: vp })
    await context.close()
  }

  // Domain apps if ports live — optional
  for (const domain of [
    { id: 'fitness-home', url: 'https://training.kenos.space/', vp: 'ios' },
    {
      id: 'fitness-active',
      url: 'https://training.kenos.space/day/chest/focus',
      vp: 'ios',
    },
    {
      id: 'planner-list',
      url: 'https://plan.kenos.space/upcoming',
      vp: 'ios',
    },
    {
      id: 'desktop-fitness',
      url: 'https://training.kenos.space/',
      vp: 'desktop',
    },
    {
      id: 'desktop-planner',
      url: 'https://plan.kenos.space/upcoming',
      vp: 'desktop',
    },
  ]) {
    try {
      const vp = VIEWPORTS[domain.vp]
      const context = await browser.newContext({
        viewport: vp,
        deviceScaleFactor: domain.vp === 'ios' ? 2 : 1,
      })
      const page = await context.newPage()
      const res = await page.goto(domain.url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      if (!res || res.status() >= 400) {
        manifest.push({
          id: domain.id,
          skipped: true,
          reason: `HTTP ${res?.status()}`,
        })
        await context.close()
        continue
      }
      await settle(page)
      const file = join(outDir, `${domain.id}.png`)
      await page.screenshot({ path: file, fullPage: false })
      manifest.push({
        id: domain.id,
        file,
        note: 'Domain app (not Kenos shell) — honest deep-link surface',
      })
      await context.close()
    } catch (err) {
      manifest.push({
        id: domain.id,
        skipped: true,
        reason: String(err?.message || err),
      })
    }
  }

  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        aiosBase: base,
        macosNative: 'NOT_VALIDATED',
        status: 'IN_PROGRESS',
        shots: manifest,
      },
      null,
      2,
    ),
  )
  await browser.close()
  console.log(`Wrote ${outDir}`)
  console.log(JSON.stringify(manifest, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
