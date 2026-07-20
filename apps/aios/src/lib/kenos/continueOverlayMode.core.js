/**
 * Continue overlay layout mode — width + pointer capability (no UA / device name).
 *
 * @typedef {'mobile' | 'tablet' | 'tablet-lg' | 'desktop'} ContinueOverlayMode
 */

/**
 * @param {{
 *   width: number,
 *   finePointer?: boolean,
 *   canHover?: boolean,
 * }} input
 * @returns {ContinueOverlayMode}
 */
export function resolveContinueOverlayMode({
  width,
  finePointer = false,
  canHover = false,
}) {
  const w = Number(width) || 0
  if (w < 600) return 'mobile'
  if (w < 900) return 'tablet'
  // ≥900: desktop shell only when fine pointer AND hover (mouse/trackpad desktop).
  // Touch-first iPad / Stage Manager / coarse pointer → large tablet form sheet.
  if (finePointer && canHover) return 'desktop'
  return 'tablet-lg'
}

/**
 * Read pointer/hover capability from matchMedia (browser only).
 * @param {Pick<Window, 'matchMedia'> | null | undefined} win
 * @returns {{ finePointer: boolean, canHover: boolean }}
 */
export function readPointerCapability(win) {
  if (!win?.matchMedia) {
    return { finePointer: false, canHover: false }
  }
  return {
    finePointer: win.matchMedia('(pointer: fine)').matches,
    canHover: win.matchMedia('(hover: hover)').matches,
  }
}

/**
 * @param {Pick<Window, 'innerWidth' | 'matchMedia'> | null | undefined} win
 * @returns {ContinueOverlayMode}
 */
export function resolveContinueOverlayModeFromWindow(win) {
  if (!win) return 'mobile'
  const { finePointer, canHover } = readPointerCapability(win)
  return resolveContinueOverlayMode({
    width: win.innerWidth,
    finePointer,
    canHover,
  })
}
