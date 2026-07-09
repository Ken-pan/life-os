import { chromium } from 'playwright'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const BASE = process.argv[2] ?? 'https://home.kenos.space'
const { dir: OUT } = resolveScreenshotDir({
  app: 'home',
  suite: 'plan-audit-extra',
  importMetaUrl: import.meta.url,
  runId: process.env.QA_RUN_ID ?? '20260708',
})
const SKEY = 'homeos_spatial_v1'

/** @param {import('playwright').Page} page */
async function primeStudio(page) {
  await page.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    const base = raw
      ? JSON.parse(raw)
      : { settings: {}, projects: {}, activeProjectId: 'avalon-508' }
    base.settings = { ...(base.settings ?? {}), spatialStudio: true }
    const pid = base.activeProjectId ?? 'avalon-508'
    const proj = base.projects?.[pid] ?? {}
    proj.layoutMode = 'parametric508'
    delete proj.wallGraph
    base.projects = { ...(base.projects ?? {}), [pid]: proj }
    localStorage.setItem(key, JSON.stringify(base))
  }, SKEY)
}

/** @param {import('playwright').Page} page @param {string} name */
async function shot(page, name) {
  const path = join(OUT, name)
  await page.screenshot({ path, fullPage: false })
  const stage = page.locator('.plan-stage').first()
  if (await stage.count()) {
    await stage.screenshot({
      path: join(OUT, name.replace('.png', '-canvas.png')),
    })
  }
  console.log('saved', name)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()

await primeStudio(page)
await page.goto(`${BASE}/plan?studio=1`, { waitUntil: 'networkidle' })
await page.waitForSelector('.floor-plan-svg', { timeout: 20000 })
await page.getByRole('button', { name: '编辑户型', exact: true }).click()
await page.waitForTimeout(800)

// Select an opening
const opening = page.locator('[data-opening-id="door-bedroom"]').first()
if (await opening.count()) {
  const box = await opening.boundingBox()
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(500)
    await shot(page, 'desktop-10-edit-opening-selected.png')
  }
}

// Drag preview
if (await opening.count()) {
  const box = await opening.boundingBox()
  if (box) {
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 40, y, { steps: 8 })
    await page.waitForTimeout(300)
    await shot(page, 'desktop-11-edit-opening-drag.png')
    await page.mouse.up()
  }
}

// Public legend
await page.goto(`${BASE}/plan?studio=0`, { waitUntil: 'networkidle' })
await page.evaluate((key) => {
  const raw = localStorage.getItem(key)
  if (!raw) return
  const base = JSON.parse(raw)
  base.settings.spatialStudio = false
  localStorage.setItem(key, JSON.stringify(base))
}, SKEY)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.floor-plan-svg', { timeout: 20000 })
await page.getByRole('button', { name: '图例', exact: true }).click()
await page.waitForTimeout(400)
await shot(page, 'desktop-12-public-legend-expanded.png')

await browser.close()
console.log('extra shots done')
