import { expect, test } from '@playwright/test'

test.describe('Fitness shared app shell', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'fitness', 'Fitness project only')
  })

  for (const viewport of [
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ]) {
    test(`single content scroll root at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/settings', { waitUntil: 'networkidle' })
      await expect(page.getByTestId('fitness-shell')).toBeVisible()

      const metrics = await page.evaluate(() => {
        const main = document.querySelector('[data-testid="fitness-shell-main"]')
        const shell = document.querySelector('[data-testid="fitness-shell"]')
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
      await expect(page.getByTestId('fitness-shell-navigation-mobile')).toBeVisible()
      await expect(page.getByTestId('fitness-shell-navigation-desktop')).toBeHidden()
    })
  }

  test('desktop/mobile breakpoint transition is stable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/settings', { waitUntil: 'networkidle' })
    const desktopNavigation = page.getByTestId(
      'fitness-shell-navigation-desktop',
    )
    const mobileNavigation = page.getByTestId(
      'fitness-shell-navigation-mobile',
    )
    await expect(desktopNavigation).toBeVisible()
    await expect(mobileNavigation).toBeHidden()

    await page.setViewportSize({ width: 839, height: 800 })
    await expect(desktopNavigation).toBeHidden()
    await expect(mobileNavigation).toBeVisible()

    await page.setViewportSize({ width: 840, height: 800 })
    await expect(desktopNavigation).toBeVisible()
    await expect(mobileNavigation).toBeHidden()
  })

  test('modal lock restores the main scroll surface', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/day/chest', { waitUntil: 'networkidle' })
    await page.evaluate(() => {
      document.documentElement.classList.add('standalone-pwa')
    })
    const main = page.getByTestId('fitness-shell-main')
    await main.evaluate((element) => (element.scrollTop = 180))
    await page.locator('.w-panel').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(main).toHaveCSS('overflow-y', 'hidden')
    const lockedPosition = await main.evaluate((element) => element.scrollTop)
    await page.keyboard.press('Escape')
    await expect(page.locator('.modal-bg.show')).toHaveCount(0)
    await expect(main).toHaveCSS('overflow-y', 'auto')
    expect(await main.evaluate((element) => element.scrollTop)).toBe(lockedPosition)
  })

  test('TimerWidget clearance keeps final content reachable', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/day/chest', { waitUntil: 'networkidle' })
    await page.locator('.badge.rest').first().click()
    const timer = page.locator('.tw').first()
    await expect(timer).toBeVisible()
    await expect
      .poll(() =>
        page.getByTestId('fitness-shell').evaluate((shell) =>
          parseFloat(
            getComputedStyle(shell).getPropertyValue(
              '--life-os-persistent-overlay-inset',
            ),
          ),
        ),
      )
      .toBeGreaterThan(0)

    const main = page.getByTestId('fitness-shell-main')
    await main.evaluate((element) => (element.scrollTop = element.scrollHeight))
    await expect
      .poll(() =>
        main.evaluate(
          (element) =>
            element.scrollTop >=
            element.scrollHeight - element.clientHeight - 1,
        ),
      )
      .toBe(true)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const wrap = document.querySelector('#main-content .wrap')
          const timer = document.querySelector('.tw')
          const finalContent = wrap?.lastElementChild
          if (!(finalContent instanceof HTMLElement) || !(timer instanceof HTMLElement)) return false
          return finalContent.getBoundingClientRect().bottom <= timer.getBoundingClientRect().top
        }),
      )
      .toBe(true)
  })

  test('route focus and browser history preserve shell state', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: '计划', exact: true }).last().click()
    await expect(page).toHaveURL(/\/program$/)
    await expect(page.getByTestId('fitness-shell-main')).toBeFocused()

    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('fitness-shell')).toBeVisible()
    await page.goForward()
    await expect(page).toHaveURL(/\/program$/)
    await expect(page.getByTestId('fitness-shell-main')).toBeFocused()
  })

  test('PortraitGate and auth route remain composed inside the shell', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 390 })
    await page.goto('/auth', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('fitness-shell')).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.locator('.life-os-portrait-gate')).toBeVisible()
  })
})
