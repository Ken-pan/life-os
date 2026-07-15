/** @typedef {import('./types.js').SpatialViewpoint} SpatialViewpoint */
/** @typedef {import('./types.js').SpatialZone} SpatialZone */

import { findZoneAtPoint } from './zones.js'

/** 默认视锥张角 —— 手机主摄 ~26mm 等效，水平 FOV≈69°。 */
export const DEFAULT_FOV_DEG = 69

/** 视锥长度（英尺）——够跨过一个房间，又不至于糊满整张图。 */
export const CONE_LEN_FT = 8

export const MIN_FOV_DEG = 20
export const MAX_FOV_DEG = 170

let viewpointSeq = 1

/** @param {SpatialViewpoint[]} existing */
export function syncViewpointIdSeq(existing) {
  for (const v of existing) {
    const m = /^vp-(\d+)$/.exec(v.id)
    if (m) viewpointSeq = Math.max(viewpointSeq, Number(m[1]) + 1)
  }
}

/** @returns {string} */
export function createViewpointId() {
  return `vp-${viewpointSeq++}`
}

/** 角度归一到 [0,360)。 */
export function normalizeHeading(deg) {
  return ((deg % 360) + 360) % 360
}

/** @param {number} deg */
export function clampFov(deg) {
  return Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, deg))
}

/**
 * @param {number} x
 * @param {number} y
 * @param {SpatialZone[]} zones
 * @param {SpatialViewpoint[]} existing
 * @returns {SpatialViewpoint}
 */
export function createViewpoint(x, y, zones, existing) {
  syncViewpointIdSeq(existing)
  const zone = findZoneAtPoint(zones, { x, y })
  return {
    id: createViewpointId(),
    x,
    y,
    heading: 0,
    fovDeg: DEFAULT_FOV_DEG,
    zoneId: zone?.id,
    label: `视角 ${existing.length + 1}`,
  }
}

/**
 * heading 0° = 正上（平面图北向），顺时针为正。
 * SVG 里 y 轴向下，所以方向向量是 (sin a, -cos a)。
 * @param {number} deg
 * @returns {{ dx: number, dy: number }}
 */
export function headingVector(deg) {
  const r = (deg * Math.PI) / 180
  return { dx: Math.sin(r), dy: -Math.cos(r) }
}

/** 从中心指向 pt 的角度（0=上，顺时针）。 */
export function headingFromPoint(cx, cy, px, py) {
  const deg = (Math.atan2(px - cx, cy - py) * 180) / Math.PI
  return normalizeHeading(deg)
}

/**
 * 视锥扇形 path。
 * @param {SpatialViewpoint} vp
 * @param {number} pxPerFt
 * @returns {string}
 */
export function viewpointConePath(vp, pxPerFt) {
  const r = CONE_LEN_FT * pxPerFt
  const fov = clampFov(vp.fovDeg ?? DEFAULT_FOV_DEG)
  const a1 = headingVector(vp.heading - fov / 2)
  const a2 = headingVector(vp.heading + fov / 2)
  const x1 = vp.x + a1.dx * r
  const y1 = vp.y + a1.dy * r
  const x2 = vp.x + a2.dx * r
  const y2 = vp.y + a2.dy * r
  const largeArc = fov > 180 ? 1 : 0
  return `M ${round(vp.x)} ${round(vp.y)} L ${round(x1)} ${round(y1)} A ${round(r)} ${round(r)} 0 ${largeArc} 1 ${round(x2)} ${round(y2)} Z`
}

/**
 * 旋转手柄在视锥中轴上的落点。
 * @param {SpatialViewpoint} vp
 * @param {number} pxPerFt
 */
export function viewpointHandlePoint(vp, pxPerFt) {
  const r = CONE_LEN_FT * pxPerFt * 0.72
  const v = headingVector(vp.heading)
  return { x: vp.x + v.dx * r, y: vp.y + v.dy * r }
}

function round(n) {
  return Math.round(n * 100) / 100
}
