import {
  applyDocumentMeta,
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'

const CONTRACT_COLOR_SCHEMES = new Set(['light', 'dark', 'system'])
const WEB_THEME_PREFERENCES = new Set(['light', 'dark', 'auto'])

/**
 * @param {unknown} pref
 * @returns {'light' | 'dark' | 'system'}
 */
function normalizeColorSchemePreference(pref) {
  return CONTRACT_COLOR_SCHEMES.has(pref) ? pref : 'system'
}

/**
 * @param {unknown} pref
 * @returns {'light' | 'dark' | 'auto'}
 */
function normalizeWebThemePreference(pref) {
  return WEB_THEME_PREFERENCES.has(pref) ? pref : 'auto'
}

/**
 * Convert cross-surface contracts preference to the current web runtime value.
 * Existing app storage uses "auto"; contracts use "system".
 *
 * @param {'light' | 'dark' | 'system'} pref
 * @returns {'light' | 'dark' | 'auto'}
 */
export function toWebThemePreference(pref) {
  if (pref === 'light' || pref === 'dark') return pref
  return 'auto'
}

/**
 * Convert the current web runtime value to the cross-surface contracts value.
 *
 * @param {'light' | 'dark' | 'auto'} pref
 * @returns {'light' | 'dark' | 'system'}
 */
export function fromWebThemePreference(pref) {
  const normalized = normalizeWebThemePreference(pref)
  if (normalized === 'light' || normalized === 'dark') return normalized
  return 'system'
}

/**
 * @param {'light' | 'dark' | 'auto'} pref
 * @returns {'light' | 'dark'}
 */
function resolveWebThemePreference(pref) {
  if (
    pref === 'auto' &&
    (typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function')
  ) {
    return 'light'
  }
  return resolveTheme(pref)
}

/**
 * @param {Storage | null} storage
 * @param {string} key
 * @returns {string | null}
 */
function readStorage(storage, key) {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

/**
 * @param {Storage | null} storage
 * @param {string} key
 * @param {string} value
 */
function writeStorage(storage, key, value) {
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // Ignore unavailable storage, matching existing theme runtime behavior.
  }
}

/**
 * @returns {Storage | null}
 */
function getDefaultStorage() {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

/**
 * Web adapter for cross-surface page metadata.
 *
 * @param {import('@life-os/contracts/meta').PageMetadata} meta
 * @param {{ pathname?: string; imagePath?: string }} [options]
 */
export function applyDocumentMetaWeb(meta, options = {}) {
  applyDocumentMeta(meta.appId, {
    pageTitle: meta.title,
    locale: meta.locale,
    pathname: options.pathname,
    imagePath: options.imagePath,
  })
}

/**
 * Create a small framework-neutral color-scheme preference store.
 *
 * This adapter intentionally reads/writes a direct storage key only. Existing
 * app-specific nested settings schemas are not migrated in P0.
 *
 * @param {{
 *   storageKey: string;
 *   defaultPreference?: import('@life-os/contracts/appearance').ColorSchemePreference;
 *   storage?: Storage | null;
 *   apply?: boolean;
 *   themeOptions?: import('@life-os/theme').ApplyThemeOptions;
 * }} options
 */
export function createThemePreferenceStoreWeb(options) {
  const storage = options.storage === undefined ? getDefaultStorage() : options.storage
  const defaultPreference = normalizeColorSchemePreference(
    options.defaultPreference ?? 'system',
  )
  const storedPreference = readStorage(storage, options.storageKey)
  /** @type {'light' | 'dark' | 'system'} */
  let preference = storedPreference
    ? fromWebThemePreference(storedPreference)
    : defaultPreference
  preference = normalizeColorSchemePreference(preference)
  /** @type {'light' | 'dark'} */
  let resolved = resolveWebThemePreference(toWebThemePreference(preference))
  /** @type {Set<(snapshot: { preference: 'light' | 'dark' | 'system'; webPreference: 'light' | 'dark' | 'auto'; resolved: 'light' | 'dark' }) => void>} */
  const listeners = new Set()
  /** @type {(() => void) | null} */
  let cleanupSystemTheme = null

  function snapshot() {
    return {
      preference,
      webPreference: toWebThemePreference(preference),
      resolved,
    }
  }

  function notify() {
    const next = snapshot()
    for (const listener of listeners) listener(next)
  }

  function applyCurrentTheme() {
    if (options.apply === false) return
    applyResolvedTheme(resolved, options.themeOptions)
  }

  function rebindSystemTheme() {
    if (cleanupSystemTheme) {
      cleanupSystemTheme()
      cleanupSystemTheme = null
    }
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return
    }
    cleanupSystemTheme = bindSystemThemeChange(
      () => toWebThemePreference(preference),
      (nextResolved) => {
        resolved = nextResolved
        applyCurrentTheme()
        notify()
      },
    )
  }

  function syncResolved() {
    resolved = resolveWebThemePreference(toWebThemePreference(preference))
    applyCurrentTheme()
    notify()
    rebindSystemTheme()
  }

  rebindSystemTheme()
  applyCurrentTheme()

  return {
    getPreference() {
      return preference
    },
    getWebPreference() {
      return toWebThemePreference(preference)
    },
    getResolvedTheme() {
      return resolved
    },
    /**
     * @param {'light' | 'dark' | 'system'} nextPreference
     */
    setPreference(nextPreference) {
      preference = normalizeColorSchemePreference(nextPreference)
      writeStorage(storage, options.storageKey, toWebThemePreference(preference))
      syncResolved()
    },
    /**
     * @param {(snapshot: { preference: 'light' | 'dark' | 'system'; webPreference: 'light' | 'dark' | 'auto'; resolved: 'light' | 'dark' }) => void} listener
     */
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot())
      return () => {
        listeners.delete(listener)
      }
    },
    destroy() {
      if (cleanupSystemTheme) cleanupSystemTheme()
      cleanupSystemTheme = null
      listeners.clear()
    },
  }
}

export { createI18n } from './i18n.js'

// Svelte 组件走子路径出口（@life-os/platform-web/CommandPalette.svelte），
// 保持本入口纯 JS，可被 Node 直接 import（包测试、脚本）。
