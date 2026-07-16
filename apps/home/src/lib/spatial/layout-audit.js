/**
 * 布局方案独立复检器 —— 求解器输出的**最终状态**在这里过第二双眼睛。
 *
 * 为什么不是复用 solver 的检查:退火在搜索路径上逐步维护约束(增量碰撞、
 * 伴随对回滚),复检的价值恰恰在于与搜索路径无关 —— 只看「交付的这套摆法」
 * 本身合不合法。这里的碰撞/出区/锁定检查全部独立实现,只共享几何原语
 * (pointInPolygon)和动线引擎(analyzeCirculation,它对同输入是确定性的)。
 *
 * 「不比现状差」哲学(与 solver 硬门槛同一标准):现状可能带着扫描噪声造成的
 * 既有违规(两件家具微微相交)。复检只否决**新增**的违规 —— 把既有噪声算在
 * 方案头上,等于任何方案都发不出去。
 *
 * 纯函数、无 IO,node 单测直接跑。
 */
import { analyzeCirculation, pointInPolygon, roomsAsZones } from './circulation.js'

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

/** 踩得过去的不算障碍(与动线/求解口径一致) */
const WALKABLE_KINDS = new Set(['rug', 'yoga_mat', 'mat'])

/** 相切不算重叠:留 0.5px(约 4mm)容差,吸附贴齐的家具不冤枉 */
const OVERLAP_EPS = 0.5

function isSolid(pl) {
  return !WALKABLE_KINDS.has(pl.kind) && !pl.attrs?.staged
}

function rectsOverlap(a, b) {
  return (
    a.x + OVERLAP_EPS < b.x + b.w &&
    a.x + a.w > b.x + OVERLAP_EPS &&
    a.y + OVERLAP_EPS < b.y + b.h &&
    a.y + a.h > b.y + OVERLAP_EPS
  )
}

/** 全部两两重叠对(家具×家具 + 家具×固定设施),返回规整的 pair key 集合 */
function overlapPairs(placements, fixtures) {
  const out = new Set()
  const solid = placements.filter(isSolid)
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (rectsOverlap(solid[i], solid[j])) {
        out.add([solid[i].id, solid[j].id].sort().join('+'))
      }
    }
    for (const fx of fixtures) {
      if (fx.bounds && rectsOverlap(solid[i], fx.bounds)) {
        out.add(`${solid[i].id}+fx:${fx.id}`)
      }
    }
  }
  return out
}

/** 盒子整个在多边形内(四角 + 中心,缩 1px 容忍贴边)—— 与 solver 同判据、独立实现 */
function boxInPolygon(box, poly) {
  const pad = 1
  const pts = [
    { x: box.x + pad, y: box.y + pad },
    { x: box.x + box.w - pad, y: box.y + pad },
    { x: box.x + pad, y: box.y + box.h - pad },
    { x: box.x + box.w - pad, y: box.y + box.h - pad },
    { x: box.x + box.w / 2, y: box.y + box.h / 2 },
  ]
  return pts.every((p) => pointInPolygon(p, poly))
}

/**
 * 复检一套方案。
 * @param {SpatialProject} before 现状(hydrate 过)
 * @param {SpatialProject} after 方案(同一 project,placements 换成方案摆法)
 * @param {{ base?: any }} [opts] 可传 buildCirculationBase 的底图复用
 * @returns {{ ok: boolean, violations: Array<{ code: string, zh: string }> }}
 */
export function auditLayout(before, after, opts = {}) {
  /** @type {Array<{ code: string, zh: string }>} */
  const violations = []
  const beforeById = new Map((before.placements ?? []).map((p) => [p.id, p]))
  const afterPlacements = after.placements ?? []

  // 0) 清单一致:方案不许静默丢件/加件(三层静默丢家具的坑踩过)
  if (afterPlacements.length !== (before.placements ?? []).length) {
    violations.push({ code: 'inventory_changed', zh: '方案改变了家具数量' })
  }
  for (const pl of afterPlacements) {
    if (!beforeById.has(pl.id)) {
      violations.push({ code: 'inventory_changed', zh: `方案凭空多出「${pl.label}」` })
    }
  }

  // 1) 锁定件/钉死件一寸不许动
  for (const pl of afterPlacements) {
    const prev = beforeById.get(pl.id)
    if (!prev) continue
    const moved =
      Math.abs(pl.x - prev.x) > 0.5 ||
      Math.abs(pl.y - prev.y) > 0.5 ||
      (pl.rotation ?? 0) !== (prev.rotation ?? 0)
    if (!moved) continue
    if (prev.fixed) violations.push({ code: 'fixed_moved', zh: `钉死件「${pl.label}」被挪动` })
    if (prev.locked) violations.push({ code: 'locked_moved', zh: `锁定件「${pl.label}」被挪动` })
  }

  // 2) 新增重叠(既有的扫描噪声重叠不算方案的账)
  const fixtures = before.fixtures ?? []
  const beforePairs = overlapPairs(before.placements ?? [], fixtures)
  for (const key of overlapPairs(afterPlacements, fixtures)) {
    if (!beforePairs.has(key)) {
      violations.push({ code: 'overlap_new', zh: `方案产生了新的家具重叠(${key})` })
    }
  }

  // 3) 挪过的家具必须整个落在自己的分区里
  const zones = after.zones?.length ? after.zones : roomsAsZones(after)
  for (const pl of afterPlacements) {
    const prev = beforeById.get(pl.id)
    if (!prev || (Math.abs(pl.x - prev.x) <= 0.5 && Math.abs(pl.y - prev.y) <= 0.5)) continue
    const zone =
      zones.find((z) => z.id === pl.zoneId) ??
      zones.find((z) => pointInPolygon({ x: pl.x + pl.w / 2, y: pl.y + pl.h / 2 }, z.polygon))
    if (!zone || !boxInPolygon(pl, zone.polygon)) {
      violations.push({ code: 'zone_escape', zh: `「${pl.label}」被挪出了自己的分区` })
    }
  }

  // 4) 动线不许比现状差(堵门/孤岛不得增加、最窄通道不得更窄)
  const circBefore = analyzeCirculation(before, opts.base ? { base: opts.base } : undefined)
  const circAfter = analyzeCirculation(after, opts.base ? { base: opts.base } : undefined)
  if (circBefore.ok && circAfter.ok) {
    if (circAfter.blockedDoors.length > circBefore.blockedDoors.length) {
      violations.push({ code: 'circulation_worse', zh: '方案新增了被堵的门' })
    }
    if (circAfter.isolatedZones.length > circBefore.isolatedZones.length) {
      violations.push({ code: 'circulation_worse', zh: '方案让某个区域走不进去了' })
    }
    const widthOf = (c) =>
      c.bottlenecks.length ? Math.min(...c.bottlenecks.map((b) => b.widthIn)) : Infinity
    if (widthOf(circAfter) < widthOf(circBefore) - 1e-6) {
      violations.push({ code: 'circulation_worse', zh: '方案把全屋最窄通道变得更窄' })
    }
  }

  return { ok: violations.length === 0, violations }
}
