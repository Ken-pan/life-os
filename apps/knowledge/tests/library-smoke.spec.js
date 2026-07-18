import { expect, test } from '@playwright/test'
import { makeItem, readStoredItem, seedItems, waitForLibrary } from './helpers.js'

// /library 列表渲染 —— master-detail 工作台的浏览器回归护栏：
// 卡片渲染、全文检索收窄、标签 filter 交集、点卡片开内联文档。纯函数单测（searchItems
// 等）已覆盖过滤逻辑；这里守的是「过滤结果真的绑到 DOM 上 + 选中驱动 URL/编辑器」。
const T0 = 1_700_000_000_000
const ITEMS = [
  makeItem({ id: 'k_alpha', title: 'Alpha 项目笔记', body: 'alpha 正文 #work', tags: ['work'], updatedAt: T0 + 1000 }),
  makeItem({ id: 'k_beta', title: 'Beta 阅读清单', body: 'reading list beta', tags: ['reading'], updatedAt: T0 + 2000 }),
  makeItem({ id: 'k_gamma', title: 'Gamma 置顶', body: 'gamma 正文 #work', tags: ['work'], pinned: true, updatedAt: T0 + 500 }),
]

test.beforeEach(async ({ page }) => {
  await seedItems(page, ITEMS)
})

test('renders all seeded notes with pinned first', async ({ page }) => {
  await page.goto('/library')
  await waitForLibrary(page)

  const rows = page.locator('.note-row')
  await expect(rows).toHaveCount(3)
  await expect(page.locator('.note-row__title', { hasText: 'Alpha 项目笔记' })).toBeVisible()
  await expect(page.locator('.note-row__title', { hasText: 'Beta 阅读清单' })).toBeVisible()

  // 置顶条进 pinned 分组、排在最前（sort: pinned desc, updatedAt desc）。
  await expect(rows.first().locator('.note-row__title')).toHaveText('Gamma 置顶')
})

test('full-text search narrows the list', async ({ page }) => {
  await page.goto('/library')
  await waitForLibrary(page)

  await page.locator('.nw-list__head input[type="search"]').fill('beta')
  await expect(page.locator('.note-row')).toHaveCount(1)
  await expect(page.locator('.note-row__title')).toHaveText('Beta 阅读清单')
})

test('tag filter chip keeps only intersecting notes', async ({ page }) => {
  await page.goto('/library')
  await waitForLibrary(page)

  await page.locator('.nw-chips button.chip', { hasText: 'work' }).first().click()
  const rows = page.locator('.note-row')
  await expect(rows).toHaveCount(2)
  await expect(page.locator('.note-row__title', { hasText: 'Beta 阅读清单' })).toHaveCount(0)
})

test('opening a card drives ?note= URL and the inline editor', async ({ page }) => {
  await page.goto('/library')
  await waitForLibrary(page)

  await page.locator('.note-row', { hasText: 'Alpha 项目笔记' }).click()
  await expect(page).toHaveURL(/\?note=k_alpha/)
  await expect(page.locator('.ed-title')).toHaveValue('Alpha 项目笔记')

  // 只读打开不该改动落盘条目（既不 bump updatedAt，也不丢正文）。
  const stored = await readStoredItem(page, 'k_alpha')
  expect(stored.updatedAt).toBe(T0 + 1000)
  expect(stored.body).toBe('alpha 正文 #work')
})
