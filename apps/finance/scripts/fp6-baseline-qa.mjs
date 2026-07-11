#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'
import { injectLifeOsSession, loadFinanceQaEnv, signInForFinanceQa } from './ia-qa-auth.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dateTag = process.env.UI_QA_DATE ?? '2026-07-11'
const { dir: shotRoot } = resolveScreenshotDir({
  app: 'finance',
  suite: 'fp6-purchase-review',
  importMetaUrl: import.meta.url,
  runId: process.env.QA_RUN_ID ?? dateTag,
})
const storageKey = 'life_os_auth'
const baseUrl = process.env.UI_QA_URL ?? 'http://localhost:5180'

const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 402, height: 874 },
]

mkdirSync(resolve(shotRoot, 'desktop'), { recursive: true })
mkdirSync(resolve(shotRoot, 'mobile'), { recursive: true })

const env = loadFinanceQaEnv(root)
const session = await signInForFinanceQa(env)

async function injectSession(page) {
  await injectLifeOsSession(page, session, baseUrl)
  await page.waitForTimeout(3500)
}

async function capture(page, viewportId, name, opts = {}) {
  const path = resolve(shotRoot, viewportId, `${name}.png`)
  await page.screenshot({ path, fullPage: Boolean(opts.fullPage) })
  console.log(`CAPTURE [${viewportId}] ${name}`)
  return path
}

const browser = await chromium.launch()
const manifest = []

for (const vp of VIEWPORTS) {
  const page = await browser.newPage()
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await injectSession(page)
  
  // 7. Loading state
  await page.goto(`${baseUrl}/history/insights`)
  manifest.push(await capture(page, vp.id, '07-loading-state'))
  
  await page.waitForTimeout(4000)
  
  // 1. Normal History page
  manifest.push(await capture(page, vp.id, '01-normal-history', { fullPage: true }))
  
  // Try to click "Review needed" filter in PurchaseCoverageCard
  const reviewClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.purchase-coverage-stat .purchase-coverage-link'))
    if (btns.length >= 2) {
       btns[1].click();
       return true;
    }
    return false;
  })
  
  if (reviewClicked) {
    await page.waitForTimeout(2000)
    // 2. History filtered to review-needed purchases
    manifest.push(await capture(page, vp.id, '02-history-filtered-review', { fullPage: true }))
    
    // 4. Unmatched or review-needed purchase
    const ledger = page.locator('.ledger').first()
    await ledger.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1000)
    manifest.push(await capture(page, vp.id, '04-review-needed-purchase'))
  }
  
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(4000)
  
  const toggle = page.locator('.ledger-filter-toggle')
  if (await toggle.count()) {
    await toggle.first().click().catch(() => {})
    await page.waitForTimeout(500)
  }

  const input = page.locator('.ledger-filters input.input').first()
  if (await input.count()) {
    await input.scrollIntoViewIfNeeded()
    await input.fill('Amazon')
    await page.waitForTimeout(1000)
    
    // 3. Matched purchase
    manifest.push(await capture(page, vp.id, '03-matched-purchase'))
    
    // 5. Purchase with enrichment (expand)
    const enrichToggle = page.locator('.purchase-enrichment-toggle').first()
    if (await enrichToggle.count()) {
      await enrichToggle.click()
      await page.waitForTimeout(1000)
      manifest.push(await capture(page, vp.id, '05-purchase-with-enrichment'))
    }

    // 6. Purchase without enrichment
    await input.fill('Transfer')
    await page.waitForTimeout(1000)
    manifest.push(await capture(page, vp.id, '06-purchase-without-enrichment'))

    // 8. Empty state
    await input.fill('NonExistentMerchant999')
    await page.waitForTimeout(1000)
    manifest.push(await capture(page, vp.id, '08-empty-state'))
  }
  
  await page.close()
}

await browser.close()
writeFileSync(
  resolve(shotRoot, 'manifest.json'),
  JSON.stringify({ dateTag, baseUrl, shots: manifest }, null, 2)
)
console.log(`\nScreenshots saved to:\n${shotRoot}`)
