export { LIFE_OS_LAYOUT } from './layout.js'

export {
  LIFE_OS_SITE_META,
  LIFE_OS_ROBOTS,
  LIFE_OS_REFERRER,
  formatDocumentTitle,
  getSiteDescription,
  absoluteUrl,
  getOgLocale,
} from './siteMeta.js'

export {
  LIFE_OS_BRAND_MARK_SIZE,
  getBrandIconPaths,
  getLifeOsBrand,
  getLifeOsBrandMarkSize,
} from './brand.js'

export { applyDocumentMeta } from './documentMeta.js'

export { lockScroll, unlockScroll, resetScrollLock } from './scrollLock.js'
export { activateFocusTrap } from './focusTrap.js'
export { createImeGuard } from './createImeGuard.js'
export { createToastDeduper, resolveToastDuration } from './toastPolicy.js'

export {
  bindViewportHeight,
  clampPopoverPosition,
  getBottomChromeHeight,
  getVisualViewportHeight,
  getViewportRect,
  isStandalonePwa,
  needsViewportHeightSync,
} from './viewportSync.js'

export {
  DEFAULT_PWA_SETTINGS,
  normalizePwaSettings,
  mergePwaSettings,
} from './pwaSettings.js'

export {
  PWA_FOREGROUND_DEFER_MS,
  flushViewportHeight,
  bindPwaForegroundResume,
} from './pwaResume.js'

export { syncPortraitLockEnabled } from './portraitGate.js'

export {
  configureAudioLeaseDebugTag,
  getAudioSession,
  safeSetAudioSessionType,
  getAudioLeaseContext,
  primeAudioLease,
  withAudioCuePlayback,
  cancelAudioLeaseCues,
  closeAudioLease,
  bindAudioLeaseCleanup,
  logAudioLeaseDebug,
} from './audioLease.js'

/** @typedef {'light' | 'dark' | 'auto'} ThemePreference */
/** @typedef {'light' | 'dark'} ResolvedTheme */

/** @type {ThemePreference[]} */
export const THEME_PREFERENCES = ['light', 'dark', 'auto']

/**
 * @param {string | null | undefined} value
 * @returns {value is ThemePreference}
 */
export function isThemePreference(value) {
  return value === 'light' || value === 'dark' || value === 'auto'
}

/**
 * @param {ThemePreference | string | null | undefined} preference
 * @param {ThemePreference} [fallback='auto']
 * @returns {ResolvedTheme}
 */
export function resolveTheme(preference, fallback = 'auto') {
  const pref = isThemePreference(preference) ? preference : fallback
  if (pref === 'auto') {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return pref
}

/**
 * @typedef {Object} ApplyThemeOptions
 * @property {string} [themeColorMetaId]
 * @property {string} [faviconId]
 * @property {string} [faviconLight]
 * @property {string} [faviconDark]
 * @property {{ light: string; dark: string }} [themeColorFallback]
 */

/**
 * Life OS 统一主题应用：html[data-theme] + colorScheme + theme-color meta + favicon
 * @param {ResolvedTheme} resolved
 * @param {ApplyThemeOptions} [options]
 */
export function applyResolvedTheme(resolved, options = {}) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.setAttribute('data-theme', resolved)
  root.style.colorScheme = resolved

  const {
    themeColorMetaId = 'theme-color-meta',
    faviconId,
    faviconLight,
    faviconDark,
    themeColorFallback = { light: '#ffffff', dark: '#0d0d0e' },
  } = options

  const fromCss = getComputedStyle(root)
    .getPropertyValue('--theme-color')
    .trim()
  const themeColor = fromCss || themeColorFallback[resolved]

  const meta =
    (themeColorMetaId && document.getElementById(themeColorMetaId)) ||
    document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', themeColor)

  if (faviconId && faviconLight && faviconDark) {
    const favicon = document.getElementById(faviconId)
    if (favicon)
      favicon.setAttribute(
        'href',
        resolved === 'dark' ? faviconDark : faviconLight,
      )
  }
}

/**
 * @param {() => ThemePreference | string | null | undefined} readPreference
 * @param {ApplyThemeOptions} options
 * @param {ThemePreference} [fallback='auto']
 */
export function applyThemeFromPreference(
  readPreference,
  options,
  fallback = 'auto',
) {
  applyResolvedTheme(resolveTheme(readPreference(), fallback), options)
}

/**
 * 跟随系统时监听 prefers-color-scheme 变化
 * @param {() => ThemePreference | string | null | undefined} readPreference
 * @param {(resolved: ResolvedTheme) => void} onResolved
 * @param {ThemePreference} [fallback='auto']
 * @returns {() => void}
 */
export function bindSystemThemeChange(
  readPreference,
  onResolved,
  fallback = 'auto',
) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    const pref = readPreference()
    const effective = isThemePreference(pref) ? pref : fallback
    if (effective === 'auto') onResolved(resolveTheme('auto'))
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}

/**
 * 供 app.html 内联脚本使用的引导逻辑（避免 FOUC）
 * @param {ThemePreference | string | null | undefined} preference
 * @param {ThemePreference} [fallback='auto']
 * @returns {ResolvedTheme}
 */
export function bootResolveTheme(preference, fallback = 'auto') {
  return resolveTheme(preference, fallback)
}
