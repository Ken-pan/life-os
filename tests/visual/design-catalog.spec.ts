import { expect, test } from '@playwright/test'

const APPS = ['planner', 'fitness', 'finance', 'music'] as const
const MODES = ['light', 'dark'] as const

function catalogUrl(
  showcase: string,
  app: string,
  mode: string,
  viewport: string,
) {
  return `/?showcase=${showcase}&app=${app}&mode=${mode}&viewport=${viewport}`
}

test.describe('design-catalog visual smoke', () => {
  for (const app of APPS) {
    for (const mode of MODES) {
      test(`tokens — ${app} / ${mode}`, async ({ page }) => {
        await page.goto(catalogUrl('tokens', app, mode, 'desktop'))
        await expect(page.getByTestId('showcase-tokens')).toBeVisible()
        await expect(page.getByTestId('catalog-shell')).toHaveAttribute(
          'data-app',
          app,
        )
        await expect(page.getByTestId('catalog-shell')).toHaveAttribute(
          'data-mode',
          mode,
        )
      })
    }
  }

  test('buttons — finance dark mobile viewport param', async ({ page }) => {
    await page.goto(catalogUrl('buttons', 'finance', 'dark', 'mobile'))
    await expect(page.getByTestId('showcase-buttons')).toBeVisible()
    await expect(page.getByTestId('responsive-frame')).toHaveAttribute(
      'data-viewport',
      'mobile',
    )
  })

  test('settings — planner light', async ({ page }) => {
    await page.goto(catalogUrl('settings', 'planner', 'light', 'desktop'))
    await expect(page.getByTestId('showcase-settings')).toBeVisible()
  })

  test('navigation — fitness', async ({ page }) => {
    await page.goto(catalogUrl('navigation', 'fitness', 'dark', 'tablet'))
    await expect(page.getByTestId('showcase-navigation')).toBeVisible()
  })

  test('feedback — music light', async ({ page }) => {
    await page.goto(catalogUrl('feedback', 'music', 'light', 'desktop'))
    await expect(page.getByTestId('showcase-feedback')).toBeVisible()
  })
})
