/**
 * 动态占用包络(规范 §2.6, §3.2–3.4, 评审 B7)。纯函数,无 IO。
 *
 * 一件家具不止占它的静态脚印,还占它**被使用时**扫过的空间。评审要求拆**三类**,
 * 因为它们不是同一种「阻塞」,求解方式也不同:
 * - **egress**(门/出口/逃生/上下床):**硬约束** —— 挡住就是安全事故。
 * - **access**(抽屉拉出、柜门开合、电器门):**冲突检测** —— 打不开是麻烦,不是通道断裂,
 *   交 access-conflicts.js 单独报,不塞进 circulation 栅格。
 * - **comfort**(椅子旋转+滚动、操作余量):**软惩罚** —— 挤一点能用,布局求解据此排序。
 *
 * 几何:placements 的 x/y/w/h 已是 rotation 调整后的 AABB(见 circulation.js)。包络
 * 从「正面」那条边伸出,正面方向随 rotation 转;深度可被 attrs.clearanceIn 实测覆写
 * (实测优先,与 storage/solver 同一条精度规则)。
 *
 * i18n:不吐中文;消费方按 type/kind 出文案。
 */

import { PX_PER_IN } from './dimensions.js'
import { canonicalPlacementKind } from './placements.js'

/** @typedef {import('./types.js').SpatialPlacement} SpatialPlacement */
/** @typedef {import('./types.js').Rect} Rect */
/** @typedef {'egress' | 'access' | 'comfort'} EnvelopeType */

/**
 * 每类家具的包络规格。shape:
 * - `front`:从正面伸出 depthIn 的矩形(抽屉拉出、上下床、坐进区)。
 * - `swing`:柜门/电器门开合,近似为正面 depthIn 深的矩形(四分之一弧的保守外接)。
 * - `around`:四周 marginIn(椅子旋转+滚动)。
 * @type {Record<string, { type: EnvelopeType, shape: 'front'|'swing'|'around', depthIn?: number, marginIn?: number }>}
 */
export const ENVELOPE_SPECS = {
  // —— access:抽屉/柜门/电器门 ——
  dresser: { type: 'access', shape: 'front', depthIn: 24 },
  nightstand: { type: 'access', shape: 'front', depthIn: 18 },
  base_cabinet: { type: 'access', shape: 'front', depthIn: 24 },
  cabinet: { type: 'access', shape: 'swing', depthIn: 24 },
  wall_cabinet: { type: 'access', shape: 'swing', depthIn: 15 },
  wardrobe: { type: 'access', shape: 'swing', depthIn: 24 },
  shoe_cabinet: { type: 'access', shape: 'swing', depthIn: 18 },
  fridge: { type: 'access', shape: 'swing', depthIn: 30 },
  dishwasher: { type: 'access', shape: 'front', depthIn: 22 },
  oven: { type: 'access', shape: 'front', depthIn: 22 },
  washer: { type: 'access', shape: 'swing', depthIn: 24 },
  dryer: { type: 'access', shape: 'swing', depthIn: 24 },
  toilet: { type: 'access', shape: 'front', depthIn: 21 },
  // —— comfort:椅子/操作余量 ——
  office_chair: { type: 'comfort', shape: 'around', marginIn: 18 },
  chair: { type: 'comfort', shape: 'front', depthIn: 18 },
  desk: { type: 'comfort', shape: 'front', depthIn: 30 },
  standing_desk: { type: 'comfort', shape: 'front', depthIn: 30 },
  // —— egress:上下床 ——
  bed: { type: 'egress', shape: 'front', depthIn: 24 },
  bed_twin: { type: 'egress', shape: 'front', depthIn: 24 },
  bed_full: { type: 'egress', shape: 'front', depthIn: 24 },
  bed_queen: { type: 'egress', shape: 'front', depthIn: 24 },
  bed_king: { type: 'egress', shape: 'front', depthIn: 24 },
}

/**
 * 正面方向(单位向量)。约定:rotation 0 → 正面朝下(+y),顺时针旋转。
 * @param {number} rotation
 * @returns {{ dx: -1|0|1, dy: -1|0|1 }}
 */
function frontVec(rotation) {
  switch (((Math.round(rotation / 90) * 90) % 360 + 360) % 360) {
    case 90: return { dx: -1, dy: 0 }
    case 180: return { dx: 0, dy: -1 }
    case 270: return { dx: 1, dy: 0 }
    default: return { dx: 0, dy: 1 } // 0
  }
}

/**
 * 从正面伸出 depthPx 的矩形(px)。
 * @param {SpatialPlacement} pl
 * @param {number} depthPx
 * @returns {Rect}
 */
function frontRect(pl, depthPx) {
  const v = frontVec(pl.rotation ?? 0)
  if (v.dy === 1) return { x: pl.x, y: pl.y + pl.h, w: pl.w, h: depthPx }
  if (v.dy === -1) return { x: pl.x, y: pl.y - depthPx, w: pl.w, h: depthPx }
  if (v.dx === 1) return { x: pl.x + pl.w, y: pl.y, w: depthPx, h: pl.h }
  return { x: pl.x - depthPx, y: pl.y, w: depthPx, h: pl.h } // left
}

/** 四周外扩 marginPx 的矩形(px)—— 椅子旋转+滚动。 */
function aroundRect(pl, marginPx) {
  return { x: pl.x - marginPx, y: pl.y - marginPx, w: pl.w + 2 * marginPx, h: pl.h + 2 * marginPx }
}

/**
 * 一件家具的**全部**包络(带 type/kind 标签)。空数组 = 这类家具没有动态包络。
 * @param {SpatialPlacement} pl
 * @returns {Array<Rect & { type: EnvelopeType, kind: string, id: string }>}
 */
export function envelopeRects(pl) {
  if (!pl) return []
  const kind = canonicalPlacementKind(pl.kind ?? '')
  const spec = ENVELOPE_SPECS[kind]
  if (!spec) return []
  // 实测净空覆写深度/余量(实测优先)。
  const overrideIn = pl.attrs?.clearanceIn
  if (spec.shape === 'around') {
    const marginPx = (overrideIn ?? spec.marginIn ?? 18) * PX_PER_IN
    return [{ ...aroundRect(pl, marginPx), type: spec.type, kind, id: pl.id }]
  }
  const depthPx = (overrideIn ?? spec.depthIn ?? 24) * PX_PER_IN
  return [{ ...frontRect(pl, depthPx), type: spec.type, kind, id: pl.id }]
}

const ofType = (pl, type) => envelopeRects(pl).filter((r) => r.type === type)

/** egress 包络(硬约束):门/出口/上下床。 */
export const egressEnvelopeRects = (pl) => ofType(pl, 'egress')
/** access 包络(冲突检测):抽屉/柜门/电器门。 */
export const accessEnvelopeRects = (pl) => ofType(pl, 'access')
/** comfort 包络(软惩罚):椅子旋转/操作余量。 */
export const comfortEnvelopeRects = (pl) => ofType(pl, 'comfort')
