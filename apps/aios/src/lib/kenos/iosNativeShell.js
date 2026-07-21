/**
 * Detect Kenos iOS native WKWebView shell (vs browser / PWA / Tauri).
 * Injected by clients/apple KenosWebSurfaceView as window.__KENOS_IOS_NATIVE_SHELL__.
 */
export function isIosNativeShell() {
  if (typeof window === 'undefined') return false
  if (window.__KENOS_IOS_NATIVE_SHELL__ === true) return true
  try {
    return new URLSearchParams(window.location.search).get('iosNativeShell') === '1'
  } catch {
    return false
  }
}

/** Mark <html> for CSS (hide duplicate chrome). Safe to call repeatedly. */
export function markIosNativeShellDom() {
  if (!isIosNativeShell() || typeof document === 'undefined') return
  document.documentElement.dataset.iosNativeShell = 'true'
}
