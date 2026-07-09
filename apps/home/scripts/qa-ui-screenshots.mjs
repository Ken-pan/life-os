/**
 * UI/UX audit screenshots — Home /plan
 * Usage: node apps/home/scripts/qa-ui-screenshots.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5197'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../screenshots/qa-uiux-2026-07-08')
const SKEY = 'homeos_spatial_v1'

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
    }
    localStorage.setItem(key, JSON.stringify(data))
  }, SKEY)
  await page.reload({ waitUntil: 'networkidle' })
}

async function primeWallGraph(page) {
  await page.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
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
    const raw = localStorage.getItem(key)
    const base = raw ? JSON.parse(raw) : { settings: {}, projects: {}, activeProjectId: 'avalon-508' }
    const pid = base.activeProjectId ?? 'avalon-508'
    base.projects[pid] = {
      ...(base.projects[pid] ?? {}),
      layoutMode: 'wallGraph',
      wallGraph: graph,
      graphOpenings: [
        {
          id: 'go-audit-1',
          edgeId: 'e-top',
          offsetIn: 48,
          spanIn: 32,
          type: 'door',
          style: 'swing',
          swing: 'out',
        },
      ],
    }
    localStorage.setItem(key, JSON.stringify(base))
  }, SKEY)
  await page.reload({ waitUntil: 'networkidle' })
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false })
}

async function enterGraphEdit(page) {
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.waitForTimeout(350)
  await page.getByRole('button', { name: '选择', exact: true }).click()
  await page.waitForTimeout(200)
}

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()

// Desktop light
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' })
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

// Desktop wall graph
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' })
  const page = await ctx.newPage()
  await primeWallGraph(page)
  await enterGraphEdit(page)
  await shot(page, '04-edit-wallgraph-select-desktop.png')
  await page.locator('[data-graph-opening-id="go-audit-1"]').click({ force: true })
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

// iPhone SE
{
  const ctx = await browser.newContext({ ...devices['iPhone SE'], colorScheme: 'light' })
  const page = await ctx.newPage()
  await primeWallGraph(page)
  await enterGraphEdit(page)
  await shot(page, '08-edit-wallgraph-iphone-se.png')
  await page.locator('[data-graph-opening-id="go-audit-1"]').click({ force: true })
  await page.waitForTimeout(400)
  await shot(page, '09-opening-selected-iphone-se.png')
  await ctx.close()
}

// iPhone SE dark
{
  const ctx = await browser.newContext({ ...devices['iPhone SE'], colorScheme: 'dark' })
  const page = await ctx.newPage()
  await primeWallGraph(page)
  await enterGraphEdit(page)
  await shot(page, '10-edit-wallgraph-dark-iphone-se.png')
  await ctx.close()
}

await browser.close()
console.log(`Screenshots saved to ${OUT}`)
