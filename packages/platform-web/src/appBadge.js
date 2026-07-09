/** Whether the Badging API is available (iOS 16.4+ installed PWAs, Chromium). */
export function isAppBadgeSupported() {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator
}

/**
 * Set the installed-app icon badge count. Pass 0 or omit to clear.
 * @param {number} [count]
 * @returns {Promise<boolean>}
 */
export async function setAppBadgeCount(count = 0) {
  if (!isAppBadgeSupported()) return false
  try {
    if (!count || count <= 0) {
      await navigator.clearAppBadge()
    } else {
      await navigator.setAppBadge(count)
    }
    return true
  } catch {
    return false
  }
}

/** @returns {Promise<boolean>} */
export async function clearAppBadge() {
  return setAppBadgeCount(0)
}
