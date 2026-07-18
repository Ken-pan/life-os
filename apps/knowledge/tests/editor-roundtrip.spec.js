import { expect, test } from '@playwright/test'
import { makeItem, readStoredItem, seedItems } from './helpers.js'

// NoteEditor 核心往返（打字 → 块模型 → Markdown 落盘）的浏览器护栏。
// blocks.js/inline.js 的纯转换单测已锁；这里守的是 contenteditable 输入 → 状态回读 →
// 防抖保存 → localStorage 这条只有真浏览器才走得通的链路，以及块首 input-rule 与
// 「首个 H1 与标题重复只在渲染层隐藏、Markdown 不动」两个已知回归点。

/** 等某条目落盘 body 到达预期（防抖 600ms + 保存）。 */
async function expectStoredBody(page, id, expected) {
  await expect
    .poll(async () => (await readStoredItem(page, id))?.body, { timeout: 5000 })
    .toBe(expected)
}

test('typing into a block persists clean markdown to storage', async ({ page }) => {
  await seedItems(page, [
    makeItem({ id: 'k_edit', title: 'Draft', body: '第一行\n\n第二行' }),
  ])
  await page.goto('/library?note=k_edit')

  // 载入即把 Markdown 拆成块渲染（两段）。
  const edits = page.locator('.ed-blocks .ed-edit')
  await expect(edits).toHaveCount(2)
  await expect(edits.nth(0)).toHaveText('第一行')
  await expect(edits.nth(1)).toHaveText('第二行')

  // 打字追加 → DOM→状态回读→防抖落盘；段落结构（\n\n）保真。
  await edits.nth(0).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' 追加', { delay: 30 })
  await expectStoredBody(page, 'k_edit', '第一行 追加\n\n第二行')
})

test('block prefix rule promotes paragraph to heading in stored markdown', async ({ page }) => {
  await seedItems(page, [makeItem({ id: 'k_blank', title: '', body: '' })])
  await page.goto('/library?note=k_blank')

  const block = page.locator('.ed-blocks .ed-edit').first()
  await expect(block).toBeVisible()
  await block.click()
  // 「# 」触发块级 input-rule → 段落 replaceBlock 成 H1（换 id 重挂载 + pendingFocus 重聚焦）。
  await page.keyboard.type('# ', { delay: 40 })
  const heading = page.locator('.ed-blocks .ed-edit--heading')
  await expect(heading).toBeVisible()
  // 重挂载后焦点落到新标题块；输入标题文本。
  await heading.click()
  await page.keyboard.press('End')
  await page.keyboard.type('标题', { delay: 40 })

  await expectStoredBody(page, 'k_blank', '# 标题')
  await expect(heading).toHaveText('标题')
})

test('first H1 matching the title is hidden in render but kept in markdown', async ({ page }) => {
  await seedItems(page, [
    makeItem({ id: 'k_dup', title: '标题X', body: '# 标题X\n\n正文' }),
  ])
  await page.goto('/library?note=k_dup')

  await expect(page.locator('.ed-title')).toHaveValue('标题X')
  // 重复 H1 在渲染层被吞掉：只剩「正文」一个可见块，且没有渲染出的标题块。
  const edits = page.locator('.ed-blocks .ed-edit')
  await expect(edits).toHaveCount(1)
  await expect(edits.first()).toHaveText('正文')
  await expect(page.locator('.ed-blocks .ed-edit--heading')).toHaveCount(0)

  // Markdown 数据不动（Obsidian 互通契约）：落盘正文仍含 # 标题X。
  const stored = await readStoredItem(page, 'k_dup')
  expect(stored.body).toBe('# 标题X\n\n正文')
})
