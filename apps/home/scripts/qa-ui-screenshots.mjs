/**
 * UI/UX audit screenshots — Home /plan (508 + wall graph steps ①②③)
 * Usage: node apps/home/scripts/qa-ui-screenshots.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5197'
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../screenshots/qa-uiux-2026-07-08',
)
const SKEY = 'homeos_spatial_v1'
const OPENING_ID = 'go-audit-1'

/** @param {import('playwright').Page} page */
async function prime508(page) {
  await page.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const data = JSON.parse(raw)
    const pid = data.activeProjectId ?? 'avalon-508'
    const proj = data.projects?.[pid]
    if (proj) {
      delete proj.layoutMode
      delete proj.wallGraph
      proj.graphOpenings = []
      proj.zones = []
      proj.placements = []
    }
    localStorage.setItem(key, JSON.stringify(data))
  }, SKEY)
  await page.reload({ waitUntil: 'networkidle' })
}

/**
 * @param {import('playwright').Page} page
 * @param {{ withZone?: boolean, withPlacement?: boolean }} [opts]
 */
async function primeWallGraph(page, opts = {}) {
  await page.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ key, openingId, withZone, withPlacement }) => {
      const graph = {
        pxPerFt: 36,
        margin: { x: 40, y: 40 },
        vertices: [
          { id: 'v1', x: 80, y: 80 },
          { id: 'v2', x: 400, y: 80 },
          { id: 'v3', x: 400, y: 320 },
          { id: 'v4', x: 80, y: 320 },
        ],
        edges: [
          { id: 'e-top', a: 'v1', b: 'v2', exterior: true },
          { id: 'e-right', a: 'v2', b: 'v3', exterior: true },
          { id: 'e-bot', a: 'v3', b: 'v4', exterior: true },
          { id: 'e-left', a: 'v4', b: 'v1', exterior: true },
        ],
      }
      /** @type {Record<string, unknown>} */
      const patch = {
        layoutMode: 'wallGraph',
        wallGraph: graph,
        graphOpenings: [
          {
            id: openingId,
            edgeId: 'e-top',
            offsetIn: 48,
            spanIn: 32,
            type: 'door',
            style: 'swing',
            swing: 'out',
          },
        ],
        zones: withZone
          ? [
              {
                id: 'zone-audit-1',
                nameZh: '客厅',
                color: '#8ecae6',
                polygon: [
                  { x: 100, y: 100 },
                  { x: 380, y: 100 },
                  { x: 380, y: 300 },
                  { x: 100, y: 300 },
                ],
                stale: false,
              },
            ]
          : [],
        placements: withPlacement
          ? [
              {
                id: 'pl-audit-1',
                kind: 'cabinet',
                label: '柜',
                x: 180,
                y: 180,
                w: 36,
                h: 24,
                rotation: 0,
                zoneId: withZone ? 'zone-audit-1' : undefined,
              },
            ]
          : [],
      }
      const raw = localStorage.getItem(key)
      const base = raw
        ? JSON.parse(raw)
        : { settings: {}, projects: {}, activeProjectId: 'avalon-508' }
      const pid = base.activeProjectId ?? 'avalon-508'
      base.projects[pid] = {
        ...(base.projects[pid] ?? {}),
        ...patch,
      }
      localStorage.setItem(key, JSON.stringify(base))
    },
    {
      key: SKEY,
      openingId: OPENING_ID,
      withZone: Boolean(opts.withZone),
      withPlacement: Boolean(opts.withPlacement),
    },
  )
  await page.reload({ waitUntil: 'networkidle' })
}

/** @param {import('playwright').Page} page @param {string} name */
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false })
}

/** @param {import('playwright').Page} page */
async function clickFirstOpening(page) {
  const opening = page.locator('[data-graph-opening-id]').first()
  await opening.waitFor({ state: 'attached', timeout: 15000 })
  await opening.click({ force: true })
}

/** @param {import('playwright').Page} page */
async function enterGraphEdit(page) {
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.waitForTimeout(350)
  const toolSelect = page.locator('select[aria-label="墙图工具"]')
  if (await toolSelect.count()) {
    await toolSelect.selectOption('select')
  } else {
    await page.getByRole('button', { name: '选择', exact: true }).click({ force: true })
  }
  await page.waitForTimeout(250)
}

/** @param {import('playwright').Page} page */
async function enterZonesStep(page) {
  const stepSelect = page.locator('select[aria-label="编辑步骤"]')
  if (await stepSelect.count()) {
    await stepSelect.selectOption('zones')
  } else {
    await page.getByRole('button', { name: '② 划分', exact: true }).click()
  }
  await page.waitForTimeout(300)
}

/** @param {import('playwright').Page} page */
async function enterPlaceStep(page) {
  const stepSelect = page.locator('select[aria-label="编辑步骤"]')
  if (await stepSelect.count()) {
    await stepSelect.selectOption('place')
  } else {
    await page.getByRole('button', { name: '③ 布置', exact: true }).click()
  }
  await page.waitForTimeout(300)
}

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()

// Desktop light — 508
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  await prime508(page)
  await shot(page, '01-browse-508-desktop.png')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.waitForTimeout(350)
  await shot(page, '02-edit-508-desktop.png')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await shot(page, '03-settings-508-desktop.png')
  await ctx.close()
}

// Desktop wall graph — ① 墙体
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  await primeWallGraph(page)
  await enterGraphEdit(page)
  await shot(page, '04-edit-wallgraph-select-desktop.png')
  await clickFirstOpening(page)
  await page.waitForTimeout(400)
  await shot(page, '05-opening-selected-desktop.png')
  await page.getByRole('button', { name: '快捷键与操作提示' }).click()
  await page.waitForTimeout(200)
  await shot(page, '06-help-panel-desktop.png')
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await shot(page, '07-settings-wallgraph-desktop.png')
  await ctx.close()
}

// Desktop — ② 划分
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  await primeWallGraph(page, { withZone: true })
  await enterGraphEdit(page)
  await enterZonesStep(page)
  await shot(page, '11-edit-zones-desktop.png')
  await ctx.close()
}

// Desktop — ③ 布置
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  await primeWallGraph(page, { withZone: true, withPlacement: true })
  await enterGraphEdit(page)
  await enterPlaceStep(page)
  await shot(page, '12-edit-place-desktop.png')
  await page.locator('[data-placement-id="pl-audit-1"]').waitFor({ state: 'attached', timeout: 15000 })
  await page.locator('[data-placement-id="pl-audit-1"]').click({ force: true })
  await page.waitForTimeout(400)
  await shot(page, '13-placement-selected-desktop.png')
  await ctx.close()
}

// iPhone SE — ① 墙体
{
  const ctx = await browser.newContext({
    ...devices['iPhone SE'],
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  await primeWallGraph(page)
  await enterGraphEdit(page)
  await shot(page, '08-edit-wallgraph-iphone-se.png')
  await clickFirstOpening(page)
  await page.waitForTimeout(400)
  await shot(page, '09-opening-selected-iphone-se.png')
  await ctx.close()
}

// iPhone SE — ② 划分
{
  const ctx = await browser.newContext({
    ...devices['iPhone SE'],
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  await primeWallGraph(page, { withZone: true })
  await enterGraphEdit(page)
  await enterZonesStep(page)
  await shot(page, '14-edit-zones-iphone-se.png')
  await ctx.close()
}

// iPhone SE — ③ 布置（compact 家具类型 select）
{
  const ctx = await browser.newContext({
    ...devices['iPhone SE'],
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  await primeWallGraph(page, { withZone: true, withPlacement: true })
  await enterGraphEdit(page)
  await enterPlaceStep(page)
  await shot(page, '15-edit-place-iphone-se.png')
  const kindSelect = page.locator('select[aria-label="家具类型"]')
  if (await kindSelect.count()) {
    await kindSelect.selectOption('bed')
    await page.waitForTimeout(250)
    await shot(page, '16-placement-kind-select-iphone-se.png')
  }
  await ctx.close()
}

// iPhone SE dark — ①
{
  const ctx = await browser.newContext({
    ...devices['iPhone SE'],
    colorScheme: 'dark',
  })
  const page = await ctx.newPage()
  await primeWallGraph(page)
  await enterGraphEdit(page)
  await shot(page, '10-edit-wallgraph-dark-iphone-se.png')
  await ctx.close()
}

await browser.close()
console.log(`Screenshots saved to ${OUT}`)
