/**
 * IA canonical route smoke — verifies pathname routes render without crash (authenticated).
 * Usage: npm run dev -- --port 5180
 *        UI_QA_URL=http://localhost:5180 node scripts/ia-route-smoke.mjs
 */
import { chromium } from 'playwright'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  injectLifeOsSession,
  loadFinanceQaEnv,
  signInForFinanceQa,
} from './ia-qa-auth.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const baseUrl = process.env.UI_QA_URL ?? 'http://localhost:5180'

const ROUTES = [
  '/home/today',
  '/home/overview',
  '/accounts',
  '/history/insights',
  '/history/fixed',
  '/history/oneoff',
  '/stocks',
  '/forecast/forecast',
  '/forecast/scenarios',
  '/decision/compare',
  '/decision/saved',
  '/decision/log',
  '/review/import',
  '/review/queue',
  '/review/baseline',
  '/review/calibrate',
  '/review/reconcile',
  '/settings/assumptions',
  '/settings/app',
  '/settings/help',
  '/#/today',
  '/#/settings/accounts',
]

let env
try {
  env = loadFinanceQaEnv(root)
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}

let session
try {
  session = await signInForFinanceQa(env)
} catch (e) {
  console.error('Auth failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const failures = []

try {
  await injectLifeOsSession(page, session, baseUrl)

  for (const route of ROUTES) {
    const url = `${baseUrl}${route}`
    try {
      const res = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      if (!res || !res.ok()) {
        failures.push({ route, error: `HTTP ${res?.status() ?? 'unknown'}` })
        continue
      }
      await page.waitForSelector('.app-shell', { timeout: 15000 })
      const bodyText = await page.locator('body').innerText()
      if (
        bodyText.includes('请使用你的账户登录') ||
        bodyText.includes('Sign in')
      ) {
        failures.push({ route, error: 'auth gate — session not applied' })
        continue
      }
      const title = await page.locator('h1').first().textContent()
      if (!title?.trim()) {
        failures.push({ route, error: 'missing h1' })
      }
    } catch (e) {
      failures.push({
        route,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
} catch (e) {
  console.error('Setup failed:', e instanceof Error ? e.message : e)
  await browser.close()
  process.exit(1)
}

await browser.close()

if (failures.length > 0) {
  console.error('IA route smoke failures:')
  for (const f of failures) console.error(`  ${f.route}: ${f.error}`)
  process.exit(1)
}

console.log(`IA route smoke OK (${ROUTES.length} routes, authenticated)`)
