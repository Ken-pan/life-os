/** @typedef {{ x: number, y: number }} PlanPoint */

/**
 * 屏幕坐标 → SVG viewBox 坐标（考虑画布平移/缩放）。
 * @param {DOMRect} viewportRect
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} panX
 * @param {number} panY
 * @param {number} zoom
 * @param {number} [padding]
 * @returns {PlanPoint}
 */
export function clientToSvgPoint(
  viewportRect,
  clientX,
  clientY,
  panX,
  panY,
  zoom,
  padding = 12,
) {
  const relX = clientX - viewportRect.left - padding
  const relY = clientY - viewportRect.top - padding
  return {
    x: (relX - panX) / zoom,
    y: (relY - panY) / zoom,
  }
}

/**
 * @param {PlanPoint} a
 * @param {PlanPoint} b
 * @param {number} pxPerFt
 * @returns {number} feet
 */
export function distanceFt(a, b, pxPerFt) {
  const px = Math.hypot(b.x - a.x, b.y - a.y)
  return px / pxPerFt
}

/**
 * @param {number} ft
 * @returns {string}
 */
export function formatMeasureFt(ft) {
  const totalIn = Math.round(ft * 12)
  if (totalIn === 0) return '0"'
  const sign = totalIn < 0 ? '−' : ''
  const abs = Math.abs(totalIn)
  const feet = Math.floor(abs / 12)
  const inches = abs % 12
  if (feet === 0) return `${sign}${inches}"`
  if (inches === 0) return `${sign}${feet}'`
  return `${sign}${feet}'${inches}"`
}

/**
 * @param {PlanPoint | null} a
 * @param {PlanPoint | null} b
 * @param {number} pxPerFt
 * @returns {{ line: string, label: string, mid: PlanPoint } | null}
 */
export function measureOverlaySvg(a, b, pxPerFt) {
  if (!a || !b) return null
  const ft = distanceFt(a, b, pxPerFt)
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 14 }
  return {
    line: `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="measure-line"/>`,
    label: formatMeasureFt(ft),
    mid,
  }
}
