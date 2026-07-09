/**
 * Capture plan page states for UX audit vs network research checklist.
 * Usage: node apps/home/scripts/plan-state-screenshots.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const BASE = process.argv[2] ?? 'https://home.kenos.space'
const { dir: OUT } = resolveScreenshotDir({
  app: 'home',
  suite: 'plan-audit',
  importMetaUrl: import.meta.url,
  runId: process.env.QA_RUN_ID ?? '20260708',
})
const SKEY = 'homeos_spatial_v1'

mkdirSync(OUT, { recursive: true })

/** @param {import('playwright').Page} page */
async function waitPlanReady(page) {
  await page.waitForSelector('.plan-stage svg, .floor-plan-svg', {
    timeout: 20000,
  })
  await page.waitForTimeout(800)
}

/** @param {import('playwright').Page} page @param {string} name */
async function shot(page, name) {
  const path = join(OUT, `${name}.png`)
  await page.screenshot({ path, fullPage: true })
  console.log('saved', path)
}

/** @param {import('playwright').Page} page @param {boolean} studio @param {'parametric508'|'wallGraph'} layoutMode */
async function primeStorage(page, studio, layoutMode = 'parametric508') {
  await page.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ key, studioOn, mode }) => {
      const raw = localStorage.getItem(key)
      const base = raw
        ? JSON.parse(raw)
        : {
            schemaVersion: 1,
            settings: {
              theme: 'auto',
              locale: 'zh',
              lockPortraitOnPhone: false,
            },
            activeProjectId: 'avalon-508',
            projects: {},
          }
      base.settings = base.settings ?? {}
      base.settings.spatialStudio = studioOn
      const pid = base.activeProjectId ?? 'avalon-508'
      const proj = base.projects?.[pid] ?? { meta: { id: pid } }
      proj.layoutMode = mode
      if (mode === 'parametric508') delete proj.wallGraph
      base.projects = { ...(base.projects ?? {}), [pid]: proj }
      localStorage.setItem(key, JSON.stringify(base))
    },
    { key: SKEY, studioOn: studio, mode: layoutMode },
  )
}

/** @param {import('playwright').Page} page */
async function clickButtonByName(page, name) {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.count()) {
    await btn.first().click()
    await page.waitForTimeout(600)
    return true
  }
  return false
}

const browser = await chromium.launch({ headless: true })
const contexts = [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'mobile', width: 390, height: 844 },
]

try {
  for (const vp of contexts) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.tag === 'mobile' ? 2 : 1,
    })
    const page = await context.newPage()

    // 1) Public browse (studio off, parametric508)
    await primeStorage(page, false, 'parametric508')
    await page.goto(`${BASE}/plan?studio=0`, { waitUntil: 'networkidle' })
    await waitPlanReady(page)
    await shot(page, `${vp.tag}-01-public-browse`)

    // 2) Studio browse + legend expanded
    await primeStorage(page, true, 'parametric508')
    await page.goto(`${BASE}/plan?studio=1`, { waitUntil: 'networkidle' })
    await waitPlanReady(page)
    await shot(page, `${vp.tag}-02-studio-browse`)
    await clickButtonByName(page, '图例')
    await shot(page, `${vp.tag}-03-studio-legend-expanded`)

    // 3) Studio layout edit mode
    const editBtn = page.getByRole('button', { name: '编辑户型', exact: true })
    if (await editBtn.count()) {
      await editBtn.click()
      await waitPlanReady(page)
      await shot(page, `${vp.tag}-04-studio-layout-edit`)
    } else {
      console.warn(`${vp.tag}: 编辑户型 button missing (wallGraph?)`)
    }

    // 4) Studio measure mode
    await page.goto(`${BASE}/plan?studio=1`, { waitUntil: 'networkidle' })
    await waitPlanReady(page)
    if (await clickButtonByName(page, '测距')) {
      await shot(page, `${vp.tag}-05-studio-measure`)
    }

    // 5) Wall graph browse + graph edit (if available)
    await primeStorage(page, true, 'wallGraph')
    await page.goto(`${BASE}/plan?studio=1`, { waitUntil: 'networkidle' })
    await waitPlanReady(page)
    await shot(page, `${vp.tag}-06-studio-wallgraph-browse`)
    if (await clickButtonByName(page, '墙图编辑')) {
      await waitPlanReady(page)
      await shot(page, `${vp.tag}-07-studio-wallgraph-edit`)
    }

    // 6) Hover storage zone (desktop only)
    if (vp.tag === 'desktop') {
      await primeStorage(page, true, 'parametric508')
      await page.goto(`${BASE}/plan?studio=1`, { waitUntil: 'networkidle' })
      await waitPlanReady(page)
      const zone = page.locator('[data-zone="S6"]').first()
      if (await zone.count()) {
        const box = await zone.boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.waitForTimeout(400)
          await shot(page, `${vp.tag}-08-hover-storage-s6`)
        }
      }
      const furn = page.locator('.furn-item').first()
      if (await furn.count()) {
        const box = await furn.boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.waitForTimeout(400)
          await shot(page, `${vp.tag}-09-hover-furniture`)
        }
      }
    }

    await context.close()
  }
} finally {
  await browser.close()
}

console.log('done ->', OUT)
