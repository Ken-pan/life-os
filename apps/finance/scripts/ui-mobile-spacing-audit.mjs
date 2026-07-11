/**
 * 移动端间距审计：测量关键布局间距 + 全页截图
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { dir: shotDir } = resolveScreenshotDir({
  app: 'finance',
  suite: 'mobile-spacing-audit',
  importMetaUrl: import.meta.url,
})
const baseUrl = process.env.UI_QA_URL ?? 'http://localhost:5180'

const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey: 'life_os_auth', persistSession: false },
})
const email = process.env.FINANCE_QA_EMAIL ?? process.env.UI_QA_EMAIL
const password = process.env.FINANCE_QA_PASSWORD ?? process.env.UI_QA_PASSWORD
if (!email || !password) throw new Error('Missing rotated FINANCE_QA_EMAIL or FINANCE_QA_PASSWORD (values redacted)')
const { data: auth } = await sb.auth.signInWithPassword({
  email,
  password,
})

const tabs = [
  { id: 'today', label: '今日', nav: '今日' },
  { id: 'overview', label: '总览', nav: '总览' },
  { id: 'history', label: '记录', nav: '记录' },
  { id: 'forecast', label: '预测', nav: '预测' },
  { id: 'more', label: '更多', action: 'more' },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 402, height: 874 } })
await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.evaluate((session) => {
  localStorage.setItem('life_os_auth', JSON.stringify(session))
  localStorage.setItem('fos-theme', 'light')
}, auth.session)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

async function measureLayout() {
  return page.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el) : null)
    const px = (v) => Math.round(parseFloat(v) || 0)
    const header = document.querySelector('.page-header')
    const content = document.querySelector('.content')
    const firstCard = document.querySelector(
      '.content .card, .content .grid > .card, .content .grid > *',
    )
    const tabbar = document.querySelector('.mobile-tabbar')
    const fab = document.querySelector('.fab')

    const headerRect = header?.getBoundingClientRect()
    const contentRect = content?.getBoundingClientRect()
    const firstRect = firstCard?.getBoundingClientRect()
    const tabbarRect = tabbar?.getBoundingClientRect()

    const issues = []

    const contentStyle = cs(content)
    const padTop = px(contentStyle?.paddingTop)
    const padX = px(contentStyle?.paddingLeft)
    const padBottom = px(contentStyle?.paddingBottom)

    if (padTop > padX + 4) {
      issues.push(
        `content 上内边距 ${padTop}px > 左右 ${padX}px，首屏可能头重脚轻`,
      )
    }
    if (padX !== 16 && padX !== 12) {
      issues.push(`content 左右内边距 ${padX}px 非 16/12 token`)
    }

    const gapHeaderToContent =
      headerRect && contentRect
        ? Math.round(
            firstRect
              ? firstRect.top - headerRect.bottom
              : contentRect.top - headerRect.bottom,
          )
        : null

    if (firstCard) {
      const cardPad = px(cs(firstCard).paddingTop)
      if (cardPad === 14)
        issues.push(
          `卡片 padding ${cardPad}px（640 断点 14px 与 16px 体系不一致）`,
        )
    }

    if (tabbarRect && fab) {
      const fabRect = fab.getBoundingClientRect()
      const gapFabTab = Math.round(tabbarRect.top - fabRect.bottom)
      if (gapFabTab < 10 || gapFabTab > 18) {
        issues.push(`FAB 与底栏间距 ${gapFabTab}px 异常`)
      }
    }

    // nested grid gaps in first viewport
    const grids = [...document.querySelectorAll('.content .grid')].slice(0, 3)
    const gridGaps = grids.map((g, i) => ({
      i,
      gap: px(cs(g).gap),
      className: g.className.slice(0, 60),
    }))

    return {
      content: { padTop, padX, padBottom },
      gapHeaderToFirst: gapHeaderToContent,
      cardPad: firstCard ? px(cs(firstCard).paddingTop) : null,
      gridGaps,
      issues,
    }
  })
}

const report = { viewport: '402x874', pages: [] }

for (const tab of tabs) {
  if (tab.action === 'more') {
    await page.locator('nav.mobile-tabbar button[aria-label="更多"]').click()
    await page.waitForTimeout(400)
  } else {
    await page
      .locator(`nav.mobile-tabbar button[aria-label="${tab.nav}"]`)
      .click()
    await page.waitForTimeout(500)
  }

  const metrics = await measureLayout()
  await page.screenshot({ path: resolve(shotDir, `${tab.id}.png`) })
  report.pages.push({ tab: tab.id, ...metrics })

  if (tab.action === 'more') {
    await page.locator('.mobile-more-close').click()
    await page.waitForTimeout(200)
  }
}

// dark mode today
await page.locator('nav.mobile-tabbar button[aria-label="今日"]').click()
await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark')
  localStorage.setItem('fos-theme', 'dark')
})
await page.waitForTimeout(300)
report.pages.push({ tab: 'today-dark', ...(await measureLayout()) })
await page.screenshot({ path: resolve(shotDir, 'today-dark.png') })

writeFileSync(resolve(shotDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
