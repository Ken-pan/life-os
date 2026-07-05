/** 交易类别展示名（内部存储仍用英文 key，与 CSV 导入一致）。 */

import { t } from "../i18n/translate";

const CATEGORY_KEYS = [
  "Groceries",
  "Dining",
  "Coffee",
  "Auto & Transport",
  "Housing > Rent",
  "Housing",
  "Income",
  "Shopping",
  "Entertainment",
  "Health",
  "Travel",
  "Subscriptions",
  "Utilities",
  "Household",
  "Uncategorized",
  "Transfer",
  "Credit Card Payment",
] as const;

export const DEFAULT_CATEGORY_KEYS = [
  "Dining",
  "Coffee",
  "Groceries",
  "Auto & Transport",
  "Household",
  "Entertainment",
  "Subscriptions",
  "Health",
] as const;

export function categoryDisplayLabel(category: string): string {
  if (!category) return t("categories.Uncategorized");
  const key = `categories.${category}` as const;
  const translated = t(key);
  if (translated !== key) return translated;
  return category;
}

export function isKnownCategoryKey(category: string): boolean {
  return (CATEGORY_KEYS as readonly string[]).includes(category);
}
