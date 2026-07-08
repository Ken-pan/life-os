/**
 * Life OS 统一 i18n 机制：dot-path 查找、{param} 插值、zh 兜底、
 * `<html lang>` / `data-locale` 同步。messages 与 locale 的存取由 app 注入，
 * 因此 `t()` 在 Svelte `$derived` / `$effect` 中保持响应式（读取发生在
 * 调用方的响应式上下文里）。
 *
 * @template {Record<string, unknown>} Messages
 * @param {{
 *   messages: Partial<Record<'zh' | 'en', Messages>>;
 *   getLocale: () => string | undefined;
 *   persistLocale: (locale: 'zh' | 'en') => void;
 * }} options
 */
export function createI18n(options) {
  const { messages, getLocale, persistLocale } = options

  const LOCALES = /** @type {const} */ (['zh', 'en'])

  /** @param {string} [locale] */
  function resolveLocale(locale) {
    return LOCALES.includes(locale) ? locale : 'zh'
  }

  /** BCP 47 tag for Intl APIs */
  function localeTag() {
    return resolveLocale(getLocale()) === 'en' ? 'en-US' : 'zh-CN'
  }

  /** @param {Record<string, unknown> | undefined} obj @param {string} path */
  function lookup(obj, path) {
    return path
      .split('.')
      .reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj)
  }

  /**
   * Translate a dot-path key. Reads getLocale() for reactivity in $derived.
   * @param {string} key
   * @param {Record<string, string | number>} [params]
   */
  function t(key, params = {}) {
    const locale = resolveLocale(getLocale())
    let str = lookup(messages[locale], key) ?? lookup(messages.zh, key) ?? key
    if (typeof str !== 'string') return key
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v))
    }
    return str
  }

  function applyLocale() {
    if (typeof document === 'undefined') return
    const locale = resolveLocale(getLocale())
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
    document.documentElement.dataset.locale = locale
  }

  /** @param {'zh' | 'en'} locale */
  function setLocale(locale) {
    persistLocale(resolveLocale(locale))
    applyLocale()
  }

  return { resolveLocale, localeTag, t, applyLocale, setLocale }
}
