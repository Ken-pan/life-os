/**
 * 混合双层 IA — 桌面侧栏 + 移动底栏导航验证
 * Usage:
 *   UI_QA_URL=https://kensfinanceos.netlify.app node scripts/ia-nav-qa.mjs
 *   UI_QA_URL=http://localhost:5180 node scripts/ia-nav-qa.mjs
 */
import { chromium } from 'playwright'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { waitForQaUrl } from '../../../scripts/qa-health.mjs'
import {
  injectLifeOsSession,
  loadFinanceQaEnv,
  signInForFinanceQa,
} from './ia-qa-auth.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const baseUrl = process.env.UI_QA_URL ?? 'https://kensfinanceos.netlify.app'

if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(baseUrl)) {
  await waitForQaUrl(baseUrl, { timeoutMs: 60_000 })
}

const DESKTOP_NAV = [
  { label: '首页', expectPath: '/home/today' },
  { label: '账户', expectPath: '/accounts' },
  { label: '记录', expectPath: '/history/insights' },
  { label: '资产配置', expectPath: '/stocks' },
  { label: '预测', expectPath: '/forecast/forecast' },
  { label: '决策', expectPath: '/decision/compare' },
  { label: '审查', expectPath: '/review/import' },
  { label: '设置', expectPath: '/settings/assumptions' },
]

const MOBILE_PRIMARY = [
  { label: '首页', expectPath: '/home/today' },
  { label: '账户', expectPath: '/accounts' },
  { label: '预测', expectPath: '/forecast/forecast' },
  { label: '审查', expectPath: '/review/import' },
]

const MOBILE_MORE = [
  { label: '记录', expectPath: '/history/insights' },
  { label: '资产配置', expectPath: '/stocks' },
  { label: '决策', expectPath: '/decision/compare' },
  { label: '设置', expectPath: '/settings/assumptions' },
]

const HOME_HUB_TABS = [
  { label: '总览', expectPath: '/home/overview' },
  { label: '今日', expectPath: '/home/today' },
]

function loadEnv() {
  return loadFinanceQaEnv(root)
}

function normPath(url) {
  return new URL(url).pathname.replace(/\/+$/, '') || '/'
}

async function injectSession(page, session) {
  await injectLifeOsSession(page, session, baseUrl)
}

async function assertAppReady(page) {
  const text = await page.locator('body').innerText()
  if (text.includes('请使用你的账户登录') || text.includes('Sign in')) {
    throw new Error('Auth gate — not signed in')
  }
  if (!text.includes('Finance')) {
    throw new Error(`Unexpected shell: ${text.slice(0, 200)}`)
  }
}

async function clickDesktopNav(page, label) {
  await page.locator('.sidebar').getByRole('button', { name: label }).click()
  await page.waitForTimeout(800)
}

async function clickMobilePrimary(page, label) {
  await page
    .locator('.mobile-tabbar')
    .getByRole('button', { name: label, exact: true })
    .first()
    .click()
  await page.waitForTimeout(800)
}

async function clickMobileMore(page, label) {
  await page.locator('.mobile-tabbar button[aria-label="更多"]').click()
  await page.waitForSelector('.mobile-more-sheet', { state: 'visible' })
  await page.locator('.mobile-more-row').filter({ hasText: label }).click()
  await page.waitForSelector('.mobile-more-sheet', { state: 'hidden' })
  await page.waitForTimeout(800)
}

async function clickHubTab(page, label) {
  const tab = page.locator('.horizontal-tabs').getByRole('tab', { name: label })
  if ((await tab.count()) === 0) return false
  await tab.first().click()
  await page.waitForTimeout(700)
  return true
}

async function touchScrollY(page, selector, deltaY) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) return false
  const x = Math.round(box.x + box.width / 2)
  const y1 = Math.round(box.y + Math.min(box.height * 0.65, box.height - 12))
  const y2 = Math.round(y1 - deltaY)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: y1 }],
  })
  for (let i = 1; i <= 10; i++) {
    const y = Math.round(y1 + (y2 - y1) * (i / 10))
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y }],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await page.waitForTimeout(250)
  return true
}

async function waitForMobileTabbar(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.mobile-tabbar')
    return el && getComputedStyle(el).display !== 'none'
  })
}

function record(results, viewport, name, ok, detail = '') {
  results.push({ viewport, name, ok, detail })
  console.log(
    `${ok ? 'PASS' : 'FAIL'} [${viewport}] ${name}${detail ? ` — ${detail}` : ''}`,
  )
}

const env = loadEnv()
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error('Missing .env.local Supabase credentials')
  process.exit(1)
}

let auth
try {
  auth = { session: await signInForFinanceQa(env) }
} catch (e) {
  console.error('Auth failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}

const browser = await chromium.launch({ headless: true })
const results = []

// --- Desktop ---
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    await injectSession(page, auth.session)
    await assertAppReady(page)

    for (const item of DESKTOP_NAV) {
      await clickDesktopNav(page, item.label)
      const path = normPath(page.url())
      const ok = path === item.expectPath
      record(
        results,
        'desktop',
        `nav:${item.label}`,
        ok,
        `got ${path}, want ${item.expectPath}`,
      )
    }

    await clickDesktopNav(page, '首页')
    for (const tab of HOME_HUB_TABS) {
      const clicked = await clickHubTab(page, tab.label)
      if (!clicked) {
        record(results, 'desktop', `hub:${tab.label}`, false, 'tab not found')
        continue
      }
      const path = normPath(page.url())
      record(
        results,
        'desktop',
        `hub:${tab.label}`,
        path === tab.expectPath,
        `got ${path}`,
      )
    }

    // legacy hash migration
    await page.goto(`${baseUrl}/#/today`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    const legacyPath = normPath(page.url())
    record(
      results,
      'desktop',
      'legacy:#/today',
      legacyPath === '/home/today',
      `got ${legacyPath}`,
    )

    const sidebarVisible = await page.locator('.sidebar').isVisible()
    record(results, 'desktop', 'sidebar-visible', sidebarVisible)
    const tabbarHidden = !(await page.locator('.mobile-tabbar').isVisible())
    record(results, 'desktop', 'mobile-tabbar-hidden', tabbarHidden)
  } catch (e) {
    record(results, 'desktop', 'setup', false, e.message)
  } finally {
    await page.close()
  }
}

// --- Mobile ---
{
  const page = await browser.newPage()
  await page.setViewportSize({ width: 402, height: 874 })
  try {
    await injectSession(page, auth.session)
    await assertAppReady(page)
    await waitForMobileTabbar(page)

    for (const item of MOBILE_PRIMARY) {
      await clickMobilePrimary(page, item.label)
      const path = normPath(page.url())
      record(
        results,
        'mobile',
        `primary:${item.label}`,
        path === item.expectPath,
        `got ${path}`,
      )
    }

    for (const item of MOBILE_MORE) {
      await clickMobileMore(page, item.label)
      const path = normPath(page.url())
      record(
        results,
        'mobile',
        `more:${item.label}`,
        path === item.expectPath,
        `got ${path}`,
      )
    }

    await clickMobilePrimary(page, '首页')
    for (const tab of HOME_HUB_TABS) {
      const clicked = await clickHubTab(page, tab.label)
      if (!clicked) {
        record(results, 'mobile', `hub:${tab.label}`, false, 'tab not found')
        continue
      }
      const path = normPath(page.url())
      record(
        results,
        'mobile',
        `hub:${tab.label}`,
        path === tab.expectPath,
        `got ${path}`,
      )
    }

    const tabbarVisible = await page.locator('.mobile-tabbar').isVisible()
    record(results, 'mobile', 'tabbar-visible', tabbarVisible)
    const sidebarHidden = !(await page.locator('.sidebar').isVisible())
    record(results, 'mobile', 'sidebar-hidden', sidebarHidden)

    // More highlight when on stocks
    await clickMobileMore(page, '资产配置')
    const moreActive = await page
      .locator('.mobile-tabbar .mobile-tab.active')
      .filter({ hasText: '更多' })
      .count()
    record(results, 'mobile', 'more-highlight:stocks', moreActive > 0)

    // Mobile document scroll (Safari browser)
    await clickMobileMore(page, '资产配置')
    const docScrollable = await page.evaluate(() => {
      return document.documentElement.scrollHeight - window.innerHeight > 200
    })
    await page.evaluate(() => window.scrollTo(0, 1200))
    await page.waitForTimeout(150)
    const docScrollY = await page.evaluate(() => window.scrollY)
    record(
      results,
      'mobile',
      'scroll:document',
      !docScrollable || docScrollY > 400,
      `scrollY=${docScrollY}`,
    )

    // PWA standalone: content region must scroll when body is locked
    await page.evaluate(() => {
      document.documentElement.classList.add('standalone-pwa')
    })
    const pwaMetrics = await page.evaluate(() => {
      const content = document.querySelector('.content')
      const shell = document.querySelector('.app-shell')
      if (!content || !shell) return { ok: false, reason: 'missing nodes' }
      const canScroll = content.scrollHeight - content.clientHeight > 200
      content.scrollTop = 1500
      return {
        ok:
          getComputedStyle(document.body).overflowY === 'hidden' &&
          getComputedStyle(shell).height !== 'auto' &&
          (!canScroll || content.scrollTop > 400),
        bodyOverflow: getComputedStyle(document.body).overflowY,
        contentScrollTop: content.scrollTop,
        shellHeight: getComputedStyle(shell).height,
      }
    })
    record(
      results,
      'mobile',
      'scroll:pwa-content',
      pwaMetrics.ok,
      JSON.stringify(pwaMetrics),
    )

    // More sheet must not leave body scroll-locked after close
    await page.evaluate(() => document.documentElement.classList.remove('standalone-pwa'))
    const beforeMoreTouch = await page.evaluate(() => window.scrollY)
    await touchScrollY(page, 'body', 350)
    const afterTouchDoc = await page.evaluate(() => window.scrollY)
    record(
      results,
      'mobile',
      'scroll:touch-document',
      afterTouchDoc > beforeMoreTouch + 80,
      `before=${beforeMoreTouch} after=${afterTouchDoc}`,
    )

    await page.locator('.mobile-tabbar .mobile-tab').filter({ hasText: '更多' }).click()
    await page.waitForTimeout(120)
    await page.locator('.mobile-more-close').click()
    await page.waitForTimeout(120)
    const afterMoreScroll = await page.evaluate(() => {
      const bodyPos = getComputedStyle(document.body).position
      const bodyInlinePos = document.body.style.position
      window.scrollTo(0, 900)
      return {
        bodyPos,
        bodyInlinePos,
        scrollY: window.scrollY,
        bodyH: document.body.scrollHeight,
        innerH: window.innerHeight,
      }
    })
    record(
      results,
      'mobile',
      'scroll:after-more-sheet',
      afterMoreScroll.bodyPos !== 'fixed' &&
        afterMoreScroll.bodyInlinePos !== 'fixed' &&
        afterMoreScroll.scrollY > 200 &&
        afterMoreScroll.bodyH > afterMoreScroll.innerH + 100,
      JSON.stringify(afterMoreScroll),
    )

    // PWA touch scroll on .content (real standalone init)
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window)
      window.matchMedia = (query) => {
        const result = original(query)
        if (query === '(display-mode: standalone)') {
          return {
            ...result,
            matches: true,
            media: query,
            addEventListener: (type, cb) => result.addEventListener(type, cb),
            removeEventListener: (type, cb) => result.removeEventListener(type, cb),
          }
        }
        return result
      }
      Object.defineProperty(navigator, 'standalone', {
        value: true,
        configurable: true,
      })
    })
    await page.goto(`${baseUrl}/stocks`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.content')
    const pwaTouchBefore = await page.evaluate(
      () => document.querySelector('.content')?.scrollTop ?? 0,
    )
    await touchScrollY(page, '.content', 420)
    const pwaTouchAfter = await page.evaluate(() => {
      const content = document.querySelector('.content')
      return {
        scrollTop: content?.scrollTop ?? 0,
        overflow: content ? getComputedStyle(content).overflowY : '',
        height: content ? getComputedStyle(content).height : '',
        flex: content ? getComputedStyle(content).flex : '',
      }
    })
    record(
      results,
      'mobile',
      'scroll:touch-pwa-content',
      pwaTouchAfter.scrollTop > pwaTouchBefore + 120,
      JSON.stringify(pwaTouchAfter),
    )
  } catch (e) {
    record(results, 'mobile', 'setup', false, e.message)
  } finally {
    await page.close()
  }
}

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log('\n--- Summary ---')
console.log(
  `Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`,
)
if (failed.length > 0) {
  console.log('\nFailures:')
  for (const f of failed) {
    console.log(`  [${f.viewport}] ${f.name}: ${f.detail}`)
  }
  process.exit(1)
}

console.log('\nAll navigation checks passed.')
