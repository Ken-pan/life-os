/**
 * 股票日线 Supabase 持久化 E2E 验证
 * 前置：npm run dev -- --port 5180
 * 用法：node scripts/stocks-daily-candles-e2e.mjs
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const { dir: shotDir } = resolveScreenshotDir({
  app: 'finance',
  suite: 'daily-candles-e2e',
  importMetaUrl: import.meta.url,
})
const storageKey = 'life_os_auth'
const baseUrl = process.env.UI_QA_URL ?? 'http://localhost:5180'

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

const env = loadEnv()
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error('FAIL: missing Supabase credentials in .env.local')
  process.exit(1)
}

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey, persistSession: false },
})

const email = process.env.FINANCE_QA_EMAIL ?? process.env.UI_QA_EMAIL
const password = process.env.FINANCE_QA_PASSWORD ?? process.env.UI_QA_PASSWORD
if (!email || !password) throw new Error('Missing rotated FINANCE_QA_EMAIL or FINANCE_QA_PASSWORD (values redacted)')

const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  checks: [],
  pass: true,
}

function check(name, ok, detail = '') {
  report.checks.push({ name, ok, detail })
  if (!ok) report.pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`)
}

const { data: auth, error: authError } = await sb.auth.signInWithPassword({
  email,
  password,
})
check('auth', !authError && Boolean(auth.session), authError?.message ?? '')
if (!auth.session) {
  writeReport()
  process.exit(1)
}

const userId = auth.session.user.id
mkdirSync(shotDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const ychartRequests = []
const candleRestRequests = []

page.on('request', (req) => {
  const url = req.url()
  if (url.includes('/api/ychart/')) ychartRequests.push(url)
  if (url.includes('holding_daily_candles')) candleRestRequests.push(url)
})

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
await page.waitForTimeout(3000)

const bodyAfterLogin = await page.locator('body').innerText()
check(
  'app_ready',
  !bodyAfterLogin.includes('请使用你的账户登录') &&
    (bodyAfterLogin.includes('今日') || bodyAfterLogin.includes('Finance')),
  bodyAfterLogin.slice(0, 120),
)

await page.locator('.sidebar').getByRole('button', { name: '资产配置' }).click()
await page.waitForTimeout(2000)

const stocksBody = await page.locator('body').innerText()
check(
  'stocks_page',
  stocksBody.includes('投资建议') || stocksBody.includes('持仓'),
  stocksBody.slice(0, 160),
)

await page.waitForTimeout(12000)

check(
  'ychart_fetched',
  ychartRequests.length > 0,
  `${ychartRequests.length} requests`,
)

const { data: rowsBefore, error: readErr } = await sb
  .from('finance_holding_daily_candles')
  .select('symbol,date,close')
  .eq('user_id', userId)
  .order('date', { ascending: false })
  .limit(20)

check(
  'supabase_read',
  !readErr,
  readErr?.message ?? `${rowsBefore?.length ?? 0} recent rows`,
)

const symbolSet = new Set(
  (rowsBefore ?? []).map((r) => String(r.symbol).toUpperCase()),
)
check(
  'candles_persisted',
  (rowsBefore?.length ?? 0) > 0,
  `symbols: ${[...symbolSet].slice(0, 5).join(', ')}`,
)

const advisorVisible =
  stocksBody.includes('投资建议') ||
  (await page.locator('text=技术信号').count()) > 0 ||
  (await page.locator('text=时机与仓位').count()) > 0
check('advisor_section', advisorVisible)

await page.screenshot({
  path: resolve(shotDir, 'stocks-after-sync.png'),
  fullPage: true,
})

await browser.close()

function writeReport() {
  report.finishedAt = new Date().toISOString()
  writeFileSync(
    resolve(shotDir, 'report.json'),
    JSON.stringify(report, null, 2),
  )
}

writeReport()
console.log(
  `\nE2E ${report.pass ? 'PASSED' : 'FAILED'} — report: docs/ui-qa-screenshots/finance/daily-candles-e2e/latest/report.json`,
)
process.exit(report.pass ? 0 : 1)
