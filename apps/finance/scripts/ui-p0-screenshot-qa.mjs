/**
 * UI P0 截图 + 横向溢出检查（390px 移动端）
 * 用法：先 npm run dev，再 node scripts/ui-p0-screenshot-qa.mjs
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  resolveScreenshotDir,
  resolveShotPath,
  slugify,
} from '../../../scripts/qa/screenshot-output.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { dir: shotDir } = resolveScreenshotDir({
  app: 'finance',
  suite: 'p0-mobile',
  importMetaUrl: import.meta.url,
})
const storageKey = 'life_os_auth'
const baseUrl = process.env.UI_QA_URL ?? 'http://localhost:5173'
const viewportWidth = Number(process.env.UI_QA_WIDTH ?? 402)
const viewportHeight = Number(process.env.UI_QA_HEIGHT ?? 874)

function loadEnv() {
  try {
    return Object.fromEntries(
      readFileSync(resolve(root, '.env.local'), 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=')
          return [l.slice(0, i), l.slice(i + 1)]
        }),
    )
  } catch {
    return {}
  }
}

function overflowReport() {
  const root = document.documentElement
  const viewportWidth = root.clientWidth
  const scrollWidth = root.scrollWidth
  const overflowPx = scrollWidth - viewportWidth
  const offenders = []
  if (overflowPx > 1) {
    for (const node of document.querySelectorAll('body *')) {
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      if (rect.left >= -1 && rect.right <= viewportWidth + 1) continue
      offenders.push({
        tag: node.tagName.toLowerCase(),
        className: String(node.className ?? '').slice(0, 80),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      })
      if (offenders.length >= 8) break
    }
  }
  return { viewportWidth, scrollWidth, overflowPx, offenders }
}

const env = loadEnv()
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error('Missing .env.local Supabase credentials')
  process.exit(1)
}

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey, persistSession: false },
})

const email = process.env.UI_QA_EMAIL ?? 'p1a-rls-test-b@example.test'
const password = process.env.UI_QA_PASSWORD ?? 'P1aTestPass!2026'

const { data: auth, error } = await sb.auth.signInWithPassword({
  email,
  password,
})
if (error || !auth.session) {
  console.error('Auth failed:', error?.message)
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: viewportWidth, height: viewportHeight })

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
await page.evaluate(
  ({ key, session }) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      }),
    )
  },
  { key: storageKey, session: auth.session },
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(5000)

const bodyText = await page.locator('body').innerText()
await page.screenshot({
  path: resolveShotPath(shotDir, { seq: 1, surface: 'after-login' }),
  fullPage: true,
})

if (
  bodyText.includes('请使用你的账户登录') ||
  bodyText.includes('需要配置 Supabase') ||
  bodyText.includes('正在加载')
) {
  await page.screenshot({
    path: resolveShotPath(shotDir, {
      seq: 0,
      surface: 'auth',
      state: 'failed',
    }),
    fullPage: true,
  })
  console.error('App did not reach ready state:', bodyText.slice(0, 400))
  await browser.close()
  process.exit(1)
}

const results = []

async function checkTab(name, buttonLabel, checks) {
  const nav = page
    .locator('.mobile-tabbar')
    .getByRole('button', { name: buttonLabel })
  await nav.first().click({ timeout: 15000 })
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)

  const path = resolveShotPath(shotDir, { surface: slugify(name) })
  await page.screenshot({ path, fullPage: true })

  const report = await page.evaluate(overflowReport)
  const text = await page.locator('body').innerText()

  const failedChecks = []
  for (const [label, fn] of Object.entries(checks)) {
    if (!fn(text, report)) failedChecks.push(label)
  }

  results.push({
    name,
    path,
    overflow: report,
    failedChecks,
    textSample: text.slice(0, 200),
  })
}

await checkTab('01_today', '今日', {
  stsLabel: (t) => t.includes('现在可放心花'),
  noOldLabel: (t) => !t.includes('未来低谷余量可花'),
  shortIntro: (t) => t.includes('今天先看'),
  noHorizontalOverflow: (_t, r) => r.overflowPx <= 1,
})

await checkTab('02_overview', '总览', {
  stsLabel: (t) => t.includes('现在可放心花'),
  noHorizontalOverflow: (_t, r) => r.overflowPx <= 1,
})

await checkTab('03_forecast', '预测', {
  editAssumptions: (t) => t.includes('编辑假设'),
  mobileControls: (t) => t.includes('能动的钱') || t.includes('1年'),
  noHorizontalOverflow: (_t, r) => r.overflowPx <= 1,
})

// Scroll today bottom area for FAB overlap visual
await page
  .locator('.mobile-tabbar')
  .getByRole('button', { name: '今日' })
  .first()
  .click()
await page.waitForTimeout(800)
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(400)
await page.screenshot({
  path: resolveShotPath(shotDir, {
    seq: 4,
    surface: 'today',
    state: 'scrolled-bottom',
  }),
  fullPage: false,
})

// More sheet
await page
  .locator('.mobile-tabbar')
  .getByRole('button', { name: '更多' })
  .click()
await page.waitForTimeout(600)
await page.screenshot({
  path: resolveShotPath(shotDir, { seq: 5, surface: 'more-sheet' }),
  fullPage: false,
})
const tabbarOpacity = await page.evaluate(() => {
  const el = document.querySelector('.mobile-tabbar')
  if (!el) return null
  const style = getComputedStyle(el)
  return {
    className: el.className,
    opacity: style.opacity,
    pointerEvents: style.pointerEvents,
  }
})
results.push({
  name: '05_more_sheet',
  tabbarBackgrounded:
    tabbarOpacity?.className.includes('is-backgrounded') ?? false,
  tabbarOpacity: tabbarOpacity?.opacity,
})

await browser.close()

console.log(
  `\n=== UI P0 Screenshot QA (${viewportWidth}x${viewportHeight}) ===\n`,
)
let allOk = true
for (const r of results) {
  if (r.failedChecks) {
    const ok = r.failedChecks.length === 0 && (r.overflow?.overflowPx ?? 0) <= 1
    if (!ok) allOk = false
    console.log(`${ok ? 'PASS' : 'FAIL'} ${r.name}`)
    if (r.overflow) {
      console.log(
        `  overflow: ${r.overflow.overflowPx}px (scroll ${r.overflow.scrollWidth} vs viewport ${r.overflow.viewportWidth})`,
      )
      if (r.overflow.offenders?.length) {
        console.log(`  offenders:`, r.overflow.offenders.slice(0, 3))
      }
    }
    if (r.failedChecks.length) console.log(`  failed checks:`, r.failedChecks)
    console.log(`  screenshot: ${r.path}`)
  } else {
    console.log(
      `INFO ${r.name} tabbar backgrounded=${r.tabbarBackgrounded} opacity=${r.tabbarOpacity}`,
    )
  }
}

console.log(`\nScreenshots saved to: ${shotDir}`)
process.exit(allOk ? 0 : 1)
