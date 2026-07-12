/**
 * Fitness 设置页 UI 截图 + 布局验收
 * 用法：
 *   npm run build -w fitness-os
 *   npm run pwa:preview -w fitness-os
 *   node apps/fitness/scripts/settings-screenshot-audit.mjs
 */
import { chromium, devices } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveScreenshotDir,
  resolveViewportShotPath,
  writeManifest,
  writeReport,
} from '../../../scripts/qa/screenshot-output.mjs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'
const MOBILE = devices['iPhone 13'].viewport
const STORAGE_KEY = 'fitos_v2'

const { dir: OUT } = resolveScreenshotDir({
  app: 'fitness',
  suite: 'settings-ui-audit',
  importMetaUrl: import.meta.url,
})

const SECTIONS = [
  { id: 'appearance', title: '外观', testId: null },
  { id: 'notifications', title: '后台通知', testId: 'settings-notifications' },
  { id: 'account', title: '账号与云同步', testId: 'settings-sync' },
  { id: 'program', title: '训练计划模板', testId: null },
  { id: 'rotation', title: '训练轮换', testId: null },
  { id: 'units', title: '单位与反馈', testId: null },
  { id: 'logging', title: '训练记录', testId: null },
  { id: 'data', title: '数据', testId: 'settings-backup' },
]

function seedPayload() {
  return {
    settings: {
      unit: 'lbs',
      logDetail: 'quick',
      theme: 'dark',
      locale: 'zh',
      sound: true,
      notifyRest: true,
      lockPortraitOnPhone: true,
    },
    weights: { c_bench: 185 },
    logs: {},
    rotation: { next: 2, history: [], lastDeload: null },
  }
}

/** @param {import('@playwright/test').Page} page */
async function seed(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value))
    },
    { key: STORAGE_KEY, value: seedPayload() },
  )
}

/** @param {import('@playwright/test').Page} page */
async function prepareMobilePwa(page) {
  await page.addInitScript(() => {
    document.documentElement.classList.add('standalone-pwa')
  })
}

/** @param {import('@playwright/test').Page} page */
function auditLayout(page) {
  return page.evaluate(() => {
    /** @type {{ severity: string, code: string, message: string, detail?: Record<string, unknown> }[]} */
    const issues = []
    const vw = window.innerWidth
    const isMobile = vw <= 839

    const toggleRows = [
      ...document.querySelectorAll('.settings-row--toggle'),
      ...document.querySelectorAll('.settings-row:has(.settings-toggle)'),
    ]

    toggleRows.forEach((row, index) => {
      const copy = row.querySelector('.pref-copy')
      const toggle = row.querySelector('.settings-toggle')
      if (!copy || !toggle) return

      const rowRect = row.getBoundingClientRect()
      const toggleRect = toggle.getBoundingClientRect()
      const copyRect = copy.getBoundingClientRect()

      const verticalDelta = Math.abs(
        (toggleRect.top + toggleRect.height / 2) -
          (copyRect.top + Math.min(copyRect.height, 48) / 2),
      )
      if (verticalDelta > 28) {
        issues.push({
          severity: 'high',
          code: 'toggle-not-horizontal',
          message: 'Toggle 未与标签同一行',
          detail: { index, verticalDelta: Math.round(verticalDelta) },
        })
      }

      const trailingGap = rowRect.right - toggleRect.right
      if (trailingGap > 72) {
        issues.push({
          severity: 'high',
          code: 'toggle-not-trailing',
          message: 'Toggle 未靠右对齐',
          detail: { index, trailingGap: Math.round(trailingGap) },
        })
      }
    })

    if (isMobile) {
      document
        .querySelectorAll('.settings-row.set-row:not(.settings-row--toggle):not(:has(.settings-toggle))')
        .forEach((row, index) => {
          const seg = row.querySelector('.seg')
          const copy = row.querySelector('.pref-copy')
          if (!seg || !copy) return
          const stacked = seg.getBoundingClientRect().top >= copy.getBoundingClientRect().bottom - 4
          if (!stacked) {
            issues.push({
              severity: 'high',
              code: 'segment-not-stacked',
              message: '移动端 Segment 未置于标签下方',
              detail: { index, label: copy.textContent?.trim().slice(0, 24) },
            })
          }
        })
    }

    const notifySection = document.querySelector('[data-testid="settings-notifications"]')
    if (notifySection) {
      const sectionTitle = notifySection.querySelector('.sg-title')?.textContent?.trim()
      const rowLabel = notifySection.querySelector('.sr-label')?.textContent?.trim()
      if (sectionTitle && rowLabel && sectionTitle === rowLabel) {
        issues.push({
          severity: 'medium',
          code: 'notify-title-duplicate',
          message: '通知区 section 标题与行标签重复',
          detail: { sectionTitle, rowLabel },
        })
      }
      if (rowLabel && rowLabel !== '休息结束提醒') {
        issues.push({
          severity: 'medium',
          code: 'notify-row-label',
          message: '通知行标签应为「休息结束提醒」',
          detail: { rowLabel },
        })
      }
    }

    const pageText = document.body.innerText
    if (pageText.includes('选「系统」时')) {
      issues.push({
        severity: 'medium',
        code: 'theme-copy-mismatch',
        message: '明暗模式说明仍使用「系统」而非「跟随系统」',
      })
    }

    const replaceBtn = [...document.querySelectorAll('button')].find((b) =>
      /云端覆盖本机/.test(b.textContent || ''),
    )
    if (replaceBtn && !replaceBtn.classList.contains('btn-danger')) {
      issues.push({
        severity: 'high',
        code: 'replace-not-danger',
        message: '「云端覆盖本机」未使用 danger 样式',
      })
    }

    const signOut = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('退出登录'),
    )
    if (signOut?.classList.contains('btn-danger')) {
      issues.push({
        severity: 'medium',
        code: 'signout-is-danger',
        message: '「退出登录」仍为 danger 样式',
      })
    }

    const unitSection = [...document.querySelectorAll('.settings-block.set-group')].find((s) =>
      (s.querySelector('.sg-title')?.textContent || '').includes('单位与反馈'),
    )
    // Toggle rows stay row; segment rows stay column — expected per iOS HIG / SAP stacked seg

    const segButtons = [...document.querySelectorAll('.settings-page .seg button')]
    const smallTap = segButtons.filter((btn) => btn.getBoundingClientRect().height < 40)
    if (smallTap.length) {
      issues.push({
        severity: 'medium',
        code: 'seg-tap-target',
        message: `${smallTap.length} 个 Segment 按钮高度 < 40px`,
        detail: {
          heights: smallTap.map((b) => Math.round(b.getBoundingClientRect().height)),
        },
      })
    }

    const legacyBareRows = document.querySelectorAll('.set-group > .set-row:not(.settings-row)')
    if (legacyBareRows.length > 0) {
      issues.push({
        severity: 'high',
        code: 'legacy-set-row',
        message: `仍有 ${legacyBareRows.length} 处 legacy 裸 .set-row`,
      })
    }

    return {
      viewportWidth: vw,
      isMobile,
      toggleRowCount: toggleRows.length,
      segmentRowCount: document.querySelectorAll('.settings-row .seg').length,
      issueCount: issues.length,
      issues,
      pass: issues.filter((i) => i.severity === 'high').length === 0,
    }
  })
}

/** @param {import('@playwright/test').Page} page @param {string} name */
async function shot(page, name) {
  await page.waitForTimeout(300)
  const path = resolveViewportShotPath(OUT, 'mobile', { surface: name })
  await page.screenshot({ path, fullPage: false })
  return path
}

/** @param {import('@playwright/test').Page} page */
async function scrollToSection(page, section) {
  if (section.testId) {
    const loc = page.locator(`[data-testid="${section.testId}"]`)
    if (await loc.count()) {
      await loc.first().scrollIntoViewIfNeeded()
      return
    }
  }
  const title = page.locator('.sg-title', { hasText: section.title })
  if (await title.count()) {
    await title.first().scrollIntoViewIfNeeded()
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: MOBILE,
  deviceScaleFactor: devices['iPhone 13'].deviceScaleFactor,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()

await prepareMobilePwa(page)
await seed(page)

await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 45000 })
await page.locator('.page-title', { hasText: '设置' }).waitFor({ timeout: 15000 })
await page.locator('.settings-page').waitFor({ timeout: 10000 })
await page.waitForTimeout(600)

const shots = []
shots.push({ name: 'settings-top', path: await shot(page, 'settings-top') })

for (const section of SECTIONS) {
  await scrollToSection(page, section)
  await page.waitForTimeout(350)
  const path = await shot(page, `section-${section.id}`)
  shots.push({ name: section.id, path })
}

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(400)
shots.push({ name: 'settings-bottom', path: await shot(page, 'settings-bottom') })

const fullPath = join(OUT, 'mobile', 'settings-fullpage.png')
await page.screenshot({ path: fullPath, fullPage: true })
shots.push({ name: 'settings-fullpage', path: fullPath })

const audit = await auditLayout(page)

writeManifest(OUT, {
  baseUrl: BASE,
  viewport: MOBILE,
  shots: shots.map((s) => s.name),
  auditPass: audit.pass,
  issueCount: audit.issueCount,
})

writeReport(OUT, 'audit', audit)

await browser.close()

console.log('\n=== Fitness 设置页截图验收 ===')
console.log('输出目录:', OUT)
console.log('截图:', shots.map((s) => s.name).join(', '))
console.log(`布局检查: ${audit.pass ? 'PASS' : 'FAIL'} (${audit.issueCount} 项)`)
if (audit.issues.length) {
  for (const issue of audit.issues) {
    console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`)
  }
}

process.exit(audit.pass ? 0 : 1)
