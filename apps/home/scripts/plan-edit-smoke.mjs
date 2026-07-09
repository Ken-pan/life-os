/**
 * Wall graph edit smoke test for /plan.
 * Usage: node apps/home/scripts/plan-edit-smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5197'
const SKEY = 'homeos_spatial_v1'
const isMac = process.platform === 'darwin'

/** @typedef {{ name: string, ok: boolean, detail: string }} Row */

/** @param {import('playwright').Page} page */
async function prime(page) {
  await page.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    /** @type {import('../src/lib/spatial/types.js').WallGraph} */
    const graph = {
      pxPerFt: 36,
      margin: { x: 40, y: 40 },
      vertices: [
        { id: 'v-smoke-1', x: 120, y: 120 },
        { id: 'v-smoke-2', x: 360, y: 120 },
      ],
      edges: [
        { id: 'wg-smoke-1', a: 'v-smoke-1', b: 'v-smoke-2', exterior: false },
      ],
    }
    const raw = localStorage.getItem(key)
    const base = raw
      ? JSON.parse(raw)
      : { settings: {}, projects: {}, activeProjectId: 'avalon-508' }
    const pid = base.activeProjectId ?? 'avalon-508'
    const proj = base.projects?.[pid] ?? {}
    base.projects[pid] = {
      ...proj,
      layoutMode: 'wallGraph',
      wallGraph: graph,
    }
    localStorage.removeItem('homeos_wall_graph_undo_v1')
    localStorage.setItem(key, JSON.stringify(base))
  }, SKEY)
  await page.reload({ waitUntil: 'networkidle' })
}

/** @param {import('playwright').Page} page */
async function edgeCount(page) {
  return page.locator('[data-edge-id]').count()
}

/** @param {import('playwright').Page} page @param {number} svgX @param {number} svgY */
async function clickSvg(page, svgX, svgY) {
  const screen = await svgToScreen(page, svgX, svgY)
  if (!screen) throw new Error('clickSvg: missing svg')
  await page.mouse.click(screen.x, screen.y)
}

/** @param {import('playwright').Page} page @param {number} svgX @param {number} svgY */
async function svgToScreen(page, svgX, svgY) {
  return page.evaluate(
    ({ x, y }) => {
      const svg = document.querySelector('.floor-plan-svg')
      if (!svg) return null
      const pt = svg.createSVGPoint()
      pt.x = x
      pt.y = y
      const ctm = svg.getScreenCTM()
      if (!ctm) return null
      const p = pt.matrixTransform(ctm)
      return { x: p.x, y: p.y }
    },
    { x: svgX, y: svgY },
  )
}

/** @param {import('playwright').Page} page */
async function firstOpeningOffset(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw)
    const pid = data.activeProjectId ?? 'avalon-508'
    const proj = data.projects?.[pid]
    return proj?.graphOpenings?.[0]?.offsetIn ?? null
  }, SKEY)
}

/** @param {import('playwright').Page} page */
async function firstOpeningType(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw)
    const pid = data.activeProjectId ?? 'avalon-508'
    const proj = data.projects?.[pid]
    return proj?.graphOpenings?.[0]?.type ?? null
  }, SKEY)
}

/** @param {import('playwright').Page} page @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
async function dragSvg(page, x1, y1, x2, y2) {
  const from = await svgToScreen(page, x1, y1)
  const to = await svgToScreen(page, x2, y2)
  if (!from || !to) throw new Error('dragSvg: missing svg')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.waitForTimeout(120)
  await page.mouse.up()
}

/** @param {import('playwright').Page} page */
async function enterGraphEdit(page) {
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '建墙', exact: true }).click()
  await page.waitForTimeout(200)
}

/** @param {import('playwright').Page} page */
async function zoneCount(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const data = JSON.parse(raw)
    const pid = data.activeProjectId ?? 'avalon-508'
    return data.projects?.[pid]?.zones?.length ?? 0
  }, SKEY)
}

/** @param {import('playwright').Page} page */
async function firstZoneStale(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw)
    const pid = data.activeProjectId ?? 'avalon-508'
    return data.projects?.[pid]?.zones?.[0]?.stale ?? null
  }, SKEY)
}

/** @param {import('playwright').Page} page */
async function placementCount(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const data = JSON.parse(raw)
    const pid = data.activeProjectId ?? 'avalon-508'
    return data.projects?.[pid]?.placements?.length ?? 0
  }, SKEY)
}

/** @param {import('playwright').Page} page */
async function storageS1Assigned(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return false
    const data = JSON.parse(raw)
    const pid = data.activeProjectId ?? 'avalon-508'
    const sz = data.projects?.[pid]?.storageZones?.find((z) => z.code === 'S1')
    return Boolean(sz?.placementId || sz?.zoneId)
  }, SKEY)
}

/** @param {import('playwright').Page} page */
async function enterZoneEdit(page) {
  await page.getByRole('button', { name: '② 划分', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '画区', exact: true }).click()
  await page.waitForTimeout(200)
}

/** @param {import('playwright').Page} page */
async function enterPlaceEdit(page) {
  await page.getByRole('button', { name: '③ 布置', exact: true }).click()
  await page.waitForTimeout(300)
}

/** @param {import('playwright').Page} page */
async function graphOpeningCount508(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const data = JSON.parse(raw)
    const pid = data.activeProjectId ?? 'avalon-508'
    return data.projects?.[pid]?.graphOpenings?.length ?? 0
  }, SKEY)
}

/** @param {import('playwright').Page} page */
async function prime508Full(page) {
  await page.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.removeItem(key)
    localStorage.removeItem('homeos_wall_graph_undo_v1')
  }, SKEY)
  await page.reload({ waitUntil: 'networkidle' })
}

/** @param {import('playwright').Page} page @param {number} times */
async function undo(page, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(isMac ? 'Meta+z' : 'Control+z')
    await page.waitForTimeout(250)
  }
}

/** @param {import('playwright').Page} page */
async function doorPathCount(page) {
  return page.locator('.floor-plan-svg path.door').count()
}

/** @param {import('playwright').Page} page */
async function graphOpeningCount(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const data = JSON.parse(raw)
    const pid = data.activeProjectId ?? 'avalon-508'
    const proj = data.projects?.[pid]
    return proj?.graphOpenings?.length ?? 0
  }, SKEY)
}

/** @type {Row[]} */
const rows = []
let failures = 0

/** @param {Row} row */
function push(row) {
  rows.push(row)
  if (!row.ok) failures++
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 900 })

await prime(page)
await enterGraphEdit(page)
const initial = await edgeCount(page)
push({
  name: 'prime wallGraph',
  ok: initial === 1,
  detail: `edges=${initial}`,
})

await page.getByRole('button', { name: '建墙', exact: true }).click()
await page.waitForTimeout(200)
await clickSvg(page, 120, 120)
await page.waitForTimeout(150)
await clickSvg(page, 120, 360)
await page.waitForTimeout(400)

const afterAdd = await edgeCount(page)
push({
  name: 'wallAdd +1 edge',
  ok: afterAdd === initial + 1,
  detail: `${initial} → ${afterAdd}`,
})

await page.getByRole('button', { name: '门窗', exact: true }).click()
await page.waitForTimeout(200)
await clickSvg(page, 240, 120)
await page.waitForTimeout(400)

const openingsAfterPlace = await graphOpeningCount(page)
const doorsAfterPlace = await doorPathCount(page)
push({
  name: 'opening place on wall',
  ok: openingsAfterPlace >= 1 && doorsAfterPlace >= 1,
  detail: `graphOpenings=${openingsAfterPlace} doors=${doorsAfterPlace}`,
})

const offsetBeforeDrag = await firstOpeningOffset(page)
await page.getByRole('button', { name: '选择', exact: true }).click()
await page.waitForTimeout(200)
await dragSvg(page, 240, 120, 300, 120)
await page.waitForTimeout(400)
const offsetAfterDrag = await firstOpeningOffset(page)
push({
  name: 'opening drag along wall',
  ok:
    offsetBeforeDrag != null &&
    offsetAfterDrag != null &&
    offsetAfterDrag > offsetBeforeDrag,
  detail: `${offsetBeforeDrag} → ${offsetAfterDrag}`,
})

await page.getByRole('button', { name: '改窗', exact: true }).click()
await page.waitForTimeout(300)
const typeAfterToggle = await firstOpeningType(page)
push({
  name: 'toggle door to window',
  ok: typeAfterToggle === 'window',
  detail: `type=${typeAfterToggle}`,
})

await page.getByRole('button', { name: '删墙', exact: true }).click()
await page.waitForTimeout(200)
await clickSvg(page, 240, 120)
await page.waitForTimeout(400)

const afterRemove = await edgeCount(page)
const openingsAfterWallDelete = await graphOpeningCount(page)
push({
  name: 'remove wall cascades opening',
  ok: afterRemove === initial && openingsAfterWallDelete === 0,
  detail: `edges=${afterRemove} graphOpenings=${openingsAfterWallDelete}`,
})

await undo(page, 2)
await page.waitForTimeout(400)
const afterUndo = await edgeCount(page)
push({
  name: 'undo x2 restore edges',
  ok: afterUndo === afterAdd,
  detail: `${afterRemove} → ${afterUndo}`,
})

await page.reload({ waitUntil: 'networkidle' })
await enterGraphEdit(page)
await page.waitForTimeout(300)
const afterReload = await edgeCount(page)
push({
  name: 'persist after reload',
  ok: afterReload === afterAdd,
  detail: `edges=${afterReload}`,
})

await enterZoneEdit(page)
await clickSvg(page, 100, 100)
await clickSvg(page, 380, 100)
await clickSvg(page, 380, 200)
await page.keyboard.press('Enter')
await page.waitForTimeout(500)

const zonesAfterDraw = await zoneCount(page)
push({
  name: 'zone draw 3pt + Enter',
  ok: zonesAfterDraw >= 1,
  detail: `zones=${zonesAfterDraw}`,
})

await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: '编辑', exact: true }).click()
await page.waitForTimeout(300)
const zonesAfterZoneReload = await zoneCount(page)
push({
  name: 'zone persist after reload',
  ok: zonesAfterZoneReload >= 1,
  detail: `zones=${zonesAfterZoneReload}`,
})

await page.getByRole('button', { name: '① 墙体', exact: true }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: '删墙', exact: true }).click()
await page.waitForTimeout(200)
await clickSvg(page, 240, 120)
await page.waitForTimeout(400)
const staleAfterWall = await firstZoneStale(page)
push({
  name: 'zone stale after wall change',
  ok: staleAfterWall === true,
  detail: `stale=${staleAfterWall}`,
})

await enterPlaceEdit(page)
await page.getByRole('button', { name: '家具', exact: true }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: '柜', exact: true }).click()
await page.waitForTimeout(200)
await clickSvg(page, 240, 150)
await page.waitForTimeout(400)
const placementsAfter = await placementCount(page)
push({
  name: 'placement add cabinet',
  ok: placementsAfter >= 1,
  detail: `placements=${placementsAfter}`,
})

await page.getByRole('button', { name: '标储藏', exact: true }).click()
await page.waitForTimeout(200)
const plCenter = await page.evaluate((key) => {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  const data = JSON.parse(raw)
  const pid = data.activeProjectId ?? 'avalon-508'
  const p = data.projects?.[pid]?.placements?.[0]
  if (!p) return null
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 }
}, SKEY)
if (plCenter) await clickSvg(page, plCenter.x, plCenter.y)
await page.waitForTimeout(300)
await page.locator('.storage-picker').waitFor({ state: 'visible', timeout: 5000 })
await page.locator('.storage-picker-btn').filter({ hasText: 'S1' }).click()
await page.waitForTimeout(400)
const s1Assigned = await storageS1Assigned(page)
push({
  name: 'storage assign S1 to placement',
  ok: s1Assigned,
  detail: `assigned=${s1Assigned}`,
})

await browser.close()

console.log('\n=== Plan edit smoke test ===\n')
for (const r of rows) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  —  ${r.detail}`)
}
console.log(`\n${rows.length} checks, ${failures} failures\n`)
process.exit(failures > 0 ? 1 : 0)
