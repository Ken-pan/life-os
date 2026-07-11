/**
 * English locale i18n gap audit — screenshot + CJK detection.
 * Usage: npm run dev -- --port 5180
 *        UI_QA_URL=http://localhost:5180 node scripts/ui-i18n-en-screenshot-qa.mjs
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dateTag = process.env.UI_QA_DATE ?? 'i18n-en-audit'
const { dir: shotRoot } = resolveScreenshotDir({
  app: 'finance',
  suite: 'i18n-en',
  importMetaUrl: import.meta.url,
  runId: process.env.QA_RUN_ID ?? dateTag,
})
const storageKey = 'life_os_auth'
const localeKey = 'fos-locale'
const baseUrl = process.env.UI_QA_URL ?? 'http://localhost:5180'

const VIEWPORTS = [{ id: 'desktop', width: 1440, height: 900 }]

const MAIN_TABS = [
  { id: 'today', label: 'Today' },
  { id: 'overview', label: 'Overview' },
  { id: 'stocks', label: 'Allocation' },
  { id: 'history', label: 'Records' },
  { id: 'review', label: 'Review' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'decision', label: 'Decisions' },
  { id: 'settings', label: 'Settings' },
]

const SUB_TABS = {
  history: [
    ['Insights', '洞察'],
    ['Recurring', '固定收支'],
    ['One-off', '大额收支'],
  ],
  forecast: [
    ['Forecast curve', '预测曲线'],
    ['Long-range plan', '长期规划'],
  ],
  review: [
    ['Import', '导入交易'],
    ['Review queue', '审查队列'],
    ['Spending baseline', '消费基线'],
    ['Update plan', '更新计划'],
    ['Reconcile accounts', '账户对账'],
  ],
  decision: [
    ['Compare', '对比'],
    ['Saved plans', '已保存方案'],
    ['Decision log', '决策日志'],
  ],
  settings: [
    ['Accounts', '账户'],
    ['Forecast assumptions', '预测参数'],
    ['App preferences', '应用偏好'],
  ],
}

mkdirSync(resolve(shotRoot, 'desktop'), { recursive: true })

function loadEnv() {
  return Object.fromEntries(
    readFileSync(resolve(root, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i), l.slice(i + 1)]
      }),
  )
}

/** Heuristic: user transaction / account data vs UI chrome. */
function classifyChinese(line) {
  if (/^\d{4}-\d{2}-\d{2}/.test(line)) return 'data'
  if (
    /[\$¥€£][\d,]+/.test(line) &&
    /[\u4e00-\u9fff]/.test(line) &&
    line.length > 30
  )
    return 'data'
  if (/^(CHASE|AMEX|BOA|WF|CITI|Apple Card)/i.test(line)) return 'data'
  return 'ui'
}

function findChineseSnippets(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const hits = []
  const seen = new Set()
  for (const line of lines) {
    if (!/[\u4e00-\u9fff]/.test(line)) continue
    const key = line.slice(0, 120)
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({ text: line.slice(0, 200), kind: classifyChinese(line) })
  }
  return hits
}

const env = loadEnv()
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey, persistSession: false },
})

const email = process.env.FINANCE_QA_EMAIL ?? process.env.UI_QA_EMAIL
const password = process.env.FINANCE_QA_PASSWORD ?? process.env.UI_QA_PASSWORD
if (!email || !password) throw new Error('Missing rotated FINANCE_QA_EMAIL or FINANCE_QA_PASSWORD (values redacted)')

const { data: auth, error } = await sb.auth.signInWithPassword({
  email,
  password,
})
if (error || !auth.session) {
  console.error('Auth failed:', error?.message)
  process.exit(1)
}

const localeUpdate = await sb
  .from('finance_user_settings')
  .update({ locale: 'en-US', updated_at: new Date().toISOString() })
  .eq('user_id', auth.session.user.id)
if (localeUpdate.error) {
  console.warn(
    'Could not set server locale (column may be missing):',
    localeUpdate.error.message,
  )
}

const audit = []

async function injectSession(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ key, session, locKey }) => {
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
      localStorage.setItem(locKey, 'en-US')
    },
    { key: storageKey, session: auth.session, locKey: localeKey },
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(4000)
  // Force client locale even if cloud locale column is missing.
  await page.evaluate((locKey) => {
    localStorage.setItem(locKey, 'en-US')
    document.documentElement.lang = 'en-US'
  }, localeKey)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  const nav = page
    .locator('.sidebar')
    .getByRole('button', { name: /Today|今日/ })
  try {
    await nav.first().waitFor({ state: 'visible', timeout: 30000 })
  } catch {
    await page.screenshot({
      path: resolve(shotRoot, 'desktop', '00_boot_failed.png'),
      fullPage: true,
    })
    const body = await page.locator('body').innerText()
    throw new Error(`App boot failed: ${body.slice(0, 500)}`)
  }
}

async function clickSubTabFlexible(page, labels) {
  for (const label of labels) {
    const tab = page
      .locator('.horizontal-tabs')
      .getByRole('button', { name: label })
    if (await tab.count()) {
      await tab.first().click()
      await page.waitForTimeout(900)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(200)
      return label
    }
  }
  return null
}

async function clickMainTab(page, label) {
  const btn = page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp(`^${label}$`, 'i') })
  if (await btn.count()) {
    await btn.first().click()
  } else {
    // Fallback Chinese nav if locale stuck
    const zhMap = {
      Today: '今日',
      Overview: '总览',
      Allocation: '资产配置',
      Records: '记录',
      Review: '审查',
      Forecast: '预测',
      Decisions: '决策',
      Settings: '设置',
    }
    const zh = zhMap[label] ?? label
    await page.locator('.sidebar').getByRole('button', { name: zh }).click()
  }
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)
}

async function clickSubTab(page, label) {
  const tab = page
    .locator('.horizontal-tabs')
    .getByRole('button', { name: label })
  if (await tab.count()) {
    await tab.first().click()
    await page.waitForTimeout(900)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(200)
  }
}

async function capture(page, name) {
  const path = resolve(shotRoot, 'desktop', `${name}.png`)
  await page.screenshot({ path, fullPage: true })
  const text = await page.locator('body').innerText()
  const chinese = findChineseSnippets(text)
  const uiChinese = chinese.filter((h) => h.kind === 'ui')
  const entry = {
    name,
    path,
    chineseCount: chinese.length,
    uiChineseCount: uiChinese.length,
    chinese: chinese.slice(0, 40),
    uiChinese: uiChinese.slice(0, 30).map((h) => h.text),
  }
  audit.push(entry)
  const status = uiChinese.length === 0 ? 'OK' : 'CJK'
  console.log(
    `${status} ${name} — ${uiChinese.length} UI / ${chinese.length} total Chinese line(s)`,
  )
  if (uiChinese.length > 0) {
    for (const s of uiChinese.slice(0, 8)) console.log(`    · ${s.text}`)
    if (uiChinese.length > 8) console.log(`    … +${uiChinese.length - 8} more`)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })
await injectSession(page)

await page.goto(`${baseUrl}/settings/app`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const englishBtn = page.locator('.settings-section .seg button', {
  hasText: 'English',
})
if (await englishBtn.count()) await englishBtn.first().click()
await page.waitForTimeout(2000)
await page.goto(`${baseUrl}/home/today`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const bodyText = await page.locator('body').innerText()
if (!bodyText.includes('Today') && !bodyText.includes('Safe to spend')) {
  await page.screenshot({
    path: resolve(shotRoot, 'desktop', '00_locale_failed.png'),
    fullPage: true,
  })
  console.error('Locale switch failed')
  process.exit(1)
}

await capture(page, '00_after_login_en')

for (const tab of MAIN_TABS) {
  await clickMainTab(page, tab.label)
  const subs = SUB_TABS[tab.id]
  if (subs) {
    for (const labels of subs) {
      const hit = await clickSubTabFlexible(page, labels)
      const slug = (hit ?? labels[0])
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      await capture(page, `${tab.id}-${slug}`)
    }
  } else {
    await capture(page, tab.id)
  }
}

// Drawers
await clickMainTab(page, 'Today')
const fab = page.getByRole('button', { name: 'Log transaction' })
if (await fab.count()) {
  await fab.first().click()
  await page.waitForTimeout(600)
  await page.screenshot({
    path: resolve(shotRoot, 'desktop', 'drawer-txn.png'),
    fullPage: false,
  })
  const text = await page.locator('body').innerText()
  audit.push({
    name: 'drawer-txn',
    path: resolve(shotRoot, 'desktop', 'drawer-txn.png'),
    chineseCount: findChineseSnippets(text).length,
    chinese: findChineseSnippets(text).slice(0, 20),
  })
  const closeBtn = page
    .locator('.drawer')
    .getByRole('button', { name: /Close|关闭/ })
  if (await closeBtn.count()) await closeBtn.first().click()
}

const spendBtn = page.getByRole('button', { name: /impact|消费/ })
if (await spendBtn.count()) {
  await spendBtn.first().click()
  await page.waitForTimeout(600)
  await page.screenshot({
    path: resolve(shotRoot, 'desktop', 'drawer-spend.png'),
    fullPage: false,
  })
  const text = await page.locator('body').innerText()
  audit.push({
    name: 'drawer-spend',
    path: resolve(shotRoot, 'desktop', 'drawer-spend.png'),
    chineseCount: findChineseSnippets(text).length,
    chinese: findChineseSnippets(text).slice(0, 20),
  })
}

await browser.close()

const withCjk = audit.filter((a) => a.uiChineseCount > 0)
writeFileSync(
  resolve(shotRoot, 'report.json'),
  JSON.stringify(
    {
      date: dateTag,
      baseUrl,
      locale: 'en-US',
      audit,
      summary: { total: audit.length, withCjk: withCjk.length },
    },
    null,
    2,
  ),
)

let md = `# English i18n audit\n\nLocale: en-US · ${baseUrl}\n\n`
md += `| Screen | UI Chinese | Total Chinese |\n|--------|------------|---------------|\n`
for (const a of audit) {
  md += `| ${a.name} | ${a.uiChineseCount} | ${a.chineseCount} |\n`
}
md += `\n## Screens with remaining UI Chinese\n\n`
for (const a of withCjk) {
  md += `### ${a.name}\n\n`
  for (const s of a.uiChinese) md += `- ${s}\n`
  md += `\n`
}
writeFileSync(resolve(shotRoot, 'report.md'), md)

console.log(
  `\n=== Done: ${withCjk.length}/${audit.length} screens have Chinese text ===`,
)
console.log(`Report: ${shotRoot}/report.md`)
