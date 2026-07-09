/** 应用界面语言（预留 zh-TW 等扩展）。 */
export type AppLocale = "zh-CN" | "en-US";

export const DEFAULT_LOCALE: AppLocale = "zh-CN";

export const LOCALE_STORAGE_KEY = "fos-locale";

export const SUPPORTED_LOCALES: { value: AppLocale; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
];

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "zh-CN" || value === "en-US";
}

export function readStoredLocale(): AppLocale {
  if (typeof localStorage === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isAppLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function writeStoredLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}
