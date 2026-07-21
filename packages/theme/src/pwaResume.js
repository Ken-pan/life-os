import { resolveAppVhCSSValue, resolveKeyboardInset } from './viewportSync.js'
import { resetScrollLock } from './scrollLock.js'
import { findActiveScrollRoot } from './shell.js'

export const PWA_FOREGROUND_DEFER_MS = 5000

/** 回到前台时立刻校正 iOS PWA 视口高度 / 键盘 inset，避免布局错位 */
export function flushViewportHeight() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--app-vh', resolveAppVhCSSValue())
  const inset = resolveKeyboardInset()
  root.style.setProperty('--keyboard-inset', `${inset}px`)
  root.classList.toggle('keyboard-open', inset > 0)
  root.dataset.keyboardOpen = inset > 0 ? 'true' : 'false'
}

/** 清除残留的 scroll lock，并 kick 主滚动面避免 iOS 恢复后无法滚动 */
function refreshScrollSurface() {
  if (typeof document === 'undefined') return
  resetScrollLock()
  const root = findActiveScrollRoot()
  if (!root) return
  root.style.removeProperty('overflow')
  const top = root.scrollTop
  root.scrollTop = top
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
    refreshScrollSurface()
    runForeground()
  }

  const onPageShow = () => {
    flushViewportHeight()
    refreshScrollSurface()
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
