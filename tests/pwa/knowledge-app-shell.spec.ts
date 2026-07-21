import { expect, test } from '@playwright/test'

test.describe('KNOWLEDGE.OS app shell', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'knowledge', 'Knowledge project only')
  })

  test('single content scroll root on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/settings', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('knowledge-shell')).toBeVisible()

    const metrics = await page.evaluate(() => {
      const main = document.querySelector(
        '[data-testid="knowledge-shell-main"]',
      )
      const shell = document.querySelector('[data-testid="knowledge-shell"]')
      if (!(main instanceof HTMLElement) || !(shell instanceof HTMLElement))
        return null
      return {
        mainOverflow: getComputedStyle(main).overflowY,
        shellOverflow: getComputedStyle(shell).overflow,
        bodyScrollable:
          document.body.scrollHeight > document.body.clientHeight + 1,
        mainCount: document.querySelectorAll('main').length,
        scrollMode: shell.getAttribute('data-scroll-mode'),
      }
    })

    expect(metrics).toEqual({
      mainOverflow: 'auto',
      shellOverflow: 'hidden',
      bodyScrollable: false,
      mainCount: 1,
      scrollMode: 'content',
    })
    await expect(
      page.getByTestId('knowledge-shell-navigation-mobile'),
    ).toBeVisible()
    await expect(
      page.getByTestId('knowledge-shell-navigation-desktop'),
    ).toBeHidden()
  })

  test('library workbench uses locked scroll with column scroll roots', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/library', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('knowledge-shell')).toBeVisible()

    const metrics = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="knowledge-shell"]')
      const main = document.querySelector(
        '[data-testid="knowledge-shell-main"]',
      )
      const list = document.querySelector('.nw-list')
      if (!(shell instanceof HTMLElement) || !(main instanceof HTMLElement))
        return null
      return {
        scrollMode: shell.getAttribute('data-scroll-mode'),
        mainOverflow: getComputedStyle(main).overflowY,
        listOverflow:
          list instanceof HTMLElement ? getComputedStyle(list).overflowY : null,
      }
    })

    expect(metrics).toEqual({
      scrollMode: 'locked',
      mainOverflow: 'hidden',
      listOverflow: 'auto',
    })
  })

  test('desktop/mobile breakpoint transition is stable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/', { waitUntil: 'networkidle' })
    const desktopNavigation = page.getByTestId(
      'knowledge-shell-navigation-desktop',
    )
    const mobileNavigation = page.getByTestId(
      'knowledge-shell-navigation-mobile',
    )
    await expect(desktopNavigation).toBeVisible()
    await expect(mobileNavigation).toBeHidden()

    await page.setViewportSize({ width: 839, height: 800 })
    await expect(desktopNavigation).toBeHidden()
    await expect(mobileNavigation).toBeVisible()
  })

  test('theme and locale settings persist', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/settings', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '浅色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.locator('.appbar-titles .page-title')).toHaveText(
      'Settings',
    )

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('.appbar-titles .page-title')).toHaveText(
      'Settings',
    )
  })
})
