#!/usr/bin/env node
/**
 * Capture three Kenos visual-direction prototypes (≥27 comparable shots).
 *
 * Matrix:
 *   directions a|b|c × surfaces today|spaces|switcher|fitness|planner
 *   × devices iphone-390 | ipad-spaces | desktop-1440 (subset per program)
 *
 * Required set (≥27):
 *   iPhone: Today, Spaces, Switcher, Fitness, Planner × A/B/C = 15
 *   iPad: Spaces, Fitness × A/B/C = 6
 *   Desktop: Today, Switcher × A/B/C = 6
 *   Total = 27
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const outDir = join(root, 'output/uiux/kenos-visual-rescue-2026-07-20/directions')
const port = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 5291)

const DIRECTIONS = ['a', 'b', 'c']
const IPHONE = {
  name: 'iphone',
  viewport: { width: 390, height: 844 },
  surfaces: ['today', 'spaces', 'switcher', 'fitness', 'planner'],
}
const IPAD = {
  name: 'ipad',
  viewport: { width: 1024, height: 1366 },
  surfaces: ['spaces', 'fitness'],
}
const DESKTOP = {
  name: 'desktop',
  viewport: { width: 1440, height: 900 },
  surfaces: ['today', 'switcher'],
}

async function shot(page, dirId, device, surface) {
  const url = `http://127.0.0.1:${port}/uiux-direction/${dirId}`
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() =>
    page.goto(url, { waitUntil: 'domcontentloaded' }),
  )
  await page.waitForSelector(`[data-testid="uiux-direction-${dirId}"]`, { timeout: 15000 })
  const btn = page.locator(`.proto-surfaces button`, { hasText: surface })
  await btn.click()
  await page.waitForTimeout(350)
  await page.addStyleTag({
    content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
  })
  const file = `${device}-${surface}-dir${dirId}.png`
  const path = join(outDir, file)
  await page.screenshot({ path, fullPage: false })
  console.log(`✓ ${file}`)
  return file
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const manifest = []

  for (const device of [IPHONE, IPAD, DESKTOP]) {
    const context = await browser.newContext({
      viewport: device.viewport,
      deviceScaleFactor: 2,
      colorScheme: 'dark',
      ...(device.name === 'iphone' ? { hasTouch: true, isMobile: true } : {}),
    })
    const page = await context.newPage()
    for (const dirId of DIRECTIONS) {
      for (const surface of device.surfaces) {
        const file = await shot(page, dirId, device.name, surface)
        manifest.push({ direction: dirId, device: device.name, surface, file })
      }
    }
    await context.close()
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ count: manifest.length, shots: manifest }, null, 2))
  console.log(`\nCaptured ${manifest.length} direction shots → ${outDir}`)
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
