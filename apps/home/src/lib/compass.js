/**
 * 手机罗盘 —— 站在屋里转身，视锥跟着转。
 *
 * 两套实现互不兼容：
 * - iOS：需 requestPermission()（必须由用户手势触发），给 webkitCompassHeading，
 *   已是「0=北、顺时针」。
 * - 其余：deviceorientationabsolute 的 alpha 是「0=北、逆时针」，要取反。
 *
 * 室内读数会被钢结构和家电磁铁带偏，别当真值用 —— 只做初值 + 实时预览。
 */

export function compassSupported() {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
}

/** iOS 才需要显式授权。 */
export function compassNeedsPermission() {
  return (
    compassSupported() &&
    typeof (/** @type {any} */ (DeviceOrientationEvent).requestPermission) === 'function'
  )
}

/**
 * 必须在用户手势的调用栈里调，否则 iOS 直接拒。
 * @returns {Promise<boolean>}
 */
export async function requestCompassPermission() {
  if (!compassNeedsPermission()) return compassSupported()
  try {
    const res = await /** @type {any} */ (DeviceOrientationEvent).requestPermission()
    return res === 'granted'
  } catch {
    return false
  }
}

/**
 * @param {(heading: number, accurate: boolean) => void} onHeading
 * @returns {() => void} 取消订阅
 */
export function watchCompass(onHeading) {
  if (!compassSupported()) return () => {}

  /** @param {any} e */
  function handle(e) {
    let heading = null
    let accurate = true
    if (typeof e.webkitCompassHeading === 'number') {
      heading = e.webkitCompassHeading
      // iOS 用 webkitCompassAccuracy 报误差角，负数代表罗盘没校准好。
      if (typeof e.webkitCompassAccuracy === 'number') {
        accurate = e.webkitCompassAccuracy >= 0 && e.webkitCompassAccuracy < 25
      }
    } else if (typeof e.alpha === 'number') {
      if (e.absolute === false) return // 相对朝向对定北没用
      heading = 360 - e.alpha
      accurate = e.absolute === true
    }
    if (heading == null || Number.isNaN(heading)) return
    onHeading(((heading % 360) + 360) % 360, accurate)
  }

  const evtName =
    'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute'
      : 'deviceorientation'
  window.addEventListener(evtName, handle, true)
  return () => window.removeEventListener(evtName, handle, true)
}
