/**
 * 凑重功能全状态截图（配合 E2E 测试后人工/UI 检查）
 * node scripts/plate-e2e-screenshots.mjs
 */
import { chromium } from '@playwright/test'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const { dir: OUT } = resolveScreenshotDir({
  app: 'fitness',
  suite: 'plate-e2e',
  importMetaUrl: import.meta.url,
})

async function seed(page, o = {}) {
  await page.goto('http://localhost:5173/')
  await page.evaluate((data) => {
    const s = JSON.parse(localStorage.getItem('fitos_v2') || '{}')
    s.settings = {
      unit: 'lbs',
      plateCollarLbs: 0,
      plateCollarKg: 0,
      ...data.settings,
    }
    s.weights = { c_bench: 185, ...data.weights }
    localStorage.setItem('fitos_v2', JSON.stringify(s))
  }, o)
  await page.reload()
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

const shots = [
  [
    'discover-full',
    async () => {
      await page.goto('http://localhost:5173/discover/tools')
      await page
        .locator('.tool-card', { hasText: '杠铃片凑重' })
        .locator('.tool-head')
        .click()
    },
  ],
  [
    'discover-collapsed',
    async () => {
      await page.locator('.tool-head', { hasText: '杠铃片凑重' }).click()
    },
  ],
  [
    'modal-full',
    async () => {
      await seed(page)
      await page.goto('http://localhost:5173/day/chest/focus')
      await page.locator('.focus-weight').click()
    },
  ],
  [
    'modal-preset-quick',
    async () => {
      await page.locator('.wtm-preset', { hasText: '315' }).click()
    },
  ],
  [
    'sheet-plates',
    async () => {
      await page.keyboard.press('Escape')
      await page.locator('.focus-plates-link').click()
    },
  ],
  [
    'sheet-inventory',
    async () => {
      await page.locator('.pb-inv-toggle').click()
    },
  ],
]

for (const [name, fn] of shots) {
  await fn()
  await page.waitForTimeout(300)
  const barbell = page.locator('.pb-barbell, .pb-viz').first()
  if (await barbell.count())
    await barbell.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log('✓', name)
}

await browser.close()
console.log('→', OUT)
