import { chromium } from 'playwright'
import fs from 'node:fs'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const { dir: OUT } = resolveScreenshotDir({
  app: 'planner',
  suite: 'headers-unified',
  importMetaUrl: import.meta.url,
})
const shots = [
  {
    file: 'planner-home-mobile',
    url: 'http://127.0.0.1:5188/',
    mobile: true,
    sel: '.appbar',
  },
  {
    file: 'planner-auth-mobile',
    url: 'http://127.0.0.1:5188/auth',
    mobile: true,
    sel: '.appbar',
  },
  {
    file: 'planner-settings-mobile',
    url: 'http://127.0.0.1:5188/settings',
    mobile: true,
    sel: '.appbar',
  },
  {
    file: 'fitness-home-mobile',
    url: 'http://127.0.0.1:5189/',
    mobile: true,
    sel: '.appbar',
  },
  {
    file: 'fitness-auth-mobile',
    url: 'http://127.0.0.1:5189/auth',
    mobile: true,
    sel: '.appbar',
  },
  {
    file: 'fitness-settings-mobile',
    url: 'http://127.0.0.1:5189/settings',
    mobile: true,
    sel: '.appbar',
  },
  {
    file: 'finance-today-mobile',
    url: 'http://127.0.0.1:5190/#today',
    mobile: true,
    sel: '.page-header',
  },
  {
    file: 'finance-settings-mobile',
    url: 'http://127.0.0.1:5190/#settings',
    mobile: true,
    sel: '.page-header',
  },
]

fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: s.mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 },
  })
  const page = await ctx.newPage()
  try {
    await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector(s.sel, { timeout: 15000 })
    await page.waitForTimeout(400)
    await page
      .locator(s.sel)
      .first()
      .screenshot({ path: path.join(OUT, `${s.file}.png`) })
    console.log('ok', s.file)
  } catch (e) {
    console.error('fail', s.file, e.message)
  }
  await ctx.close()
}

await browser.close()
console.log('saved ->', OUT)
