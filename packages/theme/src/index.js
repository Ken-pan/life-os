export {
  LIFE_OS_LAYOUT,
  LIFE_OS_CONTENT_FRAME,
  lifeOsMaxWidthMq,
  lifeOsMinWidthMq,
  lifeOsMobileMq,
  lifeOsDesktopMq,
  isLifeOsMobile,
  isLifeOsDesktop,
  matchLifeOsMedia,
  bindLifeOsMedia,
} from './layout.js'

export {
  LIFE_OS_SHELL,
  LIFE_OS_SHELL_COLUMN_IS,
  LIFE_OS_MAIN_WRAP_SCROLL_SELECTORS,
  LIFE_OS_SHELL_COLUMN_SCROLL_SELECTORS,
  LIFE_OS_SCROLL_ROOT_SELECTORS,
  LIFE_OS_SCROLL_ROOT_SELECTORS_BY_SHELL,
  LIFE_OS_SHELL_REFERENCE,
  getScrollRootSelector,
  getScrollRootSelectorForShell,
  getScrollRootSelectorsForShell,
  resolveScrollRoot,
  findActiveScrollRoot,
} from './shell.js'

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
  getLifeOsAppWordmarkAccent,
} from './brand.js'

export {
  LIFE_OS_APP_ORIGINS,
  LIFE_OS_SWITCHER_APPS,
  getLifeOsAppOrigin,
  getLifeOsAppBrandOrigin,
  getLifeOsAppBrandIconUrl,
  getLifeOsAppBrandMark,
} from './launcher.js'

export {
  filterLifeOsSwitcherApps,
  findSwitcherTypeAheadIndex,
} from './brandSwitcher.js'

export { applyDocumentMeta } from './documentMeta.js'

export { lockScroll, unlockScroll, resetScrollLock } from './scrollLock.js'
export { activateFocusTrap } from './focusTrap.js'
export { createImeGuard } from './createImeGuard.js'
export { createToastDeduper, resolveToastDuration } from './toastPolicy.js'

export {
  KEYBOARD_INSET_FLOOR_PX,
  bindViewportHeight,
  clampPopoverPosition,
  ensureFocusedInputVisible,
  getBottomChromeHeight,
  getVisualViewportHeight,
  getViewportRect,
  isEditableFocusTarget,
  isKeyboardOpen,
  isStandalonePwa,
  needsViewportHeightSync,
  resolveAppVhCSSValue,
  resolveKeyboardInset,
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
 * Korben Shell（iOS 原生壳）在 .atDocumentStart 下发的主题偏好。
 * 壳内所有 Domain 共用壳的配色，保证「用户始终在同一个 Korben Shell」；
 * 壳外（普通浏览器）返回 null，各 app 保持自有偏好逻辑不变。
 * @returns {ThemePreference | null}
 */
export function shellThemePreference() {
  if (typeof window === 'undefined') return null
  const raw =
    window.__KENOS_SHELL_THEME__ ??
    (typeof document !== 'undefined'
      ? document.documentElement?.dataset?.kenosShellTheme
      : null)
  return isThemePreference(raw) ? raw : null
}

/**
 * @param {ThemePreference | string | null | undefined} preference
 * @param {ThemePreference} [fallback='auto']
 * @returns {ResolvedTheme}
 */
export function resolveTheme(preference, fallback = 'auto') {
  const shell = shellThemePreference()
  const pref = shell ?? (isThemePreference(preference) ? preference : fallback)
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

  // Kenos iOS shell listens for status-bar polarity (light canvas → dark icons).
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('kenos:resolved-theme', { detail: { theme: resolved } }),
      )
    }
  } catch {
    /* ignore */
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
    const shell = shellThemePreference()
    const effective = shell ?? (isThemePreference(pref) ? pref : fallback)
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
