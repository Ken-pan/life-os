import { resolveAppVhCSSValue } from './viewportSync.js'

export const PWA_FOREGROUND_DEFER_MS = 5000

/** 回到前台时立刻校正 iOS PWA 视口高度，避免布局错位 */
export function flushViewportHeight() {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--app-vh', resolveAppVhCSSValue())
}

/**
 * PWA 回到前台：立即刷新视口；可选延后回调（如云同步）。
 * @param {{
 *   onForeground?: () => void;
 *   shouldDefer?: () => boolean;
 *   deferMs?: number;
 * }} [options]
 * @returns {() => void}
 */
export function bindPwaForegroundResume(options = {}) {
  if (typeof document === 'undefined') return () => {}

  const {
    onForeground,
    shouldDefer = () => false,
    deferMs = PWA_FOREGROUND_DEFER_MS,
  } = options

  /** @type {ReturnType<typeof setTimeout> | null} */
  let deferredTimer = null

  const runForeground = () => {
    if (!onForeground) return
    if (shouldDefer()) {
      if (deferredTimer) clearTimeout(deferredTimer)
      deferredTimer = setTimeout(() => {
        deferredTimer = null
        onForeground()
      }, deferMs)
      return
    }
    onForeground()
  }

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    flushViewportHeight()
    runForeground()
  }

  const onPageShow = () => {
    flushViewportHeight()
    if (document.visibilityState === 'visible') runForeground()
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onPageShow)

  return () => {
    if (deferredTimer) clearTimeout(deferredTimer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pageshow', onPageShow)
  }
}
