import { expect } from '@playwright/test'

// KnowledgeOS web 后端：条目随 settings 存 localStorage（见 state.svelte.js 的
// createSettingsPersistence({ key: 'knowledgeos_v1' })）。envelope = { settings, items }。
export const STORAGE_KEY = 'knowledgeos_v1'

/**
 * KItem（web 模式最小形），字段对齐 state.svelte.js 的 captureText/createNote。
 * @param {Partial<Record<string, any>>} over
 */
export function makeItem(over = {}) {
  const now = Date.now()
  return {
    id: over.id || `k_seed_${Math.random().toString(36).slice(2, 8)}`,
    type: 'note',
    title: '',
    body: '',
    url: '',
    tags: [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

/**
 * 在页面加载前把条目种进 localStorage（先于 app 读取），随后导航。
 * @param {import('@playwright/test').Page} page
 * @param {any[]} items
 */
export async function seedItems(page, items) {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: { settings: { theme: 'auto', locale: 'zh' }, items } },
  )
}

/** 等 library 工作台外壳就绪（列表列 + 顶栏搜索框）。 */
export async function waitForLibrary(page) {
  await expect(page.locator('.nw-list')).toBeVisible({ timeout: 15_000 })
}

/**
 * 读回某条目在 localStorage 里的持久化形（验证「落盘」用）。
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @returns {Promise<any | null>}
 */
export async function readStoredItem(page, id) {
  return page.evaluate(
    ({ key, wantId }) => {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return (parsed.items || []).find((it) => it.id === wantId) ?? null
    },
    { key: STORAGE_KEY, wantId: id },
  )
}
