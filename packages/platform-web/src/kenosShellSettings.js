/**
 * Kenos iOS Continuity shell settings — theme + locale shared across domains.
 *
 * Native `KenosShellSettingsStore` is the SSOT inside the shell. Each domain's
 * localStorage remains a cache that is overwritten on pull.
 */

import { isIosNativeShell, preferredShellLocale } from './iosNativeShell.js'
import {
  isNativeBridgeAvailable,
  nativeNotificationsGetPreferences,
  nativeNotificationsSetPreferences,
  nativeShellSettingsGet,
  nativeShellSettingsSet,
} from './kenosNativeBridge.js'

export const SHELL_SETTINGS_EVENT = 'kenos:shell-settings'

/** @param {unknown} raw */
export function normalizeShellTheme(raw) {
  const t = String(raw || '').toLowerCase()
  if (t === 'light' || t === 'dark' || t === 'auto') return t
  return 'auto'
}

/** @param {unknown} raw */
export function normalizeShellLocaleMode(raw) {
  const l = String(raw || '').toLowerCase()
  if (l === 'zh' || l.startsWith('zh-')) return 'zh'
  if (l === 'en' || l.startsWith('en-')) return 'en'
  if (l === 'system' || l === 'auto' || !l) return 'system'
  return 'system'
}

/**
 * @param {string} [mode]
 * @param {string} [language]
 * @returns {'zh'|'en'}
 */
export function resolveShellLocale(mode = 'system', language = '') {
  const normalized = normalizeShellLocaleMode(mode)
  if (normalized === 'zh' || normalized === 'en') return normalized
  return preferredShellLocale(language)
}

/**
 * @returns {Promise<{
 *   ok?: boolean,
 *   skipped?: boolean,
 *   theme?: string,
 *   locale?: string,
 *   resolvedLocale?: string,
 *   hasTheme?: boolean,
 *   hasLocale?: boolean,
 *   updatedAt?: number,
 * }>}
 */
export async function pullKenosShellSettings() {
  if (!isIosNativeShell() || !isNativeBridgeAvailable()) {
    return { ok: false, skipped: true }
  }
  const result = await nativeShellSettingsGet()
  if (!result?.ok || result.skipped) return { ok: false, skipped: true, ...result }
  const settings = result.settings && typeof result.settings === 'object' ? result.settings : {}
  const theme = normalizeShellTheme(settings.theme)
  const locale = normalizeShellLocaleMode(settings.locale)
  const nav =
    (typeof window !== 'undefined' && window.navigator) ||
    (typeof navigator !== 'undefined' ? navigator : null)
  const resolvedLocale =
    settings.resolvedLocale === 'zh' || settings.resolvedLocale === 'en'
      ? settings.resolvedLocale
      : resolveShellLocale(locale, nav?.language || nav?.languages?.[0] || '')
  return {
    ok: true,
    theme,
    locale,
    resolvedLocale,
    hasTheme: settings.hasTheme === true,
    hasLocale: settings.hasLocale === true,
    // 原生壳最后一次真实变更的毫秒时间戳(旧壳无此字段 → 0),供 LWW 对账。
    updatedAt: Number(settings.updatedAt) > 0 ? Number(settings.updatedAt) : 0,
  }
}

/**
 * @param {{ theme?: string, locale?: string }} partial
 */
export async function pushKenosShellSettings(partial = {}) {
  if (!isIosNativeShell() || !isNativeBridgeAvailable()) {
    return { ok: false, skipped: true }
  }
  const payload = {}
  if (partial.theme != null) payload.theme = normalizeShellTheme(partial.theme)
  if (partial.locale != null) payload.locale = normalizeShellLocaleMode(partial.locale)
  if (!Object.keys(payload).length) {
    return { ok: false, skipped: true, code: 'empty_patch' }
  }
  const result = await nativeShellSettingsSet(payload)
  if (!result?.ok || result.skipped) return { ok: false, skipped: true, ...result }
  const settings = result.settings && typeof result.settings === 'object' ? result.settings : payload
  return {
    ok: true,
    theme: normalizeShellTheme(settings.theme ?? payload.theme),
    locale: normalizeShellLocaleMode(settings.locale ?? payload.locale),
    resolvedLocale: settings.resolvedLocale,
  }
}

/**
 * Apply Continuity shell settings into a domain app and keep them in sync.
 *
 * @param {{
 *   getTheme?: () => string,
 *   setTheme?: (theme: 'light'|'dark'|'auto') => void,
 *   applyTheme?: () => void,
 *   getLocale?: () => string,
 *   setLocale?: (locale: 'zh'|'en') => void,
 * }} adapters
 * @returns {() => void} cleanup
 */
export function bindKenosShellSettings(adapters = {}) {
  if (typeof window === 'undefined') return () => {}
  if (!isIosNativeShell()) return () => {}

  let disposed = false
  let applying = false

  const applySnapshot = (snap) => {
    if (disposed || !snap || applying) return
    applying = true
    try {
      // 按字段存在性分别应用 —— 允许「只带 persona」的偏快照(冷启注入),
      // 不会把没带的 theme/locale 误重置成默认(auto/system)。
      if (snap.theme != null && typeof adapters.setTheme === 'function') {
        const theme = normalizeShellTheme(snap.theme)
        const current =
          typeof adapters.getTheme === 'function' ? String(adapters.getTheme() || '') : ''
        if (normalizeShellTheme(current) !== theme) {
          adapters.setTheme(theme)
          adapters.applyTheme?.()
        } else {
          adapters.applyTheme?.()
        }
      }
      if ((snap.locale != null || snap.resolvedLocale != null) &&
          typeof adapters.setLocale === 'function') {
        const resolved =
          snap.resolvedLocale === 'zh' || snap.resolvedLocale === 'en'
            ? snap.resolvedLocale
            : resolveShellLocale(
                snap.locale,
                window.navigator?.language || window.navigator?.languages?.[0] || '',
              )
        const current =
          typeof adapters.getLocale === 'function' ? String(adapters.getLocale() || '') : ''
        if (current !== resolved) adapters.setLocale(resolved)
      }
      // 助手人设(Leo 模式)—— 原生壳切 Korben/Leo 后经此通道真正驱动 web 助手。
      // 只在快照带 persona 时应用(旧壳不带则不动),korben/leo 之外一律回退 korben。
      if (typeof adapters.setPersona === 'function' && snap.persona != null) {
        const persona = String(snap.persona).toLowerCase() === 'leo' ? 'leo' : 'korben'
        const current =
          typeof adapters.getPersona === 'function' ? String(adapters.getPersona() || '') : ''
        if (current !== persona) adapters.setPersona(persona)
      }
    } finally {
      applying = false
    }
  }

  const pull = () => {
    void pullKenosShellSettings().then(async (snap) => {
      if (disposed || !snap?.ok) return
      // First Continuity visit: seed native SSOT from this domain's local prefs
      // instead of overwriting them with defaults (auto / system).
      const seed = {}
      if (!snap.hasTheme && typeof adapters.getTheme === 'function') {
        seed.theme = normalizeShellTheme(adapters.getTheme())
      }
      if (!snap.hasLocale && typeof adapters.getLocale === 'function') {
        const local = String(adapters.getLocale() || '')
        if (local === 'zh' || local === 'en') seed.locale = local
      }
      if (Object.keys(seed).length) {
        const pushed = await pushKenosShellSettings(seed)
        if (disposed) return
        if (pushed?.ok) {
          applySnapshot({
            theme: pushed.theme ?? seed.theme ?? snap.theme,
            locale: pushed.locale ?? seed.locale ?? snap.locale,
            resolvedLocale: pushed.resolvedLocale ?? snap.resolvedLocale,
          })
          return
        }
      }
      applySnapshot(snap)
    })
  }

  /** @param {Event} ev */
  const onShellEvent = (ev) => {
    const detail = /** @type {CustomEvent} */ (ev).detail || {}
    applySnapshot({
      theme: detail.theme,
      locale: detail.locale,
      resolvedLocale: detail.resolvedLocale,
      persona: detail.persona,
    })
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') pull()
  }

  // 冷启动首帧:pull() 异步落地前,先用原生 atDocumentStart 注入的 persona
  // 立即水合,避免「进来先是 Korben、半秒后才变 Leo」的闪。
  const injectedPersona = String(window.__KENOS_ASSISTANT_PERSONA__ || '')
  if (injectedPersona && typeof adapters.setPersona === 'function') {
    applySnapshot({ persona: injectedPersona })
  }

  pull()
  window.addEventListener(SHELL_SETTINGS_EVENT, onShellEvent)
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    disposed = true
    window.removeEventListener(SHELL_SETTINGS_EVENT, onShellEvent)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

/**
 * Domain settings UI helper — persist locally then mirror to Continuity shell.
 * @param {'light'|'dark'|'auto'|string} theme
 * @param {(theme: string) => void} [persistLocal]
 */
export async function publishShellTheme(theme, persistLocal) {
  const next = normalizeShellTheme(theme)
  persistLocal?.(next)
  return pushKenosShellSettings({ theme: next })
}

/**
 * @param {'zh'|'en'|string} locale
 * @param {(locale: 'zh'|'en') => void} [persistLocal]
 */
export async function publishShellLocale(locale, persistLocal) {
  const next = normalizeShellLocaleMode(locale)
  const resolved = next === 'system' ? resolveShellLocale('system') : next
  if (resolved === 'zh' || resolved === 'en') persistLocal?.(resolved)
  return pushKenosShellSettings({ locale: next === 'system' ? 'system' : resolved })
}

/**
 * Mirror a domain notification toggle onto native category preferences.
 * @param {string} category KenosNotificationType raw value (e.g. plan_reminder)
 * @param {boolean} enabled
 */
export async function publishNotificationCategoryEnabled(category, enabled) {
  if (!isIosNativeShell() || !isNativeBridgeAvailable()) {
    return { ok: false, skipped: true }
  }
  const key = String(category || '')
  if (!key) return { ok: false, skipped: true, code: 'invalid_category' }
  return nativeNotificationsSetPreferences({
    categoryEnabled: { [key]: Boolean(enabled) },
  })
}

/**
 * @param {string} category
 * @param {boolean} [fallback=true]
 */
export async function readNotificationCategoryEnabled(category, fallback = true) {
  if (!isIosNativeShell() || !isNativeBridgeAvailable()) {
    return { ok: false, skipped: true, enabled: fallback }
  }
  const key = String(category || '')
  if (!key) return { ok: false, skipped: true, enabled: fallback }
  const result = await nativeNotificationsGetPreferences()
  if (!result?.ok || result.skipped) {
    return { ok: false, skipped: true, enabled: fallback }
  }
  const categories = result.preferences?.categoryEnabled
  if (!categories || typeof categories !== 'object') {
    return { ok: true, enabled: fallback }
  }
  if (Object.prototype.hasOwnProperty.call(categories, key)) {
    return { ok: true, enabled: Boolean(categories[key]) }
  }
  return { ok: true, enabled: fallback }
}
