import { expect, test } from '@playwright/test'

const APPS = ['planner', 'fitness', 'finance', 'music'] as const
const MODES = ['light', 'dark'] as const

const MATRIX_SHOWCASES = [
  'buttons',
  'segments',
  'utilities',
  'settings',
  'navigation',
  'feedback',
  'toast',
  'cards',
] as const

function catalogUrl(
  showcase: string,
  app: string,
  mode: string,
  viewport: string,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({
    showcase,
    app,
    mode,
    viewport,
    ...extra,
  })
  return `/?${params.toString()}`
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

  for (const showcase of MATRIX_SHOWCASES) {
    for (const app of APPS) {
      for (const mode of MODES) {
        test(`${showcase} — ${app} / ${mode}`, async ({ page }) => {
          const errors: string[] = []
          page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text())
          })
          await page.goto(catalogUrl(showcase, app, mode, 'desktop'))
          await expect(page.getByTestId(`showcase-${showcase}`)).toBeVisible()
          await expect(page.getByTestId('catalog-shell')).toHaveAttribute(
            'data-app',
            app,
          )
          await expect(page.getByTestId('catalog-shell')).toHaveAttribute(
            'data-mode',
            mode,
          )
          expect(errors).toEqual([])
        })
      }
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

  test('cards — planner light mobile', async ({ page }) => {
    await page.goto(catalogUrl('cards', 'planner', 'light', 'mobile'))
    await expect(page.getByTestId('showcase-cards')).toBeVisible()
    await expect(page.getByTestId('responsive-frame')).toHaveAttribute(
      'data-viewport',
      'mobile',
    )
  })

  test('matrix — buttons grid', async ({ page }) => {
    await page.goto(catalogUrl('buttons', 'planner', 'light', 'desktop', { view: 'matrix' }))
    await expect(page.getByTestId('catalog-matrix')).toBeVisible()
    await expect(page.getByTestId('matrix-cell-buttons-planner-light')).toBeVisible()
    await expect(page.getByTestId('matrix-cell-buttons-music-dark')).toBeVisible()
  })

  test('embed — toast planner light', async ({ page }) => {
    await page.goto(
      catalogUrl('toast', 'planner', 'light', 'desktop', { embed: '1' }),
    )
    await expect(page.getByTestId('catalog-embed')).toBeVisible()
    await expect(page.getByTestId('showcase-toast')).toBeVisible()
    await expect(page.getByTestId('theme-matrix')).toHaveCount(0)
  })
})
