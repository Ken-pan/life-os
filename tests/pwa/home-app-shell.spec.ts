import { expect, test } from '@playwright/test'

test.describe('Home shared app shell', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'home', 'Home project only')
  })

  for (const viewport of [
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ]) {
    test(`content mode has one scroll root and clears navigation at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('/settings', { waitUntil: 'networkidle' })

      const shell = page.getByTestId('home-shell')
      const main = page.getByTestId('home-shell-main')
      await expect(shell).toHaveAttribute('data-scroll-mode', 'content')
      await expect(main).toHaveCSS('overflow-y', 'auto')

      const metrics = await page.evaluate(() => {
        const main = document.querySelector('[data-testid="home-shell-main"]')
        const shell = document.querySelector('[data-testid="home-shell"]')
        if (!(main instanceof HTMLElement) || !(shell instanceof HTMLElement)) return null
        return {
          mainScrollable: main.scrollHeight > main.clientHeight,
          shellOverflow: getComputedStyle(shell).overflow,
          bodyScrollable: document.body.scrollHeight > document.body.clientHeight + 1,
          mainCount: document.querySelectorAll('main').length,
        }
      })
      expect(metrics).toEqual({
        mainScrollable: true,
        shellOverflow: 'hidden',
        bodyScrollable: false,
        mainCount: 1,
      })
      await expect(page.getByTestId('home-shell-navigation-mobile')).toBeVisible()
      await expect(page.getByTestId('home-shell-navigation-desktop')).toBeHidden()

      await main.evaluate((element) => (element.scrollTop = element.scrollHeight))
      await expect
        .poll(() =>
          page.evaluate(() => {
            const sections = document.querySelectorAll(
              '[data-testid="home-shell-main"] .settings-block',
            )
            const finalSection = sections.item(sections.length - 1)
            const navigation = document.querySelector(
              '[data-testid="home-shell-navigation-mobile"] nav',
            )
            if (!(finalSection instanceof HTMLElement) || !(navigation instanceof HTMLElement)) {
              return false
            }
            return (
              finalSection.getBoundingClientRect().bottom <=
              navigation.getBoundingClientRect().top
            )
          }),
        )
        .toBe(true)
    })
  }

  test('desktop/mobile breakpoint transition remains app-owned composition', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/settings', { waitUntil: 'networkidle' })
    const desktop = page.getByTestId('home-shell-navigation-desktop')
    const mobile = page.getByTestId('home-shell-navigation-mobile')
    await expect(desktop).toBeVisible()
    await expect(mobile).toBeHidden()

    await page.setViewportSize({ width: 839, height: 800 })
    await expect(desktop).toBeHidden()
    await expect(mobile).toBeVisible()

    await page.setViewportSize({ width: 840, height: 800 })
    await expect(desktop).toBeVisible()
    await expect(mobile).toBeHidden()
  })

  test('Plan edit locks the generic shell and browse restores content mode', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/plan', { waitUntil: 'networkidle' })
    const shell = page.getByTestId('home-shell')
    const main = page.getByTestId('home-shell-main')
    const mobileNavigation = page.getByTestId('home-shell-navigation-mobile')

    await expect(shell).toHaveAttribute('data-scroll-mode', 'content')
    await expect(main).toHaveCSS('overflow-y', 'auto')
    await expect(mobileNavigation).toBeVisible()

    await page.getByRole('button', { name: '编辑', exact: true }).click()
    await expect(shell).toHaveAttribute('data-scroll-mode', 'locked')
    await expect(main).toHaveCSS('overflow-y', 'hidden')
    await expect(main).toHaveClass(/plan-immersive-edit/)
    await expect(mobileNavigation).toBeHidden()
    expect(
      await page.evaluate(
        () => document.body.scrollHeight > document.body.clientHeight + 1,
      ),
    ).toBe(false)

    await page.getByRole('button', { name: '快捷键与操作提示' }).click()
    const dialog = page.getByRole('dialog', { name: '平面图快捷键' })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('button', { name: '关闭' })).toBeFocused()
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(dialog).toHaveCount(0)

    await page.getByRole('button', { name: '浏览', exact: true }).click()
    await expect(shell).toHaveAttribute('data-scroll-mode', 'content')
    await expect(main).toHaveCSS('overflow-y', 'auto')
    await expect(main).not.toHaveClass(/plan-immersive-edit/)
    await expect(mobileNavigation).toBeVisible()
  })

  test('history navigation does not retain stale Plan lock state', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/settings', { waitUntil: 'networkidle' })
    const shell = page.getByTestId('home-shell')
    const main = page.getByTestId('home-shell-main')

    await page.getByRole('link', { name: '平面', exact: true }).last().click()
    await expect(page).toHaveURL(/\/plan$/)
    await expect(main).toBeFocused()
    await page.getByRole('button', { name: '编辑', exact: true }).click()
    await expect(shell).toHaveAttribute('data-scroll-mode', 'locked')

    await page.goBack()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(shell).toHaveAttribute('data-scroll-mode', 'content')
    await expect(main).toHaveCSS('overflow-y', 'auto')

    await page.goForward()
    await expect(page).toHaveURL(/\/plan$/)
    await expect(shell).toHaveAttribute('data-scroll-mode', 'content')
    await expect(main).toHaveCSS('overflow-y', 'auto')
    await expect(page.getByTestId('home-shell-navigation-mobile')).toBeVisible()
  })

  test('standalone safe area and optional overlay regions remain generic', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/settings', { waitUntil: 'networkidle' })
    await page.evaluate(() => {
      document.documentElement.classList.add('standalone-pwa')
      document.documentElement.style.setProperty('--safe-top-effective', '24px')
      document.documentElement.style.setProperty('--safe-bottom-effective', '34px')
      document.documentElement.style.setProperty(
        '--mobile-tabbar-safe-padding',
        '34px',
      )
    })

    await expect(page.locator('.appbar-inner')).toHaveCSS('padding-top', '24px')
    await expect(page.locator('.nav')).toHaveCSS('padding-bottom', '34px')
    await expect(page.getByTestId('home-shell-persistent-overlay')).toBeEmpty()
    await expect(page.getByTestId('home-shell-transient-overlay')).toBeEmpty()
    expect(await page.locator('.life-os-portrait-gate').count()).toBe(0)
  })

  test('PortraitGate remains an app-owned transient overlay', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/settings', { waitUntil: 'networkidle' })
    const shell = page.getByTestId('home-shell')
    const main = page.getByTestId('home-shell-main')

    await page.getByRole('switch', { name: '竖屏锁定（手机）' }).click()
    await expect(page.locator('.life-os-portrait-gate')).toBeHidden()

    await page.setViewportSize({ width: 700, height: 390 })
    await expect(page.getByRole('dialog', { name: '竖屏锁定提示' })).toBeVisible()
    await expect(shell).toHaveAttribute('data-transient-overlay-open')
    await expect(main).toHaveCSS('overflow-y', 'hidden')

    await page.setViewportSize({ width: 393, height: 852 })
    await expect(page.locator('.life-os-portrait-gate')).toBeHidden()
    await expect(shell).not.toHaveAttribute('data-transient-overlay-open')
    await expect(main).toHaveCSS('overflow-y', 'auto')
  })
})
