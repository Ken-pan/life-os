/**
 * Procedural door symbols for floor plans (CAD-style: strokes + arcs, no fill).
 */

/**
 * @param {number} x1
 * @param {number} x2
 * @param {number} y
 * @param {number} [radius]
 */
export function swingHorizontalUp({ x1, x2, y, radius = 40 }) {
  const r = Math.min(radius, x2 - x1 - 2)
  return [
    `M ${x1} ${y} L ${x2} ${y}`,
    `M ${x1} ${y} A ${r} ${r} 0 0 1 ${x1 + r} ${y - r}`,
  ].join(' ')
}

/**
 * @param {number} x1
 * @param {number} x2
 * @param {number} y
 * @param {number} [radius]
 */
export function swingHorizontalDown({ x1, x2, y, radius = 40 }) {
  const r = Math.min(radius, x2 - x1 - 2)
  return [
    `M ${x1} ${y} L ${x2} ${y}`,
    `M ${x1} ${y} A ${r} ${r} 0 0 0 ${x1 + r} ${y + r}`,
  ].join(' ')
}

/**
 * @param {number} x
 * @param {number} y1
 * @param {number} y2
 * @param {number} [radius]
 */
export function swingVerticalRight({ x, y1, y2, radius = 36 }) {
  const r = Math.min(radius, y2 - y1 - 2)
  return [
    `M ${x} ${y1} L ${x} ${y2}`,
    `M ${x} ${y1} A ${r} ${r} 0 0 0 ${x + r} ${y1 + r}`,
  ].join(' ')
}

/**
 * @param {number} x
 * @param {number} y1
 * @param {number} y2
 * @param {number} [radius]
 */
export function swingVerticalLeft({ x, y1, y2, radius = 32 }) {
  const r = Math.min(radius, y2 - y1 - 2)
  return [
    `M ${x} ${y1} L ${x} ${y2}`,
    `M ${x} ${y1} A ${r} ${r} 0 0 1 ${x - r} ${y1 + r}`,
  ].join(' ')
}

/**
 * Double hinged (French) on horizontal wall — arcs swing toward smaller y.
 * @param {{ x1: number, x2: number, y: number, radius?: number }} opts
 */
export function doubleSwingHorizontalUp({ x1, x2, y, radius = 36 }) {
  const mid = (x1 + x2) / 2
  const r = Math.min(radius, (mid - x1) * 0.92)
  return [
    `M ${x1} ${y} L ${mid} ${y}`,
    `M ${x1} ${y} A ${r} ${r} 0 0 1 ${x1 + r} ${y - r}`,
    `M ${x2} ${y} L ${mid} ${y}`,
    `M ${x2} ${y} A ${r} ${r} 0 0 0 ${x2 - r} ${y - r}`,
  ].join(' ')
}

/** @param {{ x1: number, x2: number, y: number, radius?: number }} opts */
export function doubleSwingHorizontalDown({ x1, x2, y, radius = 36 }) {
  const mid = (x1 + x2) / 2
  const r = Math.min(radius, (mid - x1) * 0.92)
  return [
    `M ${x1} ${y} L ${mid} ${y}`,
    `M ${x1} ${y} A ${r} ${r} 0 0 0 ${x1 + r} ${y + r}`,
    `M ${x2} ${y} L ${mid} ${y}`,
    `M ${x2} ${y} A ${r} ${r} 0 0 1 ${x2 - r} ${y + r}`,
  ].join(' ')
}

/** @param {{ x: number, y1: number, y2: number, radius?: number }} opts */
export function doubleSwingVerticalRight({ x, y1, y2, radius = 32 }) {
  const mid = (y1 + y2) / 2
  const r = Math.min(radius, (mid - y1) * 0.92)
  return [
    `M ${x} ${y1} L ${x} ${mid}`,
    `M ${x} ${y1} A ${r} ${r} 0 0 0 ${x + r} ${y1 + r}`,
    `M ${x} ${y2} L ${x} ${mid}`,
    `M ${x} ${y2} A ${r} ${r} 0 0 1 ${x + r} ${y2 - r}`,
  ].join(' ')
}

/** @param {{ x: number, y1: number, y2: number, radius?: number }} opts */
export function doubleSwingVerticalLeft({ x, y1, y2, radius = 32 }) {
  const mid = (y1 + y2) / 2
  const r = Math.min(radius, (mid - y1) * 0.92)
  return [
    `M ${x} ${y1} L ${x} ${mid}`,
    `M ${x} ${y1} A ${r} ${r} 0 0 1 ${x - r} ${y1 + r}`,
    `M ${x} ${y2} L ${x} ${mid}`,
    `M ${x} ${y2} A ${r} ${r} 0 0 0 ${x - r} ${y2 - r}`,
  ].join(' ')
}

/** Single-track sliding / patio — line across opening */
export function slidingHorizontal({ x1, x2, y }) {
  return `M ${x1} ${y} L ${x2} ${y}`
}

/** Bypass (two-track) sliding door — parallel panels */
export function bypassSlidingHorizontal({ x1, x2, y, gap = 4 }) {
  const arrow = `M ${x1 + 10} ${y - gap - 5} L ${x1 + 18} ${y - gap - 5} L ${x1 + 18} ${y - gap - 1}`
  return [
    `M ${x1} ${y - gap} L ${x2} ${y - gap}`,
    `M ${x1} ${y + gap} L ${x2} ${y + gap}`,
    arrow,
  ].join(' ')
}

/** Pocket door — panel + dashed pocket cavity in wall */
export function pocketHorizontal({ x1, x2, y, slide = 'left', depth = 8 }) {
  const w = x2 - x1
  const panelW = w * 0.58
  const panelX1 = slide === 'left' ? x1 : x2 - panelW
  const panelX2 = panelX1 + panelW
  const cavityX1 = slide === 'left' ? x2 - panelW * 0.9 : x1
  const cavityX2 = slide === 'left' ? x2 : x1 + panelW * 0.9
  const cy = y - depth
  return [
    `M ${panelX1} ${y} L ${panelX2} ${y}`,
    `M ${cavityX1} ${cy} L ${cavityX2} ${cy}`,
    `M ${cavityX1} ${cy - 4} L ${cavityX2} ${cy - 4}`,
  ].join(' ')
}

/**
 * Double bifold closet door on a horizontal wall segment.
 * @param {{ x1: number, x2: number, y: number, depth?: number }} opts
 */
export function bifoldHorizontalUp({ x1, x2, y, depth = 26 }) {
  const mid = (x1 + x2) / 2
  const w = x2 - x1
  const q = w * 0.22
  return [
    `M ${x1} ${y} L ${x1 + q} ${y - depth} L ${mid - 4} ${y}`,
    `M ${x2} ${y} L ${x2 - q} ${y - depth} L ${mid + 4} ${y}`,
    `M ${mid - 4} ${y} L ${mid} ${y - depth * 0.55} L ${mid + 4} ${y}`,
  ].join(' ')
}

/** Sliding door on vertical wall */
export function slidingVertical({ x, y1, y2 }) {
  return `M ${x} ${y1} L ${x} ${y2}`
}

/** Bypass sliding on vertical wall */
export function bypassSlidingVertical({ x, y1, y2, gap = 4 }) {
  const arrow = `M ${x - gap - 5} ${y1 + 10} L ${x - gap - 5} ${y1 + 18} L ${x - gap - 1} ${y1 + 18}`
  return [
    `M ${x - gap} ${y1} L ${x - gap} ${y2}`,
    `M ${x + gap} ${y1} L ${x + gap} ${y2}`,
    arrow,
  ].join(' ')
}

/** Pocket door on vertical wall */
export function pocketVertical({ x, y1, y2, slide = 'up', depth = 8 }) {
  const h = y2 - y1
  const panelH = h * 0.58
  const panelY1 = slide === 'up' ? y1 : y2 - panelH
  const panelY2 = panelY1 + panelH
  const cavityY1 = slide === 'up' ? y2 - panelH * 0.9 : y1
  const cavityY2 = slide === 'up' ? y2 : y1 + panelH * 0.9
  const cx = x - depth
  return [
    `M ${x} ${panelY1} L ${x} ${panelY2}`,
    `M ${cx} ${cavityY1} L ${cx} ${cavityY2}`,
    `M ${cx - 4} ${cavityY1} L ${cx - 4} ${cavityY2}`,
  ].join(' ')
}

/**
 * Double bifold closet door on a vertical wall segment.
 * @param {{ x: number, y1: number, y2: number, depth?: number }} opts
 */
export function bifoldVerticalLeft({ x, y1, y2, depth = 26 }) {
  const mid = (y1 + y2) / 2
  const h = y2 - y1
  const q = h * 0.22
  return [
    `M ${x} ${y1} L ${x - depth} ${y1 + q} L ${x} ${mid - 4}`,
    `M ${x} ${y2} L ${x - depth} ${y2 - q} L ${x} ${mid + 4}`,
    `M ${x} ${mid - 4} L ${x - depth * 0.55} ${mid} L ${x} ${mid + 4}`,
  ].join(' ')
}

/** @param {{ x: number, y1: number, y2: number, depth?: number }} opts */
export function bifoldVerticalRight({ x, y1, y2, depth = 26 }) {
  const mid = (y1 + y2) / 2
  const h = y2 - y1
  const q = h * 0.22
  return [
    `M ${x} ${y1} L ${x + depth} ${y1 + q} L ${x} ${mid - 4}`,
    `M ${x} ${y2} L ${x + depth} ${y2 - q} L ${x} ${mid + 4}`,
    `M ${x} ${mid - 4} L ${x + depth * 0.55} ${mid} L ${x} ${mid + 4}`,
  ].join(' ')
}
