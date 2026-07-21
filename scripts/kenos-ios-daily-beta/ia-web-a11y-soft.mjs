/**
 * Soft residual: Continue / Quick Switch touch targets + aria labels (LAN Web).
 * Complements OS Dynamic Type / VoiceOver Settings sweep (still needs unlocked device).
 */
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const ORIGIN = process.env.KENOS_ORIGIN || 'http://127.0.0.1:5219'
const OUT =
  process.env.EVIDENCE_DIR ||
  path.join(ROOT, 'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21')

const result = {
  ts: new Date().toISOString(),
  origin: ORIGIN,
  scope: 'LAN_WEB_A11Y_SOFT',
  minTouchPx: 44,
  controls: {},
  pass: false,
}

/**
 * @param {import('playwright').Locator} loc
 */
async function measure(loc) {
  const box = await loc.boundingBox()
  const label = (await loc.getAttribute('aria-label')) || ''
  const title = (await loc.getAttribute('title')) || ''
  const testid = (await loc.getAttribute('data-testid')) || ''
  return {
    testid,
    ariaLabel: label,
    title,
    width: box?.width ?? 0,
    height: box?.height ?? 0,
    meets44: Boolean(box && box.width >= 44 && box.height >= 44),
    hasName: Boolean(label || title),
  }
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'zh-CN',
  })
  const page = await context.newPage()
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('kenos.iosNativeShell')
    } catch {
      /* ignore */
    }
    document.documentElement.removeAttribute('data-ios-native-shell')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  await page.getByTestId('kenos-system-bar').waitFor({ timeout: 20000 })
  const cont = page.getByTestId('kenos-space-switcher-fab')
  const quick = page.getByTestId('kenos-quick-switch-trigger')
  result.controls.continue = await measure(cont)
  result.controls.quickSwitch = await measure(quick)

  // Close sheet if open accidentally
  result.pass = Boolean(
    result.controls.continue.hasName &&
      result.controls.quickSwitch.hasName &&
      result.controls.continue.meets44 &&
      result.controls.quickSwitch.meets44,
  )
  result.notes = []
  if (!result.controls.continue.meets44) {
    result.notes.push(
      `Continue chip ${result.controls.continue.width}x${result.controls.continue.height} < 44px`,
    )
  }
  if (!result.controls.quickSwitch.meets44) {
    result.notes.push('Quick Switch icon button below 44px')
  }

  await browser.close()
  const outFile = path.join(OUT, 'logs/ia-web-a11y-soft.json')
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.pass ? 0 : 1)
}

main().catch((e) => {
  result.error = String(e?.stack || e)
  fs.writeFileSync(
    path.join(OUT, 'logs/ia-web-a11y-soft.json'),
    JSON.stringify(result, null, 2),
  )
  process.exit(2)
})
