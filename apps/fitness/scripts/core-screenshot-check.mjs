/**
 * 除 Focus 外的核心流程截图检查
 * node scripts/core-screenshot-check.mjs
 */
import { chromium } from '@playwright/test'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const { dir: OUT } = resolveScreenshotDir({
  app: 'fitness',
  suite: 'core-review',
  importMetaUrl: import.meta.url,
})

function dateKey(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function seed(page, data = {}) {
  await page.goto(`${BASE}/`)
  await page.evaluate((d) => {
    const today = new Date()
    const todayK = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const s = JSON.parse(localStorage.getItem('fitos_v2') || '{}')
    s.settings = {
      unit: 'lbs',
      logDetail: 'quick',
      theme: 'dark',
      sound: true,
      notifyRest: false,
      plateCollarLbs: 0,
      plateCollarKg: 0,
      ...d.settings,
    }
    s.weights = {
      c_bench: 185,
      c_incline: 135,
      c_fly: 0,
      b_row: 135,
      ...d.weights,
    }
    if (d.logs) s.logs = d.logs
    if (d.rotation)
      s.rotation = { next: 0, history: [], lastDeload: null, ...d.rotation }
    if (d.sessionMeta) s.sessionMeta = d.sessionMeta
    delete s.focusCursor

    // 给今天以前的日志补全 sessionMeta + rotation.history，避免启动时弹「自动补记」toast
    s.sessionMeta = s.sessionMeta || {}
    s.rotation = s.rotation || { next: 0, history: [], lastDeload: null }
    s.rotation.history = s.rotation.history || []
    for (const key of Object.keys(s.logs || {})) {
      const [date, dayId] = key.split('|')
      if (!date || !dayId || date >= todayK) continue
      const ts = new Date(`${date}T12:00:00`).toISOString()
      if (!s.sessionMeta[key])
        s.sessionMeta[key] = { startedAt: ts, endedAt: ts }
      else if (!s.sessionMeta[key].endedAt)
        s.sessionMeta[key].endedAt = s.sessionMeta[key].startedAt || ts
      if (
        !s.rotation.history.some((h) => h.date === date && h.dayId === dayId)
      ) {
        s.rotation.history.push({ date, dayId })
      }
    }
    s.rotation.history.sort((a, b) => a.date.localeCompare(b.date))

    localStorage.setItem('fitos_v2', JSON.stringify(s))
  }, data)
  await page.reload()
  await page.waitForTimeout(500)
}

async function shot(page, name) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false })
  console.log('✓', name)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

// ── 今日首页 ──
await seed(page)
await page.goto(`${BASE}/`)
await page.locator('.hero-title').waitFor()
await shot(page, '01-home-default')

await seed(page, {
  logs: {
    [`${dateKey()}|chest`]: {
      c_bench: {
        sets: [
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 2 },
          null,
          null,
        ],
      },
    },
  },
})
await page.goto(`${BASE}/`)
await page.locator('.tc-pct').waitFor()
await shot(page, '02-home-with-progress')

await seed(page, {
  rotation: {
    next: 0,
    history: Array.from({ length: 12 }, (_, i) => ({
      date: dateKey(-(i + 1)),
      dayId: ['chest', 'back', 'arms', 'legs'][i % 4],
    })),
    lastDeload: null,
  },
})
await page.goto(`${BASE}/`)
await page.locator('.deload-callout').waitFor({ timeout: 5000 })
await shot(page, '03-home-deload')

await seed(page, {
  logs: {
    [`${dateKey(-1)}|chest`]: {
      c_bench: {
        sets: [
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 1 },
          { weight: 185, reps: 8, rir: 1 },
        ],
      },
    },
  },
})
await page.goto(`${BASE}/`)
await page.locator('.coach-panel').waitFor({ timeout: 5000 })
await shot(page, '04-home-coach')

// ── 计划页 ──
await seed(page)
await page.goto(`${BASE}/program`)
await page.locator('.sec-title', { hasText: '训练计划' }).waitFor()
await shot(page, '05-program-list')

// ── 概览模式 ──
await page.goto(`${BASE}/day/chest`)
await page.locator('.day-title').waitFor()
await shot(page, '06-day-overview')

await seed(page, {
  logs: {
    [`${dateKey()}|chest`]: {
      c_bench: { sets: [{ weight: 185, reps: 8, rir: 2 }, null, null, null] },
    },
  },
})
await page.goto(`${BASE}/day/chest`)
await page.locator('.set-chip.done').first().waitFor()
await shot(page, '07-day-overview-progress')

await page.locator('.w-panel').first().click()
await page.locator('.modal.wtm').waitFor()
await shot(page, '08-day-weight-modal')
await page.keyboard.press('Escape')

// ── 训练总结 ──
await seed(page, {
  logs: {
    [`${dateKey()}|chest`]: {
      c_bench: {
        sets: [
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 2 },
          null,
          null,
        ],
      },
      c_incline: { sets: [{ weight: 135, reps: 10, rir: 2 }, null, null] },
    },
  },
  sessionMeta: {
    [`${dateKey()}|chest`]: {
      startedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    },
  },
})
await page.goto(`${BASE}/day/chest/summary`)
await page.locator('.summary-grid').waitFor()
await shot(page, '09-summary-partial')

await seed(page, {
  logs: {
    [`${dateKey(-1)}|chest`]: {
      c_bench: {
        sets: [
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 1 },
          { weight: 185, reps: 8, rir: 1 },
        ],
      },
    },
    [`${dateKey()}|chest`]: {
      c_bench: {
        sets: [
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 2 },
        ],
      },
    },
  },
  sessionMeta: {
    [`${dateKey()}|chest`]: {
      startedAt: new Date(Date.now() - 55 * 60000).toISOString(),
      endedAt: new Date().toISOString(),
    },
  },
})
await page.goto(`${BASE}/day/chest/summary`)
await page.locator('.btn-complete').waitFor()
if (await page.locator('.advice-row').first().isVisible()) {
  await shot(page, '10-summary-with-advice')
}
await shot(page, '11-summary-complete')

// ── 发现页 ──
await page.goto(`${BASE}/discover`)
await page.locator('.discover-grid').waitFor()
await shot(page, '12-discover-hub')

// ── 资料库 ──
await page.goto(`${BASE}/library`)
await page.locator('.lib-card').first().waitFor()
await shot(page, '13-library-default')

await page.locator('input.lib-search').fill('RIR')
await page.waitForTimeout(400)
await shot(page, '14-library-search')

// ── 训练记录 ──
await seed(page, {
  logs: {
    [`${dateKey(-1)}|back`]: {
      b_row: {
        sets: [
          { weight: 135, reps: 8, rir: 2 },
          { weight: 135, reps: 8, rir: 2 },
        ],
      },
    },
    [`${dateKey(-3)}|chest`]: {
      c_bench: {
        sets: [
          { weight: 185, reps: 8, rir: 2 },
          { weight: 185, reps: 8, rir: 2 },
        ],
      },
    },
  },
  rotation: {
    next: 0,
    history: [
      { date: dateKey(-1), dayId: 'back' },
      { date: dateKey(-3), dayId: 'chest' },
    ],
  },
})
await page.goto(`${BASE}/discover/records`)
await page.locator('.record-row').first().waitFor({ timeout: 8000 })
await shot(page, '15-records-list')

const firstRow = page.locator('.record-row-btn').first()
if (await firstRow.isVisible()) {
  await firstRow.click()
  await page.waitForTimeout(400)
  await shot(page, '16-records-expanded')
}

// ── 训练统计 ──
await page.goto(`${BASE}/discover/stats`)
await page.locator('.stats-grid').waitFor()
await shot(page, '17-stats-overview')

const exRow = page.locator('.ex-row-btn').first()
if (await exRow.isVisible()) {
  await exRow.click()
  await page.waitForTimeout(400)
  await shot(page, '18-stats-exercise-expanded')
}

// ── 健身工具（非凑重）──
await page.goto(`${BASE}/discover/tools`)
await page.locator('.tool-card', { hasText: '1RM 估算' }).waitFor()
await shot(page, '19-tools-1rm')

await page
  .locator('.tool-card', { hasText: 'BMI' })
  .locator('.tool-head')
  .click()
await page.locator('.tool-card.open', { hasText: 'BMI' }).waitFor()
await shot(page, '20-tools-bmi')

await page
  .locator('.tool-card', { hasText: '容量' })
  .locator('.tool-head')
  .click()
await page.locator('.tool-card.open', { hasText: '容量' }).waitFor()
await shot(page, '21-tools-volume')

// ── 设置 ──
await seed(page)
await page.goto(`${BASE}/settings`)
await page.locator('.sec-title', { hasText: '设置' }).waitFor()
await shot(page, '22-settings-default')

// ── 计划编辑 ──
await page.goto(`${BASE}/program/edit`)
await page.locator('.day-collapsible').first().waitFor()
await shot(page, '24-program-edit')

// ── 登录页 ──
await page.goto(`${BASE}/auth`)
await page.locator('.auth-form').waitFor()
await shot(page, '25-auth-signin')

await page.locator('.auth-switch button', { hasText: '注册' }).click()
await page.waitForTimeout(300)
await shot(page, '26-auth-signup')

await browser.close()
console.log('→', OUT)
