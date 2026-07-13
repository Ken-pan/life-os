/**
 * Return the viewport space obstructed by visible bottom-anchored overlays.
 * Rectangles are already filtered for visibility by the component.
 *
 * @param {number} viewportHeight
 * @param {Array<{ top: number, width: number, height: number }>} rectangles
 */
export function getPersistentOverlayInset(viewportHeight, rectangles) {
  let inset = 0
  for (const rectangle of rectangles) {
    if (rectangle.width <= 0 || rectangle.height <= 0) continue
    inset = Math.max(inset, viewportHeight - rectangle.top)
  }
  return Math.max(0, Math.ceil(inset))
}
