/**
 * Focus mode 全链路截图检查
 * node scripts/focus-screenshot-check.mjs
 */
import { chromium } from '@playwright/test'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const { dir: OUT } = resolveScreenshotDir({
  app: 'fitness',
  suite: 'focus-review',
  importMetaUrl: import.meta.url,
})

async function seed(page, data = {}) {
  await page.goto(`${BASE}/`)
  await page.evaluate((d) => {
    const s = JSON.parse(localStorage.getItem('fitos_v2') || '{}')
    s.settings = {
      unit: 'lbs',
      logDetail: 'quick',
      plateCollarLbs: 0,
      plateCollarKg: 0,
      ...d.settings,
    }
    s.weights = { c_bench: 185, c_incline: 135, c_fly: 0, ...d.weights }
    if (d.logs) s.logs = d.logs
    delete s.focusCursor
    localStorage.setItem('fitos_v2', JSON.stringify(s))
  }, data)
  await page.reload()
}

async function shot(page, name) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false })
  console.log('✓', name)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

// 1. 首屏（杠铃卧推）
await seed(page)
await page.goto(`${BASE}/day/chest/focus`)
await page.locator('.focus-ex-name').waitFor()
await shot(page, '01-home')

// 2. 重量建议（昨日满 reps）
await seed(page, {
  logs: (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const dateK = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      [`${dateK}|chest`]: {
        c_bench: {
          sets: [
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 1 },
            { weight: 185, reps: 8, rir: 1 },
          ],
        },
      },
    }
  })(),
})
await page.goto(`${BASE}/day/chest/focus`)
await page.locator('.focus-advice.increase').waitFor()
await shot(page, '02-advice')

// 3. 重量弹窗
await page.locator('.focus-weight').click()
await page.locator('.modal.wtm').waitFor()
await shot(page, '03-weight-modal')

// 4. 凑重 Sheet
await page.keyboard.press('Escape')
await page.locator('.focus-plates-link').click()
await page.locator('.tool-sheet').waitFor()
await shot(page, '04-plates-sheet')
await page.keyboard.press('Escape')

// 5. 计算器
await page.locator('.focus-tool-btn').click()
await page.locator('.tool-sheet').waitFor()
await shot(page, '05-calc-sheet')
await page.keyboard.press('Escape')

// 6. 完成一组 → 休息计时
await page.locator('.focus-cta-set').click()
await page.locator('.focus-timer-island').waitFor({ timeout: 5000 })
await shot(page, '06-rest-timer')

// 7. SetLogSheet（quick 模式补录）
if (await page.locator('.sheet').isVisible()) {
  await shot(page, '07-set-log-sheet')
  await page.keyboard.press('Escape')
}

// 8. 跳过弹窗
await page.locator('.focus-nav-btn', { hasText: '跳过' }).click()
await page.locator('.skip-reasons').waitFor()
await shot(page, '08-skip-modal')
await page.keyboard.press('Escape')

// 9. 退出确认
await page.locator('.focus-exit').click()
await page.locator('#focus-exit-title').waitFor()
await shot(page, '09-exit-confirm')
await page.keyboard.press('Escape')

// 10. 动作完成状态（完成全部组）
await seed(page)
await page.goto(`${BASE}/day/chest/focus`)
await page.evaluate(() => {
  const raw = localStorage.getItem('fitos_v2') || '{}'
  const s = JSON.parse(raw)
  const d = new Date()
  const dateK = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  s.logs = s.logs || {}
  s.logs[`${dateK}|chest`] = {
    c_bench: {
      sets: [
        { weight: 185, reps: 8, rir: 2 },
        { weight: 185, reps: 8, rir: 2 },
        { weight: 185, reps: 8, rir: 2 },
        { weight: 185, reps: 8, rir: 2 },
      ],
    },
  }
  localStorage.setItem('fitos_v2', JSON.stringify(s))
})
await page.reload()
await page.locator('.focus-done-msg').waitFor()
await shot(page, '10-ex-done')

// 11. 下一动作
await page.locator('.focus-nav-btn', { hasText: '下个' }).click()
await page.locator('.focus-ex-name').waitFor()
await shot(page, '11-next-ex')

// 12. kg 模式
await seed(page, { settings: { unit: 'kg' }, weights: { c_bench: 84 } })
await page.goto(`${BASE}/day/chest/focus`)
await shot(page, '12-kg-mode')

// 13. 短视口 iPhone SE
const se = await browser.newContext({ viewport: { width: 375, height: 667 } })
const sePage = await se.newPage()
await seed(sePage)
await sePage.goto(`${BASE}/day/chest/focus`)
await sePage.locator('.focus-ex-name').waitFor()
await sePage.waitForTimeout(350)
await sePage.screenshot({ path: join(OUT, '13-short-viewport.png') })
console.log('✓', '13-short-viewport')

// 14. 短视口 + 休息计时
await sePage.locator('.focus-cta-set').click()
await sePage.locator('.focus-timer-island').waitFor({ timeout: 5000 })
await sePage.waitForTimeout(350)
await sePage.screenshot({ path: join(OUT, '14-short-rest.png') })
console.log('✓', '14-short-rest')

// 15. 短视口 + 重量弹窗
if (await sePage.locator('.sheet').isVisible())
  await sePage.keyboard.press('Escape')
await sePage.locator('.focus-weight').click()
await sePage.locator('.modal.wtm').waitFor()
await sePage.locator('.modal.wtm .modal-actions').scrollIntoViewIfNeeded()
await sePage.waitForTimeout(350)
await sePage.screenshot({ path: join(OUT, '15-short-weight-modal.png') })
console.log('✓', '15-short-weight-modal')

await se.close()
await browser.close()
console.log('→', OUT)
