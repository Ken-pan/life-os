#!/usr/bin/env node
/**
 * Ad-hoc P3 component screenshot audit for design-catalog (not committed baselines).
 *
 * Usage:
 *   npm run build -w design-catalog && node scripts/design-catalog-p3-screenshot-audit.mjs
 *   # or with dev server already on 5190:
 *   DESIGN_CATALOG_URL=http://127.0.0.1:5190 node scripts/design-catalog-p3-screenshot-audit.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { formatRunId, resolveScreenshotDir } from './qa/screenshot-output.mjs'

const BASE_URL = process.env.DESIGN_CATALOG_URL ?? 'http://127.0.0.1:5190'
const { dir: OUT_DIR } = resolveScreenshotDir({
  app: 'design-catalog',
  suite: 'p3-audit',
  importMetaUrl: import.meta.url,
  runId: process.env.QA_RUN_ID ?? formatRunId().slice(0, 8),
})

const APPS = ['planner', 'fitness', 'finance', 'music']
const MODES = ['light', 'dark']
/** P3 shared component showcases */
const SHOWCASES = [
  'buttons',
  'segments',
  'utilities',
  'settings',
  'navigation',
  'feedback',
  'toast',
  'cards',
]

function catalogUrl(showcase, app, mode, viewport = 'desktop') {
  return `${BASE_URL}/?showcase=${showcase}&app=${app}&mode=${mode}&viewport=${viewport}`
}

/** @param {import('@playwright/test').Page} page */
async function assertCatalogTheme(page, app, mode, errors) {
  const { htmlApp, htmlMode } = await page.evaluate(() => ({
    htmlApp: document.documentElement.dataset.app ?? '',
    htmlMode: document.documentElement.dataset.mode ?? '',
  }))
  if (htmlApp !== app) errors.push(`html data-app=${htmlApp} expected ${app}`)
  if (htmlMode !== mode)
    errors.push(`html data-mode=${htmlMode} expected ${mode}`)
}

/** @param {import('@playwright/test').Page} page */
async function assertShowcaseVisuals(page, showcase, errors) {
  if (showcase === 'buttons') {
    const primaryBg = await page
      .locator('.btn-primary')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    if (!primaryBg || primaryBg === 'rgba(0, 0, 0, 0)') {
      errors.push('btn-primary background is transparent')
    }
    const dangerUsesCritical = await page.evaluate(() => {
      const danger = document.querySelector('.btn-danger')
      if (!danger) return false
      const probe = document.createElement('span')
      probe.style.color = 'var(--critical)'
      document.body.appendChild(probe)
      const criticalRgb = getComputedStyle(probe).color
      document.body.removeChild(probe)
      return getComputedStyle(danger).color === criticalRgb
    })
    if (!dangerUsesCritical) {
      errors.push('btn-danger color does not match --critical')
    }
  }

  if (showcase === 'toast' || showcase === 'feedback') {
    const box = await page.locator('.toast').first().boundingBox()
    if (!box || box.height < 12)
      errors.push('toast has no visible height in showcase')
  }

  if (showcase === 'feedback') {
    const banner = page.locator('.banner.critical').first()
    const box = await banner.boundingBox()
    if (!box || box.height < 12)
      errors.push('critical banner has no visible height')
  }
}

/** @type {{ showcase: string, app: string, mode: string, ok: boolean, testId?: string, errors: string[] }[]} */
const report = []

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()

  for (const showcase of SHOWCASES) {
    for (const app of APPS) {
      for (const mode of MODES) {
        const errors = []
        page.removeAllListeners('console')
        page.on('console', (msg) => {
          if (msg.type() === 'error') errors.push(msg.text())
        })

        const url = catalogUrl(showcase, app, mode)
        const testId = `showcase-${showcase}`
        let ok = false

        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
          const el = page.getByTestId(testId)
          await el.waitFor({ state: 'visible', timeout: 10_000 })
          const appAttr = await page
            .getByTestId('catalog-shell')
            .getAttribute('data-app')
          const modeAttr = await page
            .getByTestId('catalog-shell')
            .getAttribute('data-mode')
          await assertCatalogTheme(page, app, mode, errors)
          await assertShowcaseVisuals(page, showcase, errors)
          ok = appAttr === app && modeAttr === mode && errors.length === 0
          const file = path.join(OUT_DIR, `${showcase}__${app}__${mode}.png`)
          await el.screenshot({ path: file })
        } catch (err) {
          errors.push(String(err))
        }

        report.push({ showcase, app, mode, ok, testId, errors })
        const mark = ok ? 'OK' : 'FAIL'
        console.log(`${mark}  ${showcase} / ${app} / ${mode}`)
      }
    }
  }

  await browser.close()

  const passed = report.filter((r) => r.ok).length
  const failed = report.filter((r) => !r.ok)
  const summary = {
    generatedAt: new Date().toISOString(),
    baseURL: BASE_URL,
    outDir: OUT_DIR,
    total: report.length,
    passed,
    failed: failed.length,
    failures: failed,
  }

  await writeFile(
    path.join(OUT_DIR, 'report.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  )

  console.log(`\nScreenshots → ${OUT_DIR}`)
  console.log(`Report: ${passed}/${report.length} passed`)
  if (failed.length) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
