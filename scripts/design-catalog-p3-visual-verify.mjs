#!/usr/bin/env node
/**
 * Deep visual verification for design-catalog P3 fixes.
 * Complements screenshot audit with computed-style checks.
 */
import { chromium } from '@playwright/test'

const BASE_URL = process.env.DESIGN_CATALOG_URL ?? 'http://127.0.0.1:5190'
const APPS = ['planner', 'fitness', 'finance', 'music']
const MODES = ['light', 'dark']

/** @type {{ id: string, ok: boolean, detail: string }[]} */
const results = []

function record(id, ok, detail) {
  results.push({ id, ok, detail })
}

/** @param {import('@playwright/test').Page} page */
async function rgb(page, expr) {
  return page.evaluate((css) => {
    const el = document.createElement('span')
    el.style.color = css
    document.body.appendChild(el)
    const v = getComputedStyle(el).color
    document.body.removeChild(el)
    return v
  }, expr)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  // P0-1: html theme sync + primary button fill
  for (const app of APPS) {
    for (const mode of MODES) {
      await page.goto(`${BASE_URL}/?showcase=buttons&app=${app}&mode=${mode}`, {
        waitUntil: 'networkidle',
      })
      const id = `buttons/${app}/${mode}`
      const check = await page.evaluate(
        ({ app, mode }) => {
          const root = document.documentElement
          const primary = document.querySelector('.btn-primary')
          const bg = primary ? getComputedStyle(primary).backgroundColor : ''
          const token = getComputedStyle(root)
            .getPropertyValue('--button-primary-bg')
            .trim()
          return {
            htmlApp: root.dataset.app ?? '',
            htmlMode: root.dataset.mode ?? '',
            primaryBg: bg,
            primaryToken: token,
            accent: getComputedStyle(root).getPropertyValue('--accent').trim(),
          }
        },
        { app, mode },
      )

      const htmlOk = check.htmlApp === app && check.htmlMode === mode
      const bgOk = check.primaryBg && check.primaryBg !== 'rgba(0, 0, 0, 0)'
      record(
        `${id}/html-sync`,
        htmlOk,
        `html app=${check.htmlApp} mode=${check.htmlMode}`,
      )
      record(
        `${id}/primary-fill`,
        bgOk,
        `primary bg=${check.primaryBg} token=${check.primaryToken || '(empty)'}`,
      )
    }
  }

  // P1: danger uses critical not accent
  await page.goto(`${BASE_URL}/?showcase=buttons&app=planner&mode=light`, {
    waitUntil: 'networkidle',
  })
  const dangerRgb = await page
    .locator('.btn-danger')
    .first()
    .evaluate((el) => getComputedStyle(el).color)
  const criticalRgb = await rgb(page, 'var(--critical)')
  const accentRgb = await rgb(page, 'var(--accent)')
  record(
    'buttons/danger-critical',
    dangerRgb === criticalRgb,
    `danger=${dangerRgb} critical=${criticalRgb}`,
  )
  record(
    'buttons/danger-not-accent',
    dangerRgb !== accentRgb,
    `danger=${dangerRgb} accent=${accentRgb}`,
  )

  // P0-2: toast inline visible
  for (const mode of MODES) {
    await page.goto(`${BASE_URL}/?showcase=toast&app=planner&mode=${mode}`, {
      waitUntil: 'networkidle',
    })
    const toast = page.locator('.toast').first()
    const box = await toast.boundingBox()
    const pos = await toast.evaluate((el) => getComputedStyle(el).position)
    record(
      `toast/planner/${mode}/visible`,
      !!box && box.height >= 24,
      `h=${box?.height ?? 0} position=${pos}`,
    )
  record(
    `toast/planner/${mode}/inline`,
    pos === 'relative',
    `position=${pos}`,
  )
  const lhRatio = await page
    .locator('.toast.show')
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el)
      return parseFloat(s.lineHeight) / parseFloat(s.fontSize)
    })
  record(
    `toast/planner/${mode}/line-height`,
    lhRatio >= 1.5,
    `ratio=${lhRatio.toFixed(2)}`,
  )
  }

  // P0-2: feedback banner + toast
  await page.goto(`${BASE_URL}/?showcase=feedback&app=music&mode=light`, {
    waitUntil: 'networkidle',
  })
  const bannerBox = await page.locator('.banner.critical').first().boundingBox()
  const toastBox = await page.locator('.toast').first().boundingBox()
  record(
    'feedback/banner-visible',
    !!bannerBox && bannerBox.height >= 20,
    `banner h=${bannerBox?.height ?? 0}`,
  )
  record(
    'feedback/toast-visible',
    !!toastBox && toastBox.height >= 20,
    `toast h=${toastBox?.height ?? 0}`,
  )
  const retryColor = await page
    .locator('.toast--error .toast-action')
    .first()
    .evaluate((el) => getComputedStyle(el).color)
  const retryCriticalRgb = await rgb(page, 'var(--critical)')
  record(
    'feedback/error-action-critical',
    retryColor === retryCriticalRgb,
    `retry=${retryColor} critical=${retryCriticalRgb}`,
  )
  const actionDismissGap = await page.evaluate(() => {
    const action = document.querySelector('.toast--error .toast-action')
    const dismiss = document.querySelector('.toast--error .toast-dismiss')
    if (!action || !dismiss) return -1
    return dismiss.getBoundingClientRect().left - action.getBoundingClientRect().right
  })
  record(
    'feedback/action-dismiss-gap',
    actionDismissGap >= 8,
    `gap=${actionDismissGap}px`,
  )
  const dismissAlign = await page
    .locator('.toast--error .toast-dismiss')
    .first()
    .evaluate((el) => getComputedStyle(el).alignSelf)
  record(
    'feedback/dismiss-centered',
    dismissAlign === 'center',
    `alignSelf=${dismissAlign}`,
  )

  // P0-3: cards use theme button classes
  await page.goto(`${BASE_URL}/?showcase=cards&app=planner&mode=light`, {
    waitUntil: 'networkidle',
  })
  const cardBtnClasses = await page
    .locator('.catalog-state-block')
    .filter({ hasText: 'actions' })
    .locator('button')
    .allTextContents()
  const cardBtnClassNames = await page
    .locator('.catalog-state-block')
    .filter({ hasText: 'actions' })
    .locator('button')
    .evaluateAll((els) => els.map((el) => el.className))
  const validBtnClasses = cardBtnClassNames.every(
    (c) => c.includes('btn-primary') || c.includes('btn-secondary'),
  )
  record(
    'cards/action-buttons',
    validBtnClasses && cardBtnClasses.length >= 2,
    cardBtnClassNames.join(', '),
  )

  // P1: segments app variant
  for (const [app, expected] of [
    ['planner', 'seg-chips'],
    ['fitness', 'seg-track'],
    ['finance', 'seg--wrap'],
  ]) {
    await page.goto(`${BASE_URL}/?showcase=segments&app=${app}&mode=light`, {
      waitUntil: 'networkidle',
    })
    const cls = await page
      .locator('[aria-label="Demo segment"]')
      .getAttribute('class')
    record(
      `segments/${app}/variant`,
      cls?.includes(expected) ?? false,
      cls ?? '(missing)',
    )
  }

  // P1: navigation open sheet preview
  await page.goto(`${BASE_URL}/?showcase=navigation&app=fitness&mode=light`, {
    waitUntil: 'networkidle',
  })
  const sheetBox = await page
    .locator('.catalog-doc-preview--sheet .mobile-more-sheet')
    .boundingBox()
  const sheetDisplay = await page
    .locator('.catalog-doc-preview--sheet .mobile-more-sheet')
    .evaluate((el) => getComputedStyle(el).display)
  record(
    'navigation/sheet-preview',
    !!sheetBox && sheetBox.height >= 120 && sheetDisplay === 'flex',
    `h=${sheetBox?.height ?? 0} display=${sheetDisplay}`,
  )
  const closeFocused = await page
    .locator('.catalog-doc-preview--sheet .mobile-more-close')
    .evaluate((el) => document.activeElement === el)
  record(
    'navigation/sheet-no-autofocus',
    !closeFocused,
    `closeFocused=${closeFocused}`,
  )

  // P1: settings action affordance
  await page.goto(`${BASE_URL}/?showcase=settings&app=planner&mode=light`, {
    waitUntil: 'networkidle',
  })
  const exportBtn = page
    .locator('.catalog-state-block')
    .filter({ hasText: 'Default' })
    .locator('.settings-row .btn-secondary')
    .first()
  const exportWeight = await exportBtn.evaluate(
    (el) => getComputedStyle(el).fontWeight,
  )
  const exportMinW = await exportBtn.evaluate(
    (el) => getComputedStyle(el).minWidth,
  )
  record(
    'settings/action-affordance',
    Number(exportWeight) >= 600 && parseFloat(exportMinW) >= 72,
    `weight=${exportWeight} minWidth=${exportMinW}`,
  )

  const dangerInSettings = await page
    .locator('.catalog-state-block')
    .filter({ hasText: 'Destructive' })
    .locator('.btn-danger')
    .count()
  record(
    'settings/destructive-fixture',
    dangerInSettings >= 1,
    `count=${dangerInSettings}`,
  )

  // utilities info banner contrast
  await page.goto(`${BASE_URL}/?showcase=utilities&app=planner&mode=light`, {
    waitUntil: 'networkidle',
  })
  const infoBanner = page.locator('.banner.info').first()
  const infoBg = await infoBanner.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  )
  const infoBorder = await infoBanner.evaluate(
    (el) => getComputedStyle(el).borderTopWidth,
  )
  record(
    'utilities/info-banner',
    infoBg !== 'rgba(0, 0, 0, 0)' && infoBorder !== '0px',
    `bg=${infoBg} border=${infoBorder}`,
  )

  await browser.close()

  const failed = results.filter((r) => !r.ok)
  console.log('\n=== Design Catalog P3 Visual Verification ===\n')
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  —  ${r.detail}`)
  }
  console.log(
    `\nTotal: ${results.length - failed.length}/${results.length} passed`,
  )
  if (failed.length) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
