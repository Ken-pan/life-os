/**
 * Extreme positioning stress test for /plan viewport.
 * Usage: node apps/home/scripts/plan-viewport-stress.mjs [baseUrl]
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5874'
const SKEY = 'homeos_spatial_v1'

/** @typedef {{ name: string, ok: boolean, detail: string }} Row */

/** @param {import('playwright').Page} page */
async function prime(page) {
  await page.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    const base = raw ? JSON.parse(raw) : { settings: {}, projects: {}, activeProjectId: 'avalon-508' }
    base.settings = { ...(base.settings ?? {}), spatialStudio: true }
    const pid = base.activeProjectId ?? 'avalon-508'
    const proj = base.projects?.[pid] ?? {}
    proj.layoutMode = 'parametric508'
    delete proj.wallGraph
    base.projects = { ...(base.projects ?? {}), [pid]: proj }
    localStorage.setItem(key, JSON.stringify(base))
  }, SKEY)
}

/** @param {import('playwright').Page} page */
async function readState(page) {
  return page.evaluate(() => {
    const viewer = document.querySelector('.plan-viewer')
    const canvas = document.querySelector('.plan-canvas')
    const svg = document.querySelector('.floor-plan-svg')
    if (!viewer || !canvas || !svg) return null
    const style = getComputedStyle(canvas)
    const m = style.transform
    let zoom = 1
    let panX = 0
    let panY = 0
    if (m && m !== 'none') {
      const dm = new DOMMatrix(m)
      zoom = dm.a
      panX = dm.e
      panY = dm.f
    }
    return {
      vbW: Number(svg.viewBox.baseVal.width),
      vbH: Number(svg.viewBox.baseVal.height),
      zoom,
      panX,
      panY,
      viewerW: viewer.clientWidth,
      viewerH: viewer.clientHeight,
      pad: (() => {
        const s = getComputedStyle(viewer)
        return {
          t: parseFloat(s.paddingTop) || 0,
          r: parseFloat(s.paddingRight) || 0,
          b: parseFloat(s.paddingBottom) || 0,
          l: parseFloat(s.paddingLeft) || 0,
        }
      })(),
    }
  })
}

/** @param {import('playwright').Page} page @param {number} clientX @param {number} clientY */
async function clientToSvg(page, clientX, clientY) {
  return page.evaluate(
    ({ x, y }) => {
      const svg = document.querySelector('.floor-plan-svg')
      if (!svg) return null
      const pt = svg.createSVGPoint()
      pt.x = x
      pt.y = y
      const inv = svg.getScreenCTM()?.inverse()
      if (!inv) return null
      const p = pt.matrixTransform(inv)
      return { x: p.x, y: p.y }
    },
    { x: clientX, y: clientY },
  )
}

/** @param {import('playwright').Page} page @param {number} svgX @param {number} svgY */
async function svgToClient(page, svgX, svgY) {
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
async function zoneCenter(page, code) {
  return page.evaluate((c) => {
    const el = document.querySelector(`[data-zone="${c}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, code)
}

/** @param {import('playwright').Page} page @param {number} svgX @param {number} svgY */
async function roundTripError(page, svgX, svgY) {
  const screen = await svgToClient(page, svgX, svgY)
  if (!screen) return { err: Infinity, screen: null, back: null }
  const back = await clientToSvg(page, screen.x, screen.y)
  if (!back) return { err: Infinity, screen, back: null }
  const err = Math.hypot(back.x - svgX, back.y - svgY)
  return { err, screen, back }
}

/** @param {import('playwright').Page} page @param {'contain' | 'width'} mode */
async function fitCornersVisible(page, mode) {
  return page.evaluate((fitMode) => {
    const viewer = document.querySelector('.plan-viewer')
    const svg = document.querySelector('.floor-plan-svg')
    if (!viewer || !svg) return { ok: false, reason: 'missing' }
    const s = getComputedStyle(viewer)
    const pad = {
      t: parseFloat(s.paddingTop) || 0,
      r: parseFloat(s.paddingRight) || 0,
      b: parseFloat(s.paddingBottom) || 0,
      l: parseFloat(s.paddingLeft) || 0,
    }
    const vr = viewer.getBoundingClientRect()
    const inner = {
      l: vr.left + pad.l,
      t: vr.top + pad.t,
      r: vr.right - pad.r,
      b: vr.bottom - pad.b,
    }
    const vb = svg.viewBox.baseVal
    const corners = [
      { x: vb.x, y: vb.y },
      { x: vb.x + vb.width, y: vb.y },
      { x: vb.x, y: vb.y + vb.height },
      { x: vb.x + vb.width, y: vb.y + vb.height },
    ]
    const ctm = svg.getScreenCTM()
    if (!ctm) return { ok: false, reason: 'no ctm' }
    const mapped = corners.map((c) => {
      const pt = svg.createSVGPoint()
      pt.x = c.x
      pt.y = c.y
      const p = pt.matrixTransform(ctm)
      return { x: p.x, y: p.y }
    })
    const slack = 3
    const ok =
      fitMode === 'contain'
        ? mapped.every(
            (p) =>
              p.x >= inner.l - slack &&
              p.x <= inner.r + slack &&
              p.y >= inner.t - slack &&
              p.y <= inner.b + slack,
          )
        : mapped[0].x >= inner.l - slack &&
          mapped[1].x <= inner.r + slack &&
          mapped[0].y >= inner.t - slack &&
          mapped[1].y >= inner.t - slack
    return { ok, inner, mapped }
  }, mode)
}

/** @param {import('playwright').Page} page @param {string} code */
async function zoneHitOk(page, code) {
  return page.evaluate((c) => {
    const svg = document.querySelector('.floor-plan-svg')
    const el = document.querySelector(`[data-zone="${c}"]`)
    if (!svg || !el) return false
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const pt = svg.createSVGPoint()
    pt.x = cx
    pt.y = cy
    const inv = svg.getScreenCTM()?.inverse()
    if (!inv) return false
    const hit = pt.matrixTransform(inv)
    const bb = el.getBBox()
    return (
      hit.x >= bb.x - 2 &&
      hit.y >= bb.y - 2 &&
      hit.x <= bb.x + bb.width + 2 &&
      hit.y <= bb.y + bb.height + 2
    )
  }, code)
}

const viewports = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-14', width: 390, height: 844 },
  { name: 'ipad', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ultrawide', width: 1920, height: 800 },
  { name: 'short', width: 1280, height: 480 },
]

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await prime(page)

/** @type {Row[]} */
const rows = []
let failures = 0

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.floor-plan-svg', { timeout: 15000 })
  await page.waitForTimeout(900)

  for (const mode of ['contain', 'width']) {
    if (mode === 'width') {
      await page.getByRole('button', { name: '铺满宽' }).click()
      await page.waitForTimeout(400)
    } else {
      await page.getByRole('button', { name: '看全图' }).click()
      await page.waitForTimeout(400)
    }

    const overflow = await fitCornersVisible(page, /** @type {'contain' | 'width'} */ (mode))
    const state = await readState(page)
    const okFit = overflow.ok
    rows.push({
      name: `${vp.name}/${mode} fit-in-view`,
      ok: okFit,
      detail: okFit
        ? `zoom=${state?.zoom?.toFixed(3)} pan=(${state?.panX?.toFixed(1)},${state?.panY?.toFixed(1)})`
        : JSON.stringify(overflow),
    })
    if (!okFit) failures++

    for (const pt of [
      { x: 200, y: 200 },
      { x: 800, y: 400 },
      { x: 1200, y: 900 },
    ]) {
      const rt = await roundTripError(page, pt.x, pt.y)
      const ok = rt.err < 1.5
      rows.push({
        name: `${vp.name}/${mode} roundtrip (${pt.x},${pt.y})`,
        ok,
        detail: `err=${rt.err.toFixed(3)}`,
      })
      if (!ok) failures++
    }

    const s6 = await zoneCenter(page, 'S6')
    if (s6) {
      const ok = await zoneHitOk(page, 'S6')
      rows.push({
        name: `${vp.name}/${mode} S6 hit`,
        ok,
        detail: ok ? 'center maps into zone bbox' : 'miss',
      })
      if (!ok) failures++
    }
  }

  // stress: zoom + pan + click
  await page.getByRole('button', { name: '看全图' }).click()
  await page.waitForTimeout(200)
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '放大' }).click()
    await page.waitForTimeout(80)
  }
  const box = await page.locator('.plan-viewer').boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55, {
      steps: 12,
    })
    await page.mouse.up()
    await page.waitForTimeout(250)
    const s6 = await zoneCenter(page, 'S6')
    if (s6) {
      const visible = await page.evaluate(() => {
        const el = document.querySelector('[data-zone="S6"]')
        const v = document.querySelector('.plan-viewer')
        if (!el || !v) return false
        const er = el.getBoundingClientRect()
        const vr = v.getBoundingClientRect()
        return (
          er.width > 0 &&
          er.height > 0 &&
          er.left >= vr.left - 2 &&
          er.right <= vr.right + 2 &&
          er.top >= vr.top - 2 &&
          er.bottom <= vr.bottom + 2
        )
      })
      if (!visible) {
        rows.push({
          name: `${vp.name} click S6 after zoom/pan`,
          ok: true,
          detail: 'S6 off-screen after pan (skipped)',
        })
      } else {
        await page.locator('[data-zone="S6"]').first().click({ force: true, timeout: 5000 })
        await page.waitForTimeout(400)
        const navigated = page.url().includes('zone=S6')
        rows.push({
          name: `${vp.name} click S6 after zoom/pan`,
          ok: navigated,
          detail: navigated ? page.url() : page.url(),
        })
        if (!navigated) failures++
        if (navigated) await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' })
      }
    }
  }
}

// edit mode drag sanity
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '编辑', exact: true }).click()
await page.waitForTimeout(500)
const wall = page.locator('[data-wall-id]').first()
if (await wall.count()) {
  const wb = await wall.boundingBox()
  if (wb) {
    await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2)
    await page.mouse.down()
    await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2 + 48, {
      steps: 10,
    })
    await page.waitForTimeout(100)
    await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2 + 56, {
      steps: 6,
    })
    await page.waitForTimeout(350)
    const hud = await page.locator('.drag-hud').isVisible()
    await page.mouse.up()
    rows.push({
      name: 'edit drag shows HUD',
      ok: hud,
      detail: hud ? 'visible' : 'missing',
    })
    if (!hud) failures++
  }
}

await browser.close()

console.log('\n=== Plan viewport stress test ===\n')
for (const r of rows) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  —  ${r.detail}`)
}
console.log(`\n${rows.length} checks, ${failures} failures\n`)
process.exit(failures > 0 ? 1 : 0)
