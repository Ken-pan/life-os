const SESSION_KEY = 'kenos.iosNativeShell'
const CHROME_STYLE_ID = 'kenos-ios-native-shell-css'

/** Match KenosWebChrome.domainDock / kenosTabs (KenosWebSurfaceView). */
export const IOS_NATIVE_SHELL_TOP_PAD_PX = 54
/**
 * Base Domain/Kenos dock scroll-end pad (KenosGlass.dockScrollEndPadPx).
 * = dock row 56 + float 6 + breathing 16. Pair with env(safe-area-inset-bottom).
 * Live Accessory extra pad is injected dynamically by native.
 */
export const IOS_NATIVE_SHELL_BOTTOM_PAD_PX = 78

/**
 * Map a BCP-47 language tag to Kenos app locale (`zh` | `en`).
 * @param {string} [language]
 * @returns {'zh' | 'en'}
 */
export function preferredShellLocale(language = '') {
  const lang = String(language || '').toLowerCase()
  return lang.startsWith('zh') ? 'zh' : 'en'
}

/**
 * Daily Beta WKWebView: align web i18n with the system locale (same as native Dock),
 * so Chinese/English dock labels and page chrome do not mix.
 * @param {(locale: 'zh' | 'en') => void} setLocale
 * @param {() => string} [getLocale]
 * @returns {boolean} true when locale was changed
 */
export function syncLocaleFromSystemForNativeShell(setLocale, getLocale) {
  if (typeof setLocale !== 'function') return false
  if (!isIosNativeShell()) return false
  const nav =
    (typeof window !== 'undefined' && window.navigator) ||
    (typeof navigator !== 'undefined' ? navigator : null)
  const navLang = nav?.language || nav?.languages?.[0] || ''
  const next = preferredShellLocale(navLang)
  if (typeof getLocale === 'function' && getLocale() === next) return false
  setLocale(next)
  return true
}

/**
 * Kenos iOS native WKWebView shell (vs browser / PWA / Tauri).
 * Injected by clients/apple KenosWebSurfaceView as window.__KENOS_IOS_NATIVE_SHELL__
 * and document.documentElement.dataset.iosNativeShell.
 */
export function isIosNativeShell() {
  if (typeof window === 'undefined') return false
  if (/** @type {any} */ (window).__KENOS_IOS_NATIVE_SHELL__ === true) return true
  try {
    if (
      new URLSearchParams(window.location.search).get('iosNativeShell') === '1'
    )
      return true
  } catch {
    /* ignore */
  }
  try {
    if (
      typeof document !== 'undefined' &&
      document.documentElement?.dataset?.iosNativeShell === 'true'
    ) {
      return true
    }
  } catch {
    /* ignore */
  }
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Fallback chrome CSS when WK user-script has not injected yet (e.g. ?iosNativeShell=1 in browser).
 * Never overwrites the native `#kenos-ios-native-shell-css` stylesheet.
 */
export function ensureIosNativeShellChromeCss() {
  if (typeof document === 'undefined') return false
  if (!isIosNativeShell()) return false
  if (document.getElementById(CHROME_STYLE_ID)) return false

  const top = IOS_NATIVE_SHELL_TOP_PAD_PX
  const bottom = IOS_NATIVE_SHELL_BOTTOM_PAD_PX
  const style = document.createElement('style')
  style.id = CHROME_STYLE_ID
  style.textContent = [
    `html[data-ios-native-shell='true']{`,
    `--kenos-chrome-top-inset:${top}px;`,
    `--kenos-dock-scroll-end-pad:${bottom}px;`,
    `--mobile-tabbar-total-h:0px!important;`,
    `--mobile-content-inset:0px!important;`,
    `--mobile-content-inset-tabbar:0px!important;`,
    `--bottom-chrome-h:0px!important;`,
    `--safe-top-effective:0px!important;`,
    `}`,
    /* Immersive Focus/Summary: restore real inset (chrome pad is 0). */
    `html[data-ios-native-shell='true'][data-immersive-route='true'],`,
    `html[data-ios-native-shell='true'][data-kenos-web-chrome='none']{`,
    `--safe-top-effective:env(safe-area-inset-top,0px)!important;`,
    `--safe-top:env(safe-area-inset-top,0px)!important;`,
    `}`,
    `html[data-ios-native-shell='true'] #main-content,`,
    `html[data-ios-native-shell='true'] .life-os-app-shell__main,`,
    `html[data-ios-native-shell='true'] .main-col{`,
    `padding-top:var(--kenos-chrome-top-inset,${top}px)!important;`,
    `padding-bottom:calc(env(safe-area-inset-bottom,0px) + var(--kenos-dock-scroll-end-pad,${bottom}px))!important;`,
    `scroll-padding-bottom:calc(env(safe-area-inset-bottom,0px) + var(--kenos-dock-scroll-end-pad,${bottom}px))!important;`,
    `padding-left:0!important;`,
    `padding-right:0!important;`,
    `box-sizing:border-box!important;`,
    `}`,
    `html[data-ios-native-shell='true'][data-immersive-route='true'] #main-content,`,
    `html[data-ios-native-shell='true'][data-immersive-route='true'] .life-os-app-shell__main,`,
    `html[data-ios-native-shell='true'][data-immersive-route='true'] .main-col,`,
    `html[data-ios-native-shell='true'][data-kenos-web-chrome='none'] #main-content,`,
    `html[data-ios-native-shell='true'][data-kenos-web-chrome='none'] .life-os-app-shell__main,`,
    `html[data-ios-native-shell='true'][data-kenos-web-chrome='none'] .main-col{`,
    `padding-top:0!important;`,
    `}`,
    `html[data-ios-native-shell='true'] .app-shell,`,
    `html[data-ios-native-shell='true'] .life-os-app-shell,`,
    `html[data-ios-native-shell='true'] .life-os-page-workspace,`,
    `html[data-ios-native-shell='true'] .page{`,
    `padding-top:0!important;`,
    `padding-bottom:0!important;`,
    `}`,
    /* Domain dock owns bottom chrome — hide web FABs / floating compose. */
    `html[data-ios-native-shell='true'] .fab,`,
    `html[data-ios-native-shell='true'] .fab-host,`,
    `html[data-ios-native-shell='true'] .lib-top-fab,`,
    `html[data-ios-native-shell='true'] [data-testid$='-fab'],`,
    `html[data-ios-native-shell='true'] button.fab{`,
    `display:none!important;`,
    `visibility:hidden!important;`,
    `pointer-events:none!important;`,
    `}`,
    /* Fitness timer — clear Domain Dock. */
    `html[data-ios-native-shell='true'] .tw{`,
    `bottom:calc(var(--kenos-dock-scroll-end-pad,${bottom}px) + 18px + env(safe-area-inset-bottom,0px))!important;`,
    `}`,
  ].join('')
  ;(document.head || document.documentElement).appendChild(style)
  return true
}

/** Mark <html> for CSS (hide duplicate chrome). Safe to call repeatedly. */
export function markIosNativeShellDom() {
  if (typeof document === 'undefined') return
  if (!isIosNativeShell()) return
  ;/** @type {any} */ (window).__KENOS_IOS_NATIVE_SHELL__ = true
  document.documentElement.dataset.iosNativeShell = 'true'
  try {
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    /* private mode */
  }
  ensureIosNativeShellChromeCss()
}
