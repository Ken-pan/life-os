/**
 * 2D 几何原语 —— 全库唯一权威实现。
 *
 * 此前 pointInPolygon 在 circulation/zones 各有一份、点到线段与
 * 点到矩形距离散落三处:算法一样、守卫和命名各异,改一处漏一处。
 * 消费方仍可从原模块导入(它们 re-export 这里),新代码请直接 import 本模块。
 *
 * 纯函数,无单位假设(px/米皆可,调用方自洽即可)。
 */

/** @typedef {{ x: number, y: number }} Pt */

/**
 * 射线法点在多边形内(边上算内;空/退化多边形 false)。
 * @param {Pt} p
 * @param {Pt[]} poly
 */
export function pointInPolygon(p, poly) {
  if (!poly || poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/**
 * 点到线段的最短距离。
 * @param {Pt} p
 * @param {Pt} a
 * @param {Pt} b
 */
export function distToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * 点到轴对齐矩形的最短距离(点在矩形内为 0)。
 * @param {number} px
 * @param {number} py
 * @param {{ x: number, y: number, w: number, h: number }} r
 */
export function pointToRectDistance(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w))
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h))
  return Math.hypot(dx, dy)
}

/**
 * 两个轴对齐矩形是否重叠(贴边不算)。
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 */
export function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
