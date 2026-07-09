import { chromium, devices } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const { dir: outDir } = resolveScreenshotDir({
  app: 'planner',
  suite: 'fab',
  importMetaUrl: import.meta.url,
})

const targets = [
  {
    name: 'planner-home-mobile',
    url: 'http://127.0.0.1:5188/',
    viewport: devices['Pixel 7'].viewport,
  },
  {
    name: 'planner-home-desktop',
    url: 'http://127.0.0.1:5188/',
    viewport: { width: 1280, height: 800 },
  },
  {
    name: 'finance-today-mobile',
    url: 'http://127.0.0.1:5190/#today',
    viewport: devices['Pixel 7'].viewport,
  },
]

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()

for (const target of targets) {
  await page.setViewportSize(target.viewport)
  await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
  await page.screenshot({
    path: path.join(outDir, `${target.name}.png`),
    fullPage: false,
  })
  console.log(`ok ${target.name}`)
}

await browser.close()
