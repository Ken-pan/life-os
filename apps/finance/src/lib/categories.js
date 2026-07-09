// 端口自 src/copy/categories.ts（交易类别展示名；内部存储仍用英文 key，与 CSV 导入一致）。
import { t } from './i18n.svelte.js'

const CATEGORY_KEYS = [
  'Groceries',
  'Dining',
  'Coffee',
  'Auto & Transport',
  'Housing > Rent',
  'Housing',
  'Income',
  'Shopping',
  'Entertainment',
  'Health',
  'Travel',
  'Subscriptions',
  'Utilities',
  'Household',
  'Uncategorized',
  'Transfer',
  'Credit Card Payment',
]

export const DEFAULT_CATEGORY_KEYS = [
  'Dining',
  'Coffee',
  'Groceries',
  'Auto & Transport',
  'Household',
  'Entertainment',
  'Subscriptions',
  'Health',
]

/** @param {string} category */
export function categoryDisplayLabel(category) {
  if (!category) return t('categories.Uncategorized')
  const key = `categories.${category}`
  const translated = t(key)
  if (translated !== key) return translated
  return category
}

/** @param {string} category */
export function isKnownCategoryKey(category) {
  return CATEGORY_KEYS.includes(category)
}
