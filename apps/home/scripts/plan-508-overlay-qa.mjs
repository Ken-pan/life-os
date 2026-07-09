/**
 * Overlay QA: SVG floor plan vs red-line reference (+ optional developer PNG).
 *
 * Usage:
 *   node apps/home/scripts/plan-508-overlay-qa.mjs
 *   node apps/home/scripts/plan-508-overlay-qa.mjs --scale=1.05 --tx=10 --ty=-5
 *   node apps/home/scripts/plan-508-overlay-qa.mjs --no-dev
 *
 * Alignment: SVG uses full viewport viewBox; redline is stretched to outerBounds
 * within that viewBox (margin.x / margin.y offset), then --scale/--tx/--ty apply.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  build508Project,
  default508Config,
} from '../src/lib/spatial/layout-508.js'
import { renderFloorPlanSvg } from '../src/lib/spatial/render-svg.js'
import {
  formatShotFilename,
  resolveScreenshotDir,
} from '../../../scripts/qa/screenshot-output.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(__dirname, 'fixtures', '508-redline-reference.png')

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ scale: number, tx: number, ty: number, noDev: boolean }} */
  const out = { scale: 1, tx: 0, ty: 0, noDev: false }
  for (const a of argv) {
    if (a === '--no-dev') out.noDev = true
    else if (a.startsWith('--scale=')) out.scale = Number(a.slice(8)) || 1
    else if (a.startsWith('--tx=')) out.tx = Number(a.slice(5)) || 0
    else if (a.startsWith('--ty=')) out.ty = Number(a.slice(5)) || 0
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const config = default508Config()
const project = build508Project(config)
const svg = renderFloorPlanSvg(project, { hideFurniture: true, compact: true })
const bounds = project.outerBounds
const viewport = project.viewport
if (!bounds) throw new Error('missing outerBounds')

const doors = project.openings
  .filter((o) => o.type === 'door')
  .map((o) => {
    const h = o.hitRect
    return {
      id: o.id,
      style: o.doorStyle,
      opensInto: o.opensInto ?? null,
      cx: h ? Math.round(h.x + h.w / 2) : null,
      cy: h ? Math.round(h.y + h.h / 2) : null,
      hit: h
        ? {
            x: Math.round(h.x),
            y: Math.round(h.y),
            w: Math.round(h.w),
            h: Math.round(h.h),
          }
        : null,
    }
  })

console.log('viewport', viewport)
console.log('outerBounds', bounds)
console.log('doors')
for (const d of doors) {
  console.log(
    `  ${d.id}  style=${d.style}  opensInto=${d.opensInto}  center=(${d.cx},${d.cy})`,
  )
}

const { dir } = resolveScreenshotDir({
  app: 'home',
  suite: '508-overlay',
  importMetaUrl: import.meta.url,
  runId: process.env.QA_RUN_ID ?? 'latest',
})

const redlineDataUrl = `data:image/png;base64,${readFileSync(FIXTURE).toString('base64')}`
const floorplanUrl = project.meta.floorplanUrl ?? ''
// Redline sketch aspect (724×1024 ≈ 0.71) ≠ real outerBounds (≈ 0.80).
// Contain-fit into outerBounds so topology/doors can be compared without stretch.
const RED_W = 724
const RED_H = 1024
const fit = Math.min(bounds.w / RED_W, bounds.h / RED_H)
const fittedW = RED_W * fit
const fittedH = RED_H * fit
const fittedOx = bounds.x + (bounds.w - fittedW) / 2
const fittedOy = bounds.y + (bounds.h - fittedH) / 2

const stageW = Math.ceil(viewport.width * args.scale + Math.abs(args.tx) + 16)
const stageH = Math.ceil(viewport.height * args.scale + Math.abs(args.ty) + 16)
const svgLeft = 8 + Math.max(0, -args.tx)
const svgTop = 8 + Math.max(0, -args.ty)
const svgW = viewport.width * args.scale
const svgH = viewport.height * args.scale
const redLeft = svgLeft + ((fittedOx + args.tx) / viewport.width) * svgW
const redTop = svgTop + ((fittedOy + args.ty) / viewport.height) * svgH
const redW = (fittedW / viewport.width) * svgW
const redH = (fittedH / viewport.height) * svgH

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>508 overlay QA</title>
<style>
  html, body { margin: 0; background: #f7f7f7; }
  #stage {
    position: relative;
    width: ${stageW}px;
    height: ${stageH}px;
    overflow: hidden;
    background: #fff;
  }
  #svg-wrap {
    position: absolute;
    left: ${svgLeft}px;
    top: ${svgTop}px;
    width: ${svgW}px;
    height: ${svgH}px;
    z-index: 3;
  }
  #svg-wrap svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  #red, #dev {
    position: absolute;
    left: ${redLeft}px;
    top: ${redTop}px;
    width: ${redW}px;
    height: ${redH}px;
    object-fit: fill;
  }
  #dev { opacity: 0.3; z-index: 1; }
  #red { opacity: 0.7; z-index: 2; mix-blend-mode: multiply; }
  #svg-wrap .room { fill: transparent !important; }
  #svg-wrap .storage-zone { display: none; }
  #svg-wrap .zone-glyph { display: none; }
</style>
</head>
<body>
<div id="stage">
  ${
    args.noDev || !floorplanUrl
      ? ''
      : `<img id="dev" src="${floorplanUrl}" alt="developer floor plan"/>`
  }
  <img id="red" src="${redlineDataUrl}" alt="redline reference"/>
  <div id="svg-wrap">${svg}</div>
</div>
</body>
</html>`

const htmlPath = join(dir, 'overlay.html')
writeFileSync(htmlPath, html)
writeFileSync(
  join(dir, 'doors.json'),
  JSON.stringify(
    {
      viewport,
      bounds,
      doors,
      args,
      red: { fittedOx, fittedOy, fittedW, fittedH, redLeft, redTop, redW, redH },
    },
    null,
    2,
  ),
)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: {
    width: Math.max(stageW + 40, 1000),
    height: Math.max(stageH + 40, 1200),
  },
})
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

const stage = page.locator('#stage')
const overlayPath = join(
  dir,
  formatShotFilename({ seq: 1, surface: 'overlay', state: 'red-svg' }),
)
await stage.screenshot({ path: overlayPath })
console.log('saved', overlayPath)

await page.evaluate(() => {
  const red = document.getElementById('red')
  if (red) red.style.display = 'none'
  const dev = document.getElementById('dev')
  if (dev) dev.style.display = 'none'
  const wrap = document.getElementById('svg-wrap')
  if (wrap) {
    for (const el of wrap.querySelectorAll('.room')) {
      el.style.removeProperty('fill')
    }
  }
})
const svgOnlyPath = join(dir, formatShotFilename({ seq: 2, surface: 'svg-only' }))
await stage.screenshot({ path: svgOnlyPath })
console.log('saved', svgOnlyPath)

await page.evaluate(() => {
  const red = document.getElementById('red')
  if (red) red.style.display = ''
  const wrap = document.getElementById('svg-wrap')
  if (wrap) wrap.style.display = 'none'
})
const redOnlyPath = join(
  dir,
  formatShotFilename({ seq: 3, surface: 'redline-only' }),
)
await stage.screenshot({ path: redOnlyPath })
console.log('saved', redOnlyPath)

await browser.close()
console.log('\n508 overlay QA done →', dir)
