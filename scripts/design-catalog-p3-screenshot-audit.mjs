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
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BASE_URL = process.env.DESIGN_CATALOG_URL ?? 'http://127.0.0.1:5190'
const OUT_DIR = path.join(
  ROOT,
  'screenshots',
  'design-catalog',
  `p3-audit-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
)

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
          const appAttr = await page.getByTestId('catalog-shell').getAttribute('data-app')
          const modeAttr = await page.getByTestId('catalog-shell').getAttribute('data-mode')
          ok =
            appAttr === app &&
            modeAttr === mode &&
            errors.length === 0
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
