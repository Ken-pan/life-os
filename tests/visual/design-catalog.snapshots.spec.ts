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
})
