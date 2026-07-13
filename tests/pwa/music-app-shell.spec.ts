import { expect, test } from '@playwright/test'

test.describe('Music shared app shell', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'music', 'Music project only')
  })

  for (const viewport of [
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ]) {
    test(`single content scroll root at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/settings', { waitUntil: 'networkidle' })
      await expect(page.getByTestId('music-shell')).toBeVisible()

      const metrics = await page.evaluate(() => {
        const main = document.querySelector('[data-testid="music-shell-main"]')
        const shell = document.querySelector('[data-testid="music-shell"]')
        if (!(main instanceof HTMLElement) || !(shell instanceof HTMLElement)) return null
        return {
          mainOverflow: getComputedStyle(main).overflowY,
          mainScrollable: main.scrollHeight > main.clientHeight,
          shellOverflow: getComputedStyle(shell).overflow,
          bodyScrollable: document.body.scrollHeight > document.body.clientHeight + 1,
          mainCount: document.querySelectorAll('main').length,
        }
      })

      expect(metrics).toEqual({
        mainOverflow: 'auto',
        mainScrollable: true,
        shellOverflow: 'hidden',
        bodyScrollable: false,
        mainCount: 1,
      })
      await expect(page.getByTestId('music-shell-navigation-mobile')).toBeVisible()
      await expect(page.getByTestId('music-shell-navigation-desktop')).toBeHidden()
    })
  }

  test('desktop/mobile breakpoint transition is stable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/settings', { waitUntil: 'networkidle' })
    const desktopNavigation = page.getByTestId('music-shell-navigation-desktop')
    const mobileNavigation = page.getByTestId('music-shell-navigation-mobile')
    await expect(desktopNavigation).toBeVisible()
    await expect(mobileNavigation).toBeHidden()

    await page.setViewportSize({ width: 839, height: 800 })
    await expect(desktopNavigation).toBeHidden()
    await expect(mobileNavigation).toBeVisible()

    await page.setViewportSize({ width: 840, height: 800 })
    await expect(desktopNavigation).toBeVisible()
    await expect(mobileNavigation).toBeHidden()
  })

  test('shellDataset drives root state attributes (v1.1)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/', { waitUntil: 'networkidle' })
    const shell = page.getByTestId('music-shell')
    await expect(shell).toHaveClass(/music-app/)
    // Home is a wide-content route: root carries the span state
    await expect(shell).toHaveAttribute('data-wide-content', 'true')
    await expect(shell).toHaveAttribute('data-content-mode', 'span')

    await page.goto('/settings', { waitUntil: 'networkidle' })
    await expect(shell).not.toHaveAttribute('data-wide-content', 'true')
  })

  test('mini player and drawers live in the shell overlay regions', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(
      page.locator('[data-testid="music-shell-persistent-overlay"] .mini-player'),
    ).toHaveCount(1)
    // QueueDrawer/UtilityPane mount on demand; the transient region itself must exist
    await expect(page.getByTestId('music-shell-transient-overlay')).toBeAttached()
    // Hidden mini player must not reserve clearance
    const inset = await page.getByTestId('music-shell').evaluate((shell) =>
      parseFloat(
        getComputedStyle(shell).getPropertyValue('--life-os-persistent-overlay-inset'),
      ),
    )
    expect(inset).toBe(0)
  })

  test('route focus and browser history preserve shell state', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: '资料库', exact: true }).last().click()
    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByTestId('music-shell-main')).toBeFocused()

    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('music-shell')).toBeVisible()
    await page.goForward()
    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByTestId('music-shell-main')).toBeFocused()
  })
})
