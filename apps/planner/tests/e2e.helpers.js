import { expect } from '@playwright/test'

export const STORAGE_KEY = 'planos_v1'

/** @param {import('@playwright/test').Page} page */
export async function waitForPlannerShell(page) {
  await page.waitForSelector('.app-shell', { timeout: 15_000 })
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'mobile' | 'desktop'} [projectName]
 */
export async function waitForPlannerReady(page, projectName = 'mobile') {
  await waitForPlannerShell(page)
  if (projectName === 'desktop') {
    await page.waitForSelector('.sidebar, .quick-add input', {
      timeout: 15_000,
    })
    return
  }
  await page.waitForSelector('[data-testid="fab-add"]', { timeout: 15_000 })
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'mobile' | 'desktop'} [projectName]
 */
export async function clearAppState(page, projectName = 'mobile') {
  await page.goto('/')
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await waitForPlannerReady(page, projectName)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'mobile' | 'desktop'} projectName
 */
async function submitQuickAdd(page, title) {
  const input = page.locator('.quick-add input').first()
  await expect(input).toBeVisible()
  await input.fill(title)
  await page.locator('.quick-add .btn-primary').first().click()
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 * @param {'mobile' | 'desktop'} [projectName]
 */
export async function quickAddTask(page, title, projectName = 'mobile') {
  const pathname = new URL(page.url()).pathname

  if (pathname.startsWith('/inbox')) {
    const input = page.getByRole('textbox').first()
    await expect(input).toBeVisible()
    await input.fill(title)
    await page.getByRole('button', { name: '添加', exact: true }).click()
    return
  }

  if (pathname !== '/') {
    await page.goto('/')
    await waitForPlannerReady(page, projectName)
  }

  const quickInput = page.locator('.quick-add input').first()
  if (projectName === 'desktop') {
    await submitQuickAdd(page, title)
    return
  }

  if (await quickInput.isVisible()) {
    await submitQuickAdd(page, title)
    return
  }

  await page.getByTestId('fab-add').click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#task-title').fill(title)
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog).toHaveCount(0)
}

/**
 * 打开「新建任务」全屏编辑器。移动端走 FAB；桌面端走收件箱空态 CTA（与生产 UI 一致）。
 * @param {import('@playwright/test').Page} page
 * @param {'mobile' | 'desktop'} [projectName]
 */
export async function openNewTaskEditor(page, projectName = 'mobile') {
  if (projectName === 'desktop') {
    await page.goto('/')
    await waitForPlannerShell(page)
    await page.getByTestId('desktop-add-task').click()
  } else {
    await page.getByTestId('fab-add').click()
  }
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}
