/** @returns {boolean} */
export function isApplePlatform() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const platform =
    navigator.platform ||
    /** @type {Navigator & { userAgentData?: { platform?: string } }} */ (navigator)
      .userAgentData?.platform ||
    ''
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua)
}

/** @returns {'⌘' | 'Ctrl'} */
export function getModKeyLabel() {
  return isApplePlatform() ? '⌘' : 'Ctrl'
}

/** @returns {string} e.g. ⌘K or Ctrl+K */
export function getCommandPaletteShortcutLabel() {
  const mod = getModKeyLabel()
  return mod === '⌘' ? '⌘K' : 'Ctrl+K'
}
