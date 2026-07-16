import { expect, test } from '@playwright/test'
import {
  APPS,
  MATRIX_SHOWCASES,
  MODES,
  SNAPSHOT_DEFAULT_STATE,
  SNAPSHOT_OPTS,
  catalogUrl,
  waitForCatalogEmbed,
} from './design-catalog.helpers.js'

/**
 * Pixel regression baselines for design-catalog (D-P5).
 * Desktop-only; embed mode isolates showcase from catalog chrome.
 *
 * Update baselines intentionally:
 *   npm run test:design-catalog:snapshots:update
 */
test.describe('design-catalog pixel baselines @visual', () => {
  test.describe('brand tokens', () => {
    for (const app of APPS) {
      for (const mode of MODES) {
        test(`tokens — ${app} / ${mode}`, async ({ page }) => {
          await page.goto(catalogUrl('tokens', app, mode))
          await waitForCatalogEmbed(page, 'tokens')
          await expect(page.getByTestId('catalog-shell')).toHaveScreenshot(
            `tokens-${app}-${mode}.png`,
            SNAPSHOT_OPTS,
          )
        })
      }
    }
  })

  test.describe('matrix showcases (default state)', () => {
    for (const showcase of MATRIX_SHOWCASES) {
      for (const app of APPS) {
        for (const mode of MODES) {
          test(`${showcase} — ${app} / ${mode}`, async ({ page }) => {
            const state = SNAPSHOT_DEFAULT_STATE[showcase]
            await page.goto(
              catalogUrl(showcase, app, mode, { state }),
            )
            await waitForCatalogEmbed(page, showcase)
            await expect(page.getByTestId('catalog-shell')).toHaveScreenshot(
              `${showcase}-${state}-${app}-${mode}.png`,
              SNAPSHOT_OPTS,
            )
          })
        }
      }
    }
  })

  /**
   * Mobile 393×852 基线（2026-07-16）：mobile-first 体系此前只有 app-shell 一张
   * 移动基线；壳层/弹层/设置这些移动端主战场组件补上像素护栏。
   * state 选移动端最有信息量的那个（导航→sheet-open、overlay→sheet）。
   */
  test.describe('mobile 393×852 showcases', () => {
    const MOBILE_SNAPSHOT_STATES: Record<string, string> = {
      navigation: 'sheet-open',
      overlay: 'sheet',
      settings: 'default',
      toast: 'success',
    }
    for (const [showcase, state] of Object.entries(MOBILE_SNAPSHOT_STATES)) {
      for (const app of APPS) {
        for (const mode of MODES) {
          test(`${showcase} — ${app} / ${mode} @ 393×852`, async ({ page }) => {
            await page.setViewportSize({ width: 393, height: 852 })
            await page.goto(catalogUrl(showcase, app, mode, { state }))
            await waitForCatalogEmbed(page, showcase)
            await expect(page.getByTestId('catalog-shell')).toHaveScreenshot(
              `${showcase}-${state}-${app}-${mode}-393x852.png`,
              SNAPSHOT_OPTS,
            )
          })
        }
      }
    }
  })

  test.describe('app shell contract', () => {
    test('desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto(catalogUrl('app-shell', 'fitness', 'light'))
      await waitForCatalogEmbed(page, 'app-shell')
      await expect(page.getByTestId('catalog-app-shell')).toHaveScreenshot(
        'app-shell-fitness-light-desktop.png',
        SNAPSHOT_OPTS,
      )
    })

    test('393×852 mobile', async ({ page }) => {
      await page.setViewportSize({ width: 393, height: 852 })
      await page.goto(catalogUrl('app-shell', 'fitness', 'dark'))
      await waitForCatalogEmbed(page, 'app-shell')
      await expect(page.getByTestId('catalog-app-shell')).toHaveScreenshot(
        'app-shell-fitness-dark-393x852.png',
        SNAPSHOT_OPTS,
      )
    })
  })
})
