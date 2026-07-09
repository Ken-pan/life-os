import { chromium, devices } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const { dir: outDir } = resolveScreenshotDir({
  app: 'planner',
  suite: 'buttons',
  importMetaUrl: import.meta.url,
})

const targets = [
  {
    name: 'planner-settings-mobile',
    url: 'http://127.0.0.1:5188/settings',
    viewport: devices['Pixel 7'].viewport,
  },
  {
    name: 'planner-settings-desktop',
    url: 'http://127.0.0.1:5188/settings',
    viewport: { width: 1280, height: 800 },
  },
  {
    name: 'planner-auth-mobile',
    url: 'http://127.0.0.1:5188/auth',
    viewport: devices['Pixel 7'].viewport,
  },
  {
    name: 'planner-calendar-mobile',
    url: 'http://127.0.0.1:5188/calendar',
    viewport: devices['Pixel 7'].viewport,
  },
  {
    name: 'fitness-settings-mobile',
    url: 'http://127.0.0.1:5189/settings',
    viewport: devices['Pixel 7'].viewport,
  },
  {
    name: 'fitness-auth-mobile',
    url: 'http://127.0.0.1:5189/auth',
    viewport: devices['Pixel 7'].viewport,
  },
  {
    name: 'finance-auth-mobile',
    url: 'http://127.0.0.1:5190/auth',
    viewport: devices['Pixel 7'].viewport,
  },
]

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage()

for (const target of targets) {
  await page.setViewportSize(target.viewport)
  try {
    await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(600)
    await page.screenshot({
      path: path.join(outDir, `${target.name}.png`),
      fullPage: true,
    })
    console.log(`ok ${target.name}`)
  } catch (err) {
    console.error(`fail ${target.name}:`, err.message)
    process.exitCode = 1
  }
}

await browser.close()
console.log(`screenshots -> ${outDir}`)
