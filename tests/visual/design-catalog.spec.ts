import { expect, test } from '@playwright/test'
import { APPS, MATRIX_SHOWCASES, MODES } from './design-catalog.helpers.js'

// APPS / MODES / MATRIX_SHOWCASES 从 helpers 来（helpers 再从 catalog 自身注册表派生）。
// 本文件的 catalogUrl 与 helpers 的不同：smoke 走非 embed 模式且带 viewport 参数，故保留。
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

  test('app shell — desktop regions and one content scroll root', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(
      catalogUrl('app-shell', 'fitness', 'light', 'desktop', { embed: '1' }),
    )
    await expect(page.getByTestId('showcase-app-shell')).toBeVisible()
    await expect(page.getByTestId('catalog-app-shell-navigation-desktop')).toBeVisible()
    await expect(page.getByTestId('catalog-app-shell-navigation-mobile')).toBeHidden()

    const scrollContract = await page.evaluate(() => {
      const main = document.querySelector('[data-testid="catalog-app-shell-main"]')
      const shell = document.querySelector('[data-testid="catalog-app-shell"]')
      if (!(main instanceof HTMLElement) || !(shell instanceof HTMLElement)) return null
      return {
        mainOverflow: getComputedStyle(main).overflowY,
        mainScrollable: main.scrollHeight > main.clientHeight,
        shellOverflow: getComputedStyle(shell).overflow,
        bodyScrollable: document.body.scrollHeight > document.body.clientHeight + 1,
      }
    })
    expect(scrollContract).toEqual({
      mainOverflow: 'auto',
      mainScrollable: true,
      shellOverflow: 'hidden',
      bodyScrollable: false,
    })

    await page.getByTestId('catalog-app-shell-main').evaluate((main) => {
      main.scrollTop = main.scrollHeight
    })
    await expect(page.getByTestId('shell-demo-final-content')).toBeVisible()
    const finalIsClear = await page.evaluate(() => {
      const finalContent = document.querySelector('[data-testid="shell-demo-final-content"]')
      const overlay = document.querySelector('[data-testid="shell-demo-persistent"]')
      if (!(finalContent instanceof HTMLElement) || !(overlay instanceof HTMLElement)) return false
      return finalContent.getBoundingClientRect().bottom <= overlay.getBoundingClientRect().top
    })
    expect(finalIsClear).toBe(true)
  })

  for (const viewport of [
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ]) {
    test(`app shell — mobile projection ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto(
        catalogUrl('app-shell', 'fitness', 'dark', 'mobile', { embed: '1' }),
      )
      await expect(page.getByTestId('catalog-app-shell-navigation-desktop')).toBeHidden()
      await expect(page.getByTestId('catalog-app-shell-navigation-mobile')).toBeVisible()
      await expect(page.getByRole('main', { name: 'Shell fixture content' })).toBeVisible()
    })
  }

  test('app shell — skip link and guarded route focus', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'catalog-mobile', 'keyboard focus contract runs in desktop context')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(
      catalogUrl('app-shell', 'planner', 'light', 'desktop', { embed: '1' }),
    )
    await page.keyboard.press('Tab')
    const skipLink = page.getByRole('link', { name: 'Skip to fixture content' })
    await expect(skipLink).toBeFocused()
    await skipLink.press('Enter')
    await expect(page.getByTestId('catalog-app-shell-main')).toBeFocused()

    await page.getByRole('button', { name: 'Simulate route' }).click()
    await expect(page.getByTestId('catalog-app-shell-main')).toBeFocused()

    const guardedInput = page.getByRole('textbox', {
      name: 'Route-focus guard input',
    })
    await guardedInput.fill('preserved')
    await expect(guardedInput).toBeFocused()
  })

  test('app shell — generic locked mode restores content scrolling', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(
      catalogUrl('app-shell', 'home', 'light', 'desktop', { embed: '1' }),
    )
    const shell = page.getByTestId('catalog-app-shell')
    const main = page.getByTestId('catalog-app-shell-main')

    await expect(shell).toHaveAttribute('data-scroll-mode', 'content')
    await expect(main).toHaveCSS('overflow-y', 'auto')
    await page.getByRole('button', { name: 'Lock scroll' }).click()
    await expect(shell).toHaveAttribute('data-scroll-mode', 'locked')
    await expect(main).toHaveCSS('overflow-y', 'hidden')
    await page.getByRole('button', { name: 'Unlock scroll' }).click()
    await expect(shell).toHaveAttribute('data-scroll-mode', 'content')
    await expect(main).toHaveCSS('overflow-y', 'auto')
  })

  test('matrix — buttons grid with state rows', async ({ page }) => {
    await page.goto(catalogUrl('buttons', 'planner', 'light', 'desktop', { view: 'matrix' }))
    await expect(page.getByTestId('catalog-matrix')).toBeVisible()
    await expect(page.getByTestId('matrix-state-buttons-default')).toBeVisible()
    await expect(page.getByTestId('matrix-state-buttons-disabled')).toBeVisible()
    await expect(
      page.getByTestId('matrix-cell-buttons-default-planner-light'),
    ).toBeVisible()
    await page.getByTestId('matrix-state-buttons-disabled').locator('summary').click()
    await expect(
      page.getByTestId('matrix-cell-buttons-disabled-music-dark'),
    ).toBeVisible()
  })

  test('embed — buttons disabled state', async ({ page }) => {
    await page.goto(
      catalogUrl('buttons', 'planner', 'light', 'desktop', {
        embed: '1',
        state: 'disabled',
      }),
    )
    await expect(page.getByTestId('catalog-embed')).toBeVisible()
    await expect(page.getByTestId('catalog-shell')).toHaveAttribute(
      'data-state',
      'disabled',
    )
    await expect(page.getByTestId('showcase-buttons')).toBeVisible()
    await expect(page.locator('[data-catalog-state="default"]')).toHaveCount(0)
    await expect(page.locator('[data-catalog-state="disabled"]')).toHaveCount(1)
  })

  test('embed — toast planner light', async ({ page }) => {
    await page.goto(
      catalogUrl('toast', 'planner', 'light', 'desktop', { embed: '1' }),
    )
    await expect(page.getByTestId('catalog-embed')).toBeVisible()
    await expect(page.getByTestId('showcase-toast')).toBeVisible()
    await expect(page.getByTestId('theme-matrix')).toHaveCount(0)
  })

  test('sidebar — resets state when switching showcase', async ({ page }) => {
    await page.goto(
      catalogUrl('buttons', 'planner', 'light', 'desktop', { state: 'disabled' }),
    )
    await expect(page.locator('[data-catalog-state="disabled"]')).toHaveCount(1)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page).toHaveURL(/showcase=settings/)
    await expect(page).not.toHaveURL(/state=disabled/)
    await expect(page.getByTestId('theme-matrix-state')).toBeVisible()
    await expect(page.getByTestId('catalog-shell')).toHaveAttribute(
      'data-state',
      'all',
    )
    await expect(page.locator('[data-catalog-state="default"]')).toBeVisible()
    await expect(page.locator('[data-catalog-state="destructive"]')).toBeVisible()
  })
})
