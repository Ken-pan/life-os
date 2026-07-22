/**
 * 「壳内」判定:当前运行在 Kenos 的原生外壳里(Mac Tauri app 或 iOS WKWebView 壳),
 * 而非普通浏览器。shellOnly 域(如 Code)只在壳内出现。
 */
import { isNative } from '$lib/native.js'
import { isIosNativeShell } from '$lib/kenos/iosNativeShell.js'

export function isShellSurface() {
  return isNative || isIosNativeShell()
}
