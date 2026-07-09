import { chromium } from 'playwright'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5197'
const { dir: OUT } = resolveScreenshotDir({
  app: 'home',
  suite: 'plan-fix-verify',
  importMetaUrl: import.meta.url,
  runId: process.env.QA_RUN_ID ?? '20260708',
})
const SKEY = 'homeos_spatial_v1'

/** @param {import('playwright').Page} page */
async function prime(page, studio) {
  await page.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ key, on }) => {
      const raw = localStorage.getItem(key)
      const base = raw
        ? JSON.parse(raw)
        : { settings: {}, projects: {}, activeProjectId: 'avalon-508' }
      base.settings = { ...(base.settings ?? {}), spatialStudio: on }
      const pid = base.activeProjectId ?? 'avalon-508'
      const proj = base.projects?.[pid] ?? {}
      proj.layoutMode = 'parametric508'
      delete proj.wallGraph
      base.projects = { ...(base.projects ?? {}), [pid]: proj }
      localStorage.setItem(key, JSON.stringify(base))
    },
    { key: SKEY, on: studio },
  )
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await prime(page, false)
await page.goto(`${BASE}/plan?studio=0`, { waitUntil: 'networkidle' })
await page.waitForSelector('.floor-plan-svg', { timeout: 15000 })

// public legend
await page.getByRole('button', { name: '图例' }).click()
await page.screenshot({ path: join(OUT, 'public-legend.png'), fullPage: true })

// hover storage + tooltip
const zone = page.locator('[data-zone="S6"]').first()
const box = await zone.boundingBox()
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(350)
}
await page.screenshot({
  path: join(OUT, 'public-hover-s6.png'),
  fullPage: false,
})
const tip = page.locator('.plan-svg-tooltip')
console.log('tooltip visible:', await tip.isVisible())
console.log('tooltip text:', await tip.textContent())

// click S6 navigates
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForURL(/\/storage\?zone=S6/)
console.log('navigated:', page.url())
await page.screenshot({
  path: join(OUT, 'public-click-s6-storage.png'),
  fullPage: true,
})

await prime(page, true)
await page.goto(`${BASE}/plan?studio=1`, { waitUntil: 'networkidle' })
await page.waitForSelector('.furn-item', { timeout: 15000 })
const furn = page.locator('.furn-item').first()
const fb = await furn.boundingBox()
if (fb) {
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
  await page.waitForTimeout(350)
}
await page.screenshot({
  path: join(OUT, 'studio-hover-furniture.png'),
  fullPage: false,
})
const tip2 = page.locator('.plan-svg-tooltip')
console.log('furniture tooltip:', await tip2.textContent())

await page.getByRole('button', { name: '编辑户型' }).click()
await page.waitForTimeout(600)
await page.screenshot({
  path: join(OUT, 'studio-edit-mode.png'),
  fullPage: true,
})

await browser.close()
console.log('done', OUT)
