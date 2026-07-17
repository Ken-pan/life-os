/**
 * 开合/出口冲突检测(评审 B7)。纯函数,无 IO。
 *
 * 为什么不塞进 circulation.js:抽屉打不开、柜门开不了是**局部麻烦**,不是主通道断裂。
 * 把它们 stamp 进动线栅格,会把「暂时被推车挡住的抽屉」误报成「这个区走不进去」。
 * 所以 access/egress 包络的冲突在这里单独算、单独报;circulation 只管真正的可通行路径。
 *
 * egress(门/出口/上下床)是硬的:被挡=安全事故,severity 恒 high。
 * access(抽屉/柜门/电器门)按侵入深度定 severity。
 *
 * i18n:只吐 reasonCode/severity,不吐中文。
 */

import { PX_PER_IN } from './dimensions.js'
import { boxesOverlap } from './geometry.js'
import { accessEnvelopeRects, egressEnvelopeRects } from './envelopes.js'

/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').Rect} Rect */

/** 两个盒子的侵入深度(英寸)= 较小的那个重叠边。不重叠为 0。 */
function overlapDepthIn(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return Math.max(0, Math.min(ox, oy)) / PX_PER_IN
}

/**
 * 全屋开合/出口冲突。actor 的包络被别的家具/固定设施侵入即记一条。
 * @param {SpatialProject} project
 * @returns {Array<{ actorId: string, actorLabel: string, blockedById: string, blockedByLabel: string, envelopeType: 'access'|'egress', overlapDepthIn: number, severity: 'high'|'medium', reasonCode: string }>}
 */
export function analyzeAccessConflicts(project) {
  const placements = (project?.placements ?? []).filter((p) => !p.attrs?.staged)
  const obstacles = [
    ...placements.map((p) => ({ id: p.id, label: p.label, box: { x: p.x, y: p.y, w: p.w, h: p.h } })),
    ...(project?.fixtures ?? [])
      .filter((f) => f.bounds)
      .map((f) => ({ id: f.id, label: f.label, box: f.bounds })),
  ]

  const out = []
  for (const actor of placements) {
    const envs = [
      ...egressEnvelopeRects(actor).map((e) => ({ e, envelopeType: /** @type {const} */ ('egress') })),
      ...accessEnvelopeRects(actor).map((e) => ({ e, envelopeType: /** @type {const} */ ('access') })),
    ]
    for (const { e, envelopeType } of envs) {
      for (const ob of obstacles) {
        if (ob.id === actor.id) continue
        if (!boxesOverlap(e, ob.box)) continue
        const depth = overlapDepthIn(e, ob.box)
        const severity = envelopeType === 'egress' ? 'high' : depth >= 6 ? 'high' : 'medium'
        out.push({
          actorId: actor.id,
          actorLabel: actor.label,
          blockedById: ob.id,
          blockedByLabel: ob.label,
          envelopeType,
          overlapDepthIn: Math.round(depth * 10) / 10,
          severity,
          reasonCode: envelopeType === 'egress' ? 'EGRESS_BLOCKED' : 'ACCESS_BLOCKED',
        })
      }
    }
  }
  // egress/high 排前,再按侵入深度
  const rank = (c) => (c.envelopeType === 'egress' ? 0 : c.severity === 'high' ? 1 : 2)
  out.sort((a, b) => rank(a) - rank(b) || b.overlapDepthIn - a.overlapDepthIn)
  return out
}
