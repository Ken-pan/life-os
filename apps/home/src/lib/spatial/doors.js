/**
 * Procedural door symbols for floor plans.
 * Bifold: two panels folding toward the target room (industry convention — V / zigzag).
 */

/**
 * Double bifold closet door on a horizontal wall segment.
 * Panels fold into the room on the "up" side (smaller y).
 * @param {{ x1: number, x2: number, y: number, depth?: number }} opts
 */
export function bifoldHorizontalUp(opts) {
  const { x1, x2, y, depth = 26 } = opts
  const mid = (x1 + x2) / 2
  const w = x2 - x1
  const q = w * 0.22
  return [
    `M ${x1} ${y} L ${x1 + q} ${y - depth} L ${mid - 4} ${y}`,
    `M ${x2} ${y} L ${x2 - q} ${y - depth} L ${mid + 4} ${y}`,
    `M ${mid - 4} ${y} L ${mid} ${y - depth * 0.55} L ${mid + 4} ${y}`,
  ].join(' ')
}

/**
 * Single swing door on vertical wall (hinge left, swings into +x room).
 * @param {{ x: number, y1: number, y2: number, radius?: number }} opts
 */
export function swingVerticalRight(opts) {
  const { x, y1, y2, radius = 36 } = opts
  const mid = (y1 + y2) / 2
  return `M ${x} ${y1} L ${x} ${y2} A ${radius} ${radius} 0 0 0 ${x + radius} ${mid} Z`
}

/**
 * Single swing door on vertical wall (hinge right, swings into -x room).
 * @param {{ x: number, y1: number, y2: number, radius?: number }} opts
 */
export function swingVerticalLeft(opts) {
  const { x, y1, y2, radius = 32 } = opts
  const mid = (y1 + y2) / 2
  return `M ${x} ${y1} L ${x} ${y2} A ${radius} ${radius} 0 0 1 ${x - radius} ${mid} Z`
}

/**
 * Entry door on bottom horizontal wall — swings inward (up).
 * @param {{ x1: number, x2: number, y: number, radius?: number }} opts
 */
export function swingHorizontalUp(opts) {
  const { x1, x2, y, radius = 40 } = opts
  return `M ${x1} ${y} L ${x2} ${y} A ${radius} ${radius} 0 0 1 ${x1} ${y - radius} Z`
}

/** Sliding / patio door — line across opening */
export function slidingHorizontal(opts) {
  const { x1, x2, y } = opts
  return `M ${x1} ${y} L ${x2} ${y}`
}
