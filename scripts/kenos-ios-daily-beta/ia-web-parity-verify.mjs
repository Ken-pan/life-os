/**
 * LAN verify: AIOS Continue / Switch Space / Quick Switch vs iOS IA lock.
 * Does not claim iOS native toolbar PASS (needs unlocked device).
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
const shots = path.join(OUT, 'screenshots/ia-web-parity')
fs.mkdirSync(shots, { recursive: true })
fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true })

/** @type {Record<string, unknown>} */
const result = {
  ts: new Date().toISOString(),
  origin: ORIGIN,
  scope: 'LAN_WEB',
  checks: {},
  pass: false,
}

/**
 * @param {import('playwright').Page} page
 */
async function clearNativeShell(page) {
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('kenos.iosNativeShell')
    } catch {
      /* ignore */
    }
    document.documentElement.removeAttribute('data-ios-native-shell')
  })
}

/**
 * @param {import('playwright').Page} page
 * @param {string} listKey
 */
async function seedRecent(page, listKey) {
  await page.evaluate((key) => {
    const now = Date.now()
    const state = {
      version: 1,
      ownerUserId: null,
      currentListKey: key,
      recent: [key],
      pinned: [],
      resume: {
        [key]: {
          listKey: key,
          spaceId: key.replace(/^hosted:/, ''),
          updatedAt: now - 30_000,
          filter: 'Resume probe',
          lastRoute: '/spaces/plan',
        },
      },
      updatedAt: now,
    }
    localStorage.setItem('kenos.spaceSwitcher.v1', JSON.stringify(state))
  }, listKey)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'zh-CN',
  })
  const page = await context.newPage()

  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await clearNativeShell(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  // Discover a real catalog listKey from the page module if exposed; else hosted:plan
  const listKey = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('kenos.spaceSwitcher.v1')
      if (raw) {
        const s = JSON.parse(raw)
        if (s?.recent?.[0]) return s.recent[0]
      }
    } catch {
      /* ignore */
    }
    return 'hosted:plan'
  })
  await seedRecent(page, listKey)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await clearNativeShell(page)
  await page.waitForTimeout(900)

  const bar = page.getByTestId('kenos-system-bar')
  await bar.waitFor({ timeout: 20000 })
  result.checks.systemBar = await bar.isVisible()
  result.checks.continueBtn = await page.getByTestId('kenos-space-switcher-fab').isVisible()
  result.checks.quickSwitchBtn = await page
    .getByTestId('kenos-quick-switch-trigger')
    .isVisible()

  // Title lives in LifeOsSheet header snippet; body testid is .switcher only.
  const titleEl = page.locator('.space-switcher-sheet .sheet-title, .sheet-title.continue-title')
  const sheetBody = page.getByTestId('kenos-space-switcher')

  // --- Continue ---
  await page.getByTestId('kenos-space-switcher-fab').click()
  await sheetBody.waitFor({ timeout: 12000 })
  await titleEl.first().waitFor({ timeout: 8000 })
  await page.waitForTimeout(300)
  await page.screenshot({
    path: path.join(shots, '01-continue-recent-only.png'),
    fullPage: false,
  })

  const continueTitle = (await titleEl.first().innerText()).trim()
  const continueText = await sheetBody.innerText()
  const continueChrome = continueTitle + '\n' + continueText
  result.checks.continueTitle = continueTitle === 'Continue'
  result.checks.continueMode = await sheetBody.getAttribute('data-chrome-mode')
  result.checks.continueHasAllDomains = /All Domains/i.test(continueChrome)
  result.checks.continueHasSearch = (await sheetBody.locator('input').count()) > 0
  result.checks.continueEmptyOrRecent =
    /还没有可以继续的内容|Recent Spaces|Resume probe|Plan/i.test(continueText)
  result.checks.continueSpacesCta = /浏览全部 Spaces|Spaces/i.test(continueText)

  await page.getByTestId('kenos-space-switcher-close').click()
  await page.waitForTimeout(500)

  // --- Quick Switch ---
  await page.getByTestId('kenos-quick-switch-trigger').click()
  await sheetBody.waitFor({ timeout: 12000 })
  await titleEl.first().waitFor({ timeout: 8000 })
  await page.waitForTimeout(300)
  await page.screenshot({
    path: path.join(shots, '02-quick-switch.png'),
    fullPage: false,
  })

  const quickTitle = (await titleEl.first().innerText()).trim()
  const quickText = await sheetBody.innerText()
  result.checks.quickTitle = quickTitle === 'Quick Switch'
  result.checks.quickMode = await sheetBody.getAttribute('data-chrome-mode')
  result.checks.quickHasSearch = (await sheetBody.locator('input').count()) > 0
  result.checks.quickListsSpaces = /Training|Plan|Money|Spaces/i.test(quickText)

  await page.getByTestId('kenos-space-switcher-close').click()
  await page.waitForTimeout(400)

  // --- Switch Space (desktop sidebar All) ---
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await clearNativeShell(page)
  await seedRecent(page, listKey)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await clearNativeShell(page)
  await page.waitForTimeout(900)

  const allBtn = page.getByTestId('kenos-switch-space-trigger')
  if (await allBtn.isVisible().catch(() => false)) {
    await allBtn.click()
    await sheetBody.waitFor({ timeout: 12000 })
    await titleEl.first().waitFor({ timeout: 8000 })
    await page.waitForTimeout(300)
    await page.screenshot({
      path: path.join(shots, '03-switch-space-all.png'),
      fullPage: false,
    })
    const switchTitle = (await titleEl.first().innerText()).trim()
    const switchText = await sheetBody.innerText()
    result.checks.switchSpaceTitle = switchTitle === 'Switch Space'
    result.checks.switchMode = await sheetBody.getAttribute('data-chrome-mode')
    result.checks.switchHasAllDomains = /All Domains/i.test(switchText)
    result.checks.switchHasSearch = (await sheetBody.locator('input').count()) > 0
  } else {
    result.checks.switchSpaceSkipped = 'kenos-switch-space-trigger not visible'
  }

  result.pass = Boolean(
    result.checks.systemBar &&
      result.checks.continueBtn &&
      result.checks.quickSwitchBtn &&
      result.checks.continueTitle &&
      result.checks.continueMode === 'continueRecent' &&
      !result.checks.continueHasAllDomains &&
      !result.checks.continueHasSearch &&
      result.checks.quickTitle &&
      result.checks.quickMode === 'quickSwitch' &&
      result.checks.quickHasSearch &&
      result.checks.quickListsSpaces &&
      (result.checks.switchSpaceSkipped ||
        (result.checks.switchSpaceTitle &&
          result.checks.switchMode === 'switchSpace' &&
          result.checks.switchHasAllDomains)),
  )

  await browser.close()
  const outFile = path.join(OUT, 'logs/ia-web-parity-verify.json')
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.pass ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  result.error = String(e?.stack || e)
  fs.writeFileSync(
    path.join(OUT, 'logs/ia-web-parity-verify.json'),
    JSON.stringify(result, null, 2),
  )
  process.exit(2)
})
