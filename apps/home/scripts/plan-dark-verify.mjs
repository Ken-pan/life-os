import { chromium } from 'playwright'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5197'
const { dir: OUT } = resolveScreenshotDir({
  app: 'home',
  suite: 'plan-dark-verify',
  importMetaUrl: import.meta.url,
  runId: process.env.QA_RUN_ID ?? '20260708',
})

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/plan?studio=1`, { waitUntil: 'networkidle' })
await page.evaluate(() =>
  document.documentElement.setAttribute('data-theme', 'dark'),
)
await page.waitForSelector('.floor-plan-svg', { timeout: 15000 })
await page.waitForTimeout(500)
await page
  .locator('.plan-stage')
  .screenshot({ path: join(OUT, 'dark-mode-plan-island.png') })
const paper = await page.evaluate(
  () =>
    getComputedStyle(document.querySelector('.plan-viewer')).backgroundColor,
)
const furn = await page.evaluate(
  () => getComputedStyle(document.querySelector('.furn-item')).fill,
)
console.log('plan-viewer bg:', paper)
console.log('furn fill:', furn)
await browser.close()
