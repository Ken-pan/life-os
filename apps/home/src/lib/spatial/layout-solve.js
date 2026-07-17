/**
 * 约束驱动的布局求解器(能力14)—— 「现有家具怎么摆更好」,不是让模型编坐标:
 * 几何引擎(circulation.js)算动线/堵门/利用率,这里在其上做**确定性退火搜索**
 * (注入种子的 LCG,同输入同输出,node 单测直接跑),输出至多三套方案:
 *
 * - min_effort 最少折腾:只为解决问题(堵门/瓶颈)而动,搬动量重罚
 * - best_flow  最佳动线:主通道尽量宽、紧张通道尽量少
 * - max_storage 最大收纳:腾出整段可放柜子的贴墙空间,动线不许变差
 *
 * 硬约束(违反即弃):家具不出自己的分区、不与其他家具/固定设施重叠、
 * 堵门数/孤岛区不得多于现状、全屋最窄通道不得比现状更窄、固定设施
 * 与地毯/宠物不参与移动。用户锁定件(placement.locked)同样不动 ——
 * 锁定后重跑即「围绕锁定件局部重算」:锁定件仍是碰撞/净空/配对的一等公民,
 * 只是从可移动集合里退场。
 *
 * 每步候选都跑一次完整 analyzeCirculation(6in 栅格,毫秒级),分数是真几何,
 * 不是启发式近似 —— 这正是「LLM 解释,几何引擎裁决」的架构分工。
 */
import {
  analyzeCirculation,
  buildCirculationBase,
  CLEARANCE,
  pointInPolygon,
  roomsAsZones,
} from './circulation.js'
import { auditLayout } from './layout-audit.js'
import { computeTaskRoutes } from './task-routes.js'
import { assessRelationReadiness } from './plan-readiness.js'
import { isFence, placementSpec } from './placements.js'
import { wallAnchorSegments } from './wall-anchor.js'
import { PX_PER_FT, PX_PER_IN } from './dimensions.js'
import { boxesOverlap, pointToRectDistance } from './geometry.js'

/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').SpatialPlacement} SpatialPlacement */


export const LAYOUT_PROFILES = [
  {
    key: 'min_effort',
    nameZh: '最少折腾',
    desc: '只为解决堵门和瓶颈而动,能不搬就不搬',
  },
  {
    key: 'best_flow',
    nameZh: '最佳动线',
    desc: '主通道尽量宽,少侧身、少绕路',
  },
  {
    key: 'max_storage',
    nameZh: '最大收纳',
    desc: '腾出整段贴墙空间(给未来的柜/架),动线不变差',
  },
]

/** 这些不参与移动:钉死的(公寓自带)、用户锁定的、踩得过去的、有腿的(狗),以及非落地件 */
function isMovable(pl) {
  if (!pl || pl.fixed || pl.locked) return false
  if (pl.kind === 'rug' || pl.kind === 'yoga_mat' || pl.kind === 'mat') return false
  if (String(pl.kind).startsWith('dog')) return false
  // 围栏是圈狗的边界,不是一件摆得更好的家具:狗不参与移动,单独把围栏
  // 搬走等于把狗放出来。人挪围栏是连狗带窝整体挪 —— 求解器做不到,就别动
  if (isFence(pl.kind)) return false
  const spec = placementSpec(pl.kind)
  return (spec?.mount ?? 'floor') === 'floor'
}

// ---- 摆放逻辑:很多家具的位置不是独立的 ----

/**
 * 伴随对:a 类家具功能上属于 b 类(同分区内按「谁离谁最近」认对)。
 * gapIn = [最近, 最远] 边到边英寸;超出范围按超出量罚分(每对封顶,
 * 免得一对烂账淹没全局)。电视有下限 —— 贴脸看不是「近」是错。
 */
const COMPANION_RULES = [
  { a: ['nightstand'], b: ['bed', 'bed_twin', 'bed_full', 'bed_king'], gapIn: [0, 8], zh: '床头柜跟床' },
  { a: ['office_chair'], b: ['desk', 'standing_desk'], gapIn: [0, 12], zh: '办公椅跟桌' },
  { a: ['chair'], b: ['table', 'folding_table'], gapIn: [0, 12], zh: '餐椅跟餐桌' },
  { a: ['coffee_table'], b: ['sofa', 'loveseat'], gapIn: [8, 36], zh: '茶几在沙发前' },
  { a: ['tv'], b: ['sofa', 'loveseat', 'armchair'], gapIn: [54, 160], zh: '电视与沙发观看距离' },
  { a: ['floor_lamp'], b: ['sofa', 'loveseat', 'armchair', 'bed', 'desk'], gapIn: [0, 24], zh: '落地灯在座位旁' },
  { a: ['laundry_basket'], b: ['washer', 'dryer'], gapIn: [0, 48], zh: '洗衣篮在洗衣机旁' },
]

/** 每对罚分封顶(英寸):一对再烂也不该盖过一个真瓶颈 */
const PAIR_PENALTY_CAP = 60

/** 背靠墙才像话的家具:漂在房间中央按离墙距离罚分 */
const WALL_HUGGERS = new Set([
  'bed', 'bed_twin', 'bed_full', 'bed_king',
  'sofa', 'loveseat', 'dresser', 'wardrobe',
  'cabinet', 'shelf', 'bookshelf', 'cube_shelf', 'wire_rack', 'shoe_cabinet',
  'tv', 'desk', 'standing_desk', 'coat_rack', 'floor_mirror',
])

/** 离墙超过它(英寸)才开始罚 —— 贴墙留缝走线是正常的 */
const WALL_GAP_FREE_IN = 6
/** 离墙罚分封顶(英寸) */
const WALL_PENALTY_CAP = 36

/** 两个盒子的边到边间距(英寸;重叠/相邻为 0) */
export function boxGapIn(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)))
  return Math.hypot(dx, dy) / PX_PER_IN
}

/**
 * 盒子到最近「正对墙」的间距(英寸):只认与盒子某边平行且跨度搭上
 * ≥2ft(或整边)的墙段 —— 斜对着房间另一头的墙不算「靠」。
 * 找不到返回 Infinity。
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {ReturnType<typeof wallAnchorSegments>} segs
 */
export function minWallGapIn(box, segs) {
  let best = Infinity
  for (const seg of segs) {
    const spanLo = seg.vertical ? box.y : box.x
    const spanHi = seg.vertical ? box.y + box.h : box.x + box.w
    const overlap = Math.min(spanHi, seg.hi) - Math.max(spanLo, seg.lo)
    if (overlap < Math.min(spanHi - spanLo, 24 * PX_PER_IN)) continue
    const lo = seg.vertical ? box.x : box.y
    const hi = seg.vertical ? box.x + box.w : box.y + box.h
    const gap = Math.min(Math.abs(lo - seg.at), Math.abs(seg.at - hi))
    best = Math.min(best, gap)
  }
  return best / PX_PER_IN
}

// ---- 专业设计规范(NKBA 类住宅标准,全部几何可算) ----

/** 床的下床空间:至少两侧留出这么宽(英寸)才睡得像样 */
const BED_SIDE_IN = 20
/** 高家具(英寸):贴墙压住窗户跨度会挡采光 */
const TALL_IN = 40
/** 视线遮挡判定:这么高的家具会挡住坐姿视线(电视↔沙发) */
const SIGHT_BLOCK_IN = 30

/** 门窗在墙上的跨度段(wallGraph 户型;508 返回空 —— 罚分自然为 0) */
export function openingSegments(project) {
  const graph = project.wallGraph
  /** @type {Array<{ vertical: boolean, at: number, lo: number, hi: number, cx: number, cy: number, spanIn: number, type: string, style?: string }>} */
  const out = []
  if (!graph || !project.graphOpenings?.length) return out
  const vById = Object.fromEntries(graph.vertices.map((v) => [v.id, v]))
  for (const op of project.graphOpenings) {
    if (op.hidden) continue
    const edge = graph.edges.find((e) => e.id === op.edgeId)
    const a = edge && vById[edge.a]
    const b = edge && vById[edge.b]
    if (!a || !b) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (!len) continue
    const t0 = (op.offsetIn * PX_PER_IN) / len
    const t1 = ((op.offsetIn + op.spanIn) * PX_PER_IN) / len
    const p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 }
    const p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 }
    const vertical = Math.abs(a.x - b.x) < 1.5
    out.push({
      vertical,
      at: vertical ? a.x : a.y,
      lo: vertical ? Math.min(p0.y, p1.y) : Math.min(p0.x, p1.x),
      hi: vertical ? Math.max(p0.y, p1.y) : Math.max(p0.x, p1.x),
      cx: (p0.x + p1.x) / 2,
      cy: (p0.y + p1.y) / 2,
      spanIn: op.spanIn,
      type: op.type,
      style: op.style,
    })
  }
  return out
}

/**
 * 线段是否穿过轴对齐矩形。视线判定用 —— 沿线每 ~6in 采样一个点判在盒内,
 * 比精确相交数学稳(不怕恰好擦角的退化),精度对「挡不挡视线」绰绰有余。
 */
export function segIntersectsBox(x1, y1, x2, y2, b) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const steps = Math.max(2, Math.ceil(len / (6 * PX_PER_IN)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x1 + (x2 - x1) * t
    const y = y1 + (y2 - y1) * t
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true
  }
  return false
}

/**
 * 盒子某一侧的可用净深(英寸):沿该侧外法向,到最近障碍(家具/墙)的距离。
 * 只算横向搭上 ≥6in 的障碍 —— 斜对面的东西不挡这一侧的使用。
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {'n'|'s'|'e'|'w'} side
 * @param {Array<{x:number,y:number,w:number,h:number}>} obstacles
 * @param {ReturnType<typeof wallAnchorSegments>} segs
 */
export function sideFreeDepthIn(box, side, obstacles, segs) {
  const horiz = side === 'e' || side === 'w'
  const crossLo = horiz ? box.y : box.x
  const crossHi = horiz ? box.y + box.h : box.x + box.w
  const face =
    side === 'n' ? box.y : side === 's' ? box.y + box.h : side === 'w' ? box.x : box.x + box.w
  const sign = side === 'n' || side === 'w' ? -1 : 1
  let free = 96 * PX_PER_IN // 8ft 封顶,再远没意义

  for (const ob of obstacles) {
    const oLo = horiz ? ob.y : ob.x
    const oHi = horiz ? ob.y + ob.h : ob.x + ob.w
    if (Math.min(crossHi, oHi) - Math.max(crossLo, oLo) < 6 * PX_PER_IN) continue
    const near = sign > 0 ? (horiz ? ob.x : ob.y) : (horiz ? ob.x + ob.w : ob.y + ob.h)
    const gap = sign * (near - face)
    if (gap >= -1 && gap < free) free = gap
  }
  for (const seg of segs) {
    // 挡住这一侧的是**法向垂直**的墙:侧向(e/w)被竖墙挡,纵向(n/s)被横墙挡
    if (seg.vertical !== horiz) continue
    if (Math.min(crossHi, seg.hi) - Math.max(crossLo, seg.lo) < 6 * PX_PER_IN) continue
    const gap = sign * (seg.at - face)
    if (gap >= -1 && gap < free) free = gap
  }
  return Math.max(0, free) / PX_PER_IN
}

/**
 * 认对:每件 a 类在**同分区**里找最近的 b 类(当前布局定义「谁属于谁」——
 * 你的椅子跟你的桌子,不是跟别人家的)。b 可以是钉死件(洗衣机):
 * 罚分会把 a 拉回去,b 反正不动。
 * @param {SpatialPlacement[]} placements
 * @param {any[]} zones
 * @returns {Array<{ aId: string, bId: string, gapIn: [number, number], zh: string }>}
 */
export function detectPairs(placements, zones) {
  const out = []
  const zoneIdOf = (pl) => zoneOfPlacement(pl, zones)?.id ?? null
  for (const rule of COMPANION_RULES) {
    for (const a of placements) {
      if (!rule.a.includes(a.kind)) continue
      const az = zoneIdOf(a)
      if (!az) continue
      let best = null
      let bestD = Infinity
      for (const b of placements) {
        if (b === a || !rule.b.includes(b.kind)) continue
        if (zoneIdOf(b) !== az) continue
        const d = Math.hypot(
          a.x + a.w / 2 - (b.x + b.w / 2),
          a.y + a.h / 2 - (b.y + b.h / 2),
        )
        if (d < bestD) {
          bestD = d
          best = b
        }
      }
      if (best) out.push({ aId: a.id, bId: best.id, gapIn: rule.gapIn, zh: rule.zh })
    }
  }
  return out
}

/**
 * 一个布局的「摆放逻辑」总罚分(英寸计,越低越合理):
 * 伴随对超出理想间距的量 + 该贴墙的家具离墙的量。
 * @param {Map<string, {x:number,y:number,w:number,h:number}>} boxById
 * @param {ReturnType<typeof detectPairs>} pairs
 * @param {ReturnType<typeof wallAnchorSegments>} segs
 * @param {Array<{ id: string, kind: string }>} huggers 该贴墙的家具(id+kind 预筛)
 */
export function affinityPenaltyIn(boxById, pairs, segs, huggers) {
  let total = 0
  for (const pair of pairs) {
    const a = boxById.get(pair.aId)
    const b = boxById.get(pair.bId)
    if (!a || !b) continue
    const g = boxGapIn(a, b)
    let p = 0
    if (g > pair.gapIn[1]) p = g - pair.gapIn[1]
    else if (g < pair.gapIn[0]) p = pair.gapIn[0] - g
    total += Math.min(p, PAIR_PENALTY_CAP)
  }
  if (segs.length) {
    for (const h of huggers) {
      const box = boxById.get(h.id)
      if (!box) continue
      const gap = minWallGapIn(box, segs)
      const p = gap === Infinity ? WALL_PENALTY_CAP : Math.max(0, gap - WALL_GAP_FREE_IN)
      total += Math.min(p, WALL_PENALTY_CAP)
    }
  }
  return total
}

/**
 * 一次求解的设计上下文:认对/贴墙/净空需求/门窗段/视线对/静态障碍,
 * 全部只算一次,每次评估复用。
 *
 * 关系不只来自 COMPANION_RULES 词表:每件家具可以带用户指定的
 * `relations`(near/far_from + 目标件 + 间距),与自动认对同权重进罚分 ——
 * 「宠物粮靠近围栏」「鸟笼远离床」这类家规,词表猜不出来,只能用户说。
 */
export function buildDesignContext(project, placements, zones) {
  const segs = wallAnchorSegments(project.wallGraph)
  const pairs = detectPairs(placements, zones)
  const huggers = placements
    .filter((pl) => WALL_HUGGERS.has(pl.kind) && !pl.fixed)
    .map((pl) => ({ id: pl.id, kind: pl.kind }))

  // 用户指定关系:near 并进 pairs(同一套间距罚分);far_from 单独一张表
  /** @type {Array<{ aId: string, bId: string, minGapIn: number, zh: string }>} */
  const farPairs = []
  const idSet = new Set(placements.map((p) => p.id))
  for (const pl of placements) {
    for (const rel of pl.relations ?? []) {
      if (!idSet.has(rel.targetId)) continue // 目标件被删了:关系静默失效,不报错
      const zh = rel.zh ?? `「${pl.label}」与目标`
      if (rel.type === 'near') {
        pairs.push({ aId: pl.id, bId: rel.targetId, gapIn: rel.gapIn ?? [0, 24], zh })
      } else if (rel.type === 'far_from') {
        farPairs.push({ aId: pl.id, bId: rel.targetId, minGapIn: rel.gapIn?.[0] ?? 72, zh })
      }
    }
  }

  // 使用净空需求:词表标了 clearance 的(柜/桌前留操作深度)+ 床(下床空间)。
  // 每件可用 attrs.clearanceIn 覆写词表 —— 实测过「这台洗衣机门要 26in」就以实测为准
  const access = []
  for (const pl of placements) {
    if (pl.kind === 'rug' || pl.kind === 'yoga_mat' || pl.kind === 'mat') continue
    const spec = placementSpec(pl.kind)
    if ((spec?.mount ?? 'floor') !== 'floor') continue
    const isBed = String(pl.kind).startsWith('bed')
    const clearance = pl.attrs?.clearanceIn ?? spec?.clearance ?? 0
    if (clearance > 0 || isBed) access.push({ id: pl.id, clearance, isBed })
  }

  const openings = openingSegments(project)
  const windows = openings.filter((o) => o.type === 'window')
  // 推拉/口袋门没有开门弧,不占地
  const doors = openings.filter(
    (o) => o.type === 'door' && o.style !== 'sliding' && o.style !== 'pocket' && o.style !== 'bypass',
  )
  const sightPairs = pairs.filter((p) => p.zh === '电视与沙发观看距离')

  /** 静态障碍(评估里不变):固定设施 */
  const fixtureBoxes = (project.fixtures ?? []).map((f) => f.bounds).filter(Boolean)
  /** 高家具表(挡视线/挡窗判定用) */
  const tallOf = new Map(
    placements.map((pl) => [pl.id, placementSpec(pl.kind)?.tall ?? 30]),
  )
  return { segs, pairs, farPairs, huggers, access, windows, doors, sightPairs, fixtureBoxes, tallOf }
}

/**
 * 一个布局的**设计规范总偏差**(英寸,越低越专业):
 * 配对/贴墙(affinityPenaltyIn)+ 使用净空 + 门扇开启区 + 窗前采光 + 视线通透。
 * @param {ReturnType<typeof buildDesignContext>} ctx
 * @param {Map<string, {x:number,y:number,w:number,h:number}>} boxById
 */
export function designPenaltyIn(ctx, boxById) {
  let total = affinityPenaltyIn(boxById, ctx.pairs, ctx.segs, ctx.huggers)

  // 用户指定的 far_from:比最小间距近多少罚多少(封顶同伴随对)——
  // 「鸟笼远离床」被塞到床头,通道再宽也不是好方案
  for (const pair of ctx.farPairs ?? []) {
    const a = boxById.get(pair.aId)
    const b = boxById.get(pair.bId)
    if (!a || !b) continue
    const g = boxGapIn(a, b)
    if (g < pair.minGapIn) total += Math.min(pair.minGapIn - g, PAIR_PENALTY_CAP)
  }

  // 障碍集 = 全部家具盒子 + 固定设施(净空计算里「自己」要排掉)
  const allBoxes = [...boxById.values(), ...ctx.fixtureBoxes]

  // 1) 使用净空:柜门打得开、桌前坐得下、床两侧下得去
  for (const need of ctx.access) {
    const box = boxById.get(need.id)
    if (!box) continue
    const others = allBoxes.filter((b) => b !== box)
    const depth = {
      n: sideFreeDepthIn(box, 'n', others, ctx.segs),
      s: sideFreeDepthIn(box, 's', others, ctx.segs),
      e: sideFreeDepthIn(box, 'e', others, ctx.segs),
      w: sideFreeDepthIn(box, 'w', others, ctx.segs),
    }
    if (need.isBed) {
      // 至少两侧 ≥20in(一长边 + 床尾是常态;床头贴墙不算)
      const okSides = Object.values(depth).filter((d) => d >= BED_SIDE_IN).length
      if (okSides < 2) total += (2 - okSides) * BED_SIDE_IN
    }
    if (need.clearance > 0) {
      // 净空要开在**长边**:柜子只有窄端露着不算「能用」
      const longSides = box.w >= box.h ? [depth.n, depth.s] : [depth.e, depth.w]
      const bestLong = Math.max(...longSides)
      total += Math.min(Math.max(0, need.clearance - bestLong), need.clearance)
    }
  }

  // 2) 门扇开启区:平开门弧内的家具按侵入深度罚
  for (const door of ctx.doors) {
    const radius = door.spanIn * PX_PER_IN
    for (const box of boxById.values()) {
      const d = pointToRectDistance(door.cx, door.cy, box)
      if (d < radius) total += Math.min((radius - d) / PX_PER_IN, 24)
    }
  }

  // 3) 窗前采光:高家具贴着窗户所在墙且横跨窗户跨度
  for (const win of ctx.windows) {
    for (const [id, box] of boxById) {
      if ((ctx.tallOf.get(id) ?? 30) < TALL_IN) continue
      const lo = win.vertical ? box.y : box.x
      const hi = win.vertical ? box.y + box.h : box.x + box.w
      const overlap = Math.min(hi, win.hi) - Math.max(lo, win.lo)
      if (overlap < 6 * PX_PER_IN) continue
      const faceLo = win.vertical ? box.x : box.y
      const faceHi = win.vertical ? box.x + box.w : box.y + box.h
      const gap = Math.min(Math.abs(faceLo - win.at), Math.abs(win.at - faceHi))
      if (gap < 8 * PX_PER_IN) total += Math.min(overlap / PX_PER_IN, 24)
    }
  }

  // 4) 视线通透:电视↔沙发的连线不该被高家具切断
  for (const pair of ctx.sightPairs) {
    const a = boxById.get(pair.aId)
    const b = boxById.get(pair.bId)
    if (!a || !b) continue
    const ax = a.x + a.w / 2
    const ay = a.y + a.h / 2
    const bx = b.x + b.w / 2
    const by = b.y + b.h / 2
    for (const [id, box] of boxById) {
      if (id === pair.aId || id === pair.bId) continue
      if ((ctx.tallOf.get(id) ?? 30) < SIGHT_BLOCK_IN) continue
      if (segIntersectsBox(ax, ay, bx, by, box)) total += 30
    }
    // 观看角先验(Make It Home 的 visibility 项):电视该在沙发**正前方**,
    // 不是斜对角。沙发的前向 = 背离最近的墙(沙发是贴墙件,front 可推);
    // 电视偏离前向超过 30° 按度数罚 —— 斜 60° 看电视脖子最清楚。
    total += viewingAnglePenaltyIn(b, a, ctx.segs)
  }
  return total
}

/**
 * 座位(沙发)看目标(电视)的偏角罚分:
 * 前向取「背离最近正对墙」的那个轴向;偏角 ≤30° 免罚,之后每度 0.5(封顶 30)。
 * 沙发不贴墙(找不到正对墙)时不罚 —— 前向猜不准就不装懂。
 * @param {{x:number,y:number,w:number,h:number}} seat
 * @param {{x:number,y:number,w:number,h:number}} target
 * @param {ReturnType<typeof wallAnchorSegments>} segs
 */
export function viewingAnglePenaltyIn(seat, target, segs) {
  // 找离沙发最近的正对墙在哪一侧
  let bestGap = Infinity
  /** @type {'n'|'s'|'e'|'w'|null} */
  let wallSide = null
  for (const seg of segs) {
    const spanLo = seg.vertical ? seat.y : seat.x
    const spanHi = seg.vertical ? seat.y + seat.h : seat.x + seat.w
    const overlap = Math.min(spanHi, seg.hi) - Math.max(spanLo, seg.lo)
    if (overlap < Math.min(spanHi - spanLo, 24 * PX_PER_IN)) continue
    if (seg.vertical) {
      const gapW = Math.abs(seat.x - seg.at)
      const gapE = Math.abs(seg.at - (seat.x + seat.w))
      if (gapW < bestGap && seg.at <= seat.x) {
        bestGap = gapW
        wallSide = 'w'
      }
      if (gapE < bestGap && seg.at >= seat.x + seat.w) {
        bestGap = gapE
        wallSide = 'e'
      }
    } else {
      const gapN = Math.abs(seat.y - seg.at)
      const gapS = Math.abs(seg.at - (seat.y + seat.h))
      if (gapN < bestGap && seg.at <= seat.y) {
        bestGap = gapN
        wallSide = 'n'
      }
      if (gapS < bestGap && seg.at >= seat.y + seat.h) {
        bestGap = gapS
        wallSide = 's'
      }
    }
  }
  if (!wallSide || bestGap > 18 * PX_PER_IN) return 0

  const front = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[wallSide]
  const dx = target.x + target.w / 2 - (seat.x + seat.w / 2)
  const dy = target.y + target.h / 2 - (seat.y + seat.h / 2)
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return 0
  const cos = (dx * front[0] + dy * front[1]) / len
  const angleDeg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
  return Math.min(Math.max(0, angleDeg - 30) * 0.5, 30)
}

/** 大件(床/沙发/衣柜级):搬动建议两人,劳动量权重更高 */
function isHeavy(pl) {
  return (pl.w / PX_PER_FT) * (pl.h / PX_PER_FT) >= 12
}

/** 搬动劳动量权重:脚印越大越费劲 */
function effortWeight(pl) {
  return 1 + ((pl.w / PX_PER_FT) * (pl.h / PX_PER_FT)) / 15
}

/** 确定性随机:LCG(同种子同序列 —— 方案可复现,单测可锁死) */
function makeRng(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 盒子是否整个落在多边形内(四角 + 中心;缩 1px 容忍贴边) */
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

/** 分区列表(扫描户型有 zones;508 参数模式退回房间矩形) */
function zonesOf(project) {
  return project.zones?.length ? project.zones : roomsAsZones(project)
}

/** 这件家具属于哪个分区(zoneId 优先,兜底按中心点落位) */
function zoneOfPlacement(pl, zones) {
  if (pl.zoneId) {
    const z = zones.find((z) => z.id === pl.zoneId)
    if (z) return z
  }
  const c = { x: pl.x + pl.w / 2, y: pl.y + pl.h / 2 }
  return zones.find((z) => pointInPolygon(c, z.polygon)) ?? null
}

/**
 * 一件家具在自己分区内的候选摆位:12in 网格扫全区,只留整个盒子在区内的;
 * 两个朝向(w×h 原样 / 交换 = 转 90°)。候选是「可能的落点」,重叠与动线
 * 好坏由搜索时的硬检查和真实评分裁决。
 * @returns {Array<{ x: number, y: number, w: number, h: number, rotDelta: 0 | 90 }>}
 */
export function candidateSlots(pl, zone) {
  if (!zone) return []
  const poly = zone.polygon
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const step = 12 * PX_PER_IN

  /** @type {Array<{ x: number, y: number, w: number, h: number, rotDelta: 0 | 90 }>} */
  const out = []
  for (const [w, h, rotDelta] of [
    [pl.w, pl.h, /** @type {0} */ (0)],
    [pl.h, pl.w, /** @type {90} */ (90)],
  ]) {
    // 正方形件转 90° 与原样等价,别把候选翻倍
    if (rotDelta === 90 && Math.abs(pl.w - pl.h) < 2) continue
    for (let y = minY; y + h <= maxY + 1; y += step) {
      for (let x = minX; x + w <= maxX + 1; x += step) {
        const box = { x, y, w, h }
        if (boxInPolygon(box, poly)) out.push({ ...box, rotDelta })
      }
    }
  }
  return out
}

/**
 * 可用贴墙长度(英尺):沿每段墙 6in 采样,两侧各探 14in ——
 * 探点在某个分区里且没被落地家具占住,这段墙的这一侧就能放柜子。
 * 只累计连续 ≥36in 的段(短于一柜宽的缝不算收纳空间)。
 */
export function freeWallFt(project, placements) {
  const segs = wallAnchorSegments(project.wallGraph)
  if (!segs.length) return 0
  const zones = zonesOf(project)
  // 占墙的是**所有落地件**(含钉死的洗衣机/内嵌柜 —— 它们不动,但墙确实被占着),
  // 只豁免踩得过去的地毯垫子
  const boxes = (placements ?? [])
    .filter((pl) => {
      if (pl.kind === 'rug' || pl.kind === 'yoga_mat' || pl.kind === 'mat') return false
      return (placementSpec(pl.kind)?.mount ?? 'floor') === 'floor'
    })
    .map((pl) => ({ x: pl.x, y: pl.y, w: pl.w, h: pl.h }))
  for (const fx of project.fixtures ?? []) {
    if (fx.bounds) boxes.push(fx.bounds)
  }
  const probeIn = 14 * PX_PER_IN
  const stepPx = 6 * PX_PER_IN
  const minRun = 6 // 连续 6 个采样 = 36in

  let totalIn = 0
  for (const seg of segs) {
    for (const dir of [1, -1]) {
      let run = 0
      for (let t = seg.lo; t <= seg.hi; t += stepPx) {
        const p = seg.vertical
          ? { x: seg.at + dir * probeIn, y: t }
          : { x: t, y: seg.at + dir * probeIn }
        const inZone = zones.some((z) => pointInPolygon(p, z.polygon))
        const onBox = boxes.some(
          (b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h,
        )
        if (inZone && !onBox) {
          run += 1
        } else {
          if (run >= minRun) totalIn += run * 6
          run = 0
        }
      }
      if (run >= minRun) totalIn += run * 6
    }
  }
  return Math.round(totalIn / 12)
}

/** 动线分析 → 求解器用的紧凑指标 */
export function circMetrics(circ) {
  const minWidthIn = circ.bottlenecks.length
    ? Math.min(...circ.bottlenecks.map((b) => b.widthIn))
    : CLEARANCE.comfortable
  let freeSum = 0
  let tightSum = 0
  let openSum = 0
  for (const z of circ.zoneStats) {
    freeSum += z.freeSqft
    tightSum += z.tightRatio * z.freeSqft
    openSum += (z.maxClearIn ?? 0) * z.freeSqft
  }
  return {
    blocked: circ.blockedDoors.length,
    isolated: circ.isolatedZones.length,
    bottlenecks: circ.bottlenecks.length,
    minWidthIn,
    freeSqft: circ.totals.freeSqft,
    tight: freeSum > 0 ? tightSum / freeSum : 0,
    /** 开阔度:各区最大空旷圆直径(英寸)按可站面积加权 —— 现代布局讲究
     * 负空间聚成整块,而不是碎在家具缝里 */
    openIn: freeSum > 0 ? openSum / freeSum : 0,
  }
}

/**
 * 一个布局状态的分数(越高越好;违反硬约束返回 -Infinity)。
 * 硬门槛对三个 profile 一致:不许新增堵门/孤岛、全屋最窄通道不许更窄。
 * `affinityGain` = 摆放逻辑罚分的改善量(英寸,正 = 更合理):
 * 拆散床头柜/把柜子丢到房间中央的方案,通道再宽也不是好方案。
 */
function scoreState({ profileKey, m, base, wallFt, baseWallFt, moveCost, affinityGain }) {
  if (m.blocked > base.blocked || m.isolated > base.isolated) return -Infinity
  if (m.minWidthIn < base.minWidthIn) return -Infinity

  const problemGain =
    (base.blocked - m.blocked) * 500 +
    (base.isolated - m.isolated) * 500 +
    (base.bottlenecks - m.bottlenecks) * 150 +
    (m.minWidthIn - base.minWidthIn) * 10

  switch (profileKey) {
    case 'min_effort':
      // 归位一件流浪的椅子也是「解决问题」—— 权重要压得过它自己的搬动成本
      return problemGain * 3 + affinityGain * 10 - moveCost * 60
    case 'best_flow':
      return (
        problemGain * 1.5 +
        affinityGain * 5 +
        (base.tight - m.tight) * 900 +
        (m.openIn - base.openIn) * 4 +
        (m.freeSqft - base.freeSqft) * 3 -
        moveCost * 8
      )
    case 'max_storage':
      return (
        problemGain * 0.5 +
        affinityGain * 4 +
        (wallFt - baseWallFt) * 30 +
        (base.tight - m.tight) * 200 -
        moveCost * 8
      )
    default:
      return -Infinity
  }
}

/** 平面图 y 向下、北向上 → 位移的人话方向 */
export function directionZh(dx, dy) {
  const parts = []
  if (Math.abs(dy) > 6) parts.push(dy < 0 ? '北' : '南')
  if (Math.abs(dx) > 6) parts.push(dx > 0 ? '东' : '西')
  return parts.length ? `向${parts.join('')}` : '原地'
}

/**
 * 求一套方案。确定性:同 project + profile + seed → 同结果。
 *
 * 真实户型一次评估(栅格化 + BFS)毫秒到几十毫秒,几百次迭代是**秒级同步计算**——
 * 浏览器里必须传 `yieldFn`(每 ~16 次迭代让出一次事件循环),否则 UI 假死、
 * 定时器被节流;node 单测不传照常同步跑完。
 *
 * @param {SpatialProject} project hydrate 过的当前户型
 * @param {'min_effort'|'best_flow'|'max_storage'} profileKey
 * @param {{
 *   iterations?: number, seed?: number,
 *   yieldFn?: () => Promise<void>, onProgress?: (frac: number) => void,
 * }} [opts]
 * @returns {Promise<{
 *   ok: boolean, reason?: string, profile: typeof LAYOUT_PROFILES[number],
 *   moves: any[], project?: SpatialProject, score?: number,
 *   status?: 'certified' | 'provisional', lowConfidence?: string[],
 *   provisionalReasons?: Array<{ code: string, label: string, zh: string }>,
 *   unmetRelations?: Array<{ label: string, targetLabel: string, type: string, gapIn: number, wantIn: number, zh: string }>,
 *   slackIn?: number, fragile?: boolean,
 *   before?: any, after?: any,
 * }>}
 * `status`:certified = 独立复检通过、无低置信度输入、无关系完整度缺口;
 * provisional = 有搬动件尺寸来自低置信度扫描,或搬动件的家规目标已被删(约束被静默丢)——
 * 见 `provisionalReasons`(逐条人话)。`unmetRelations` = 家规有效但最优解没满足的取舍附言
 * (不降级 status)。`slackIn` = 最窄通道距侧身极限(24in)的余量;`fragile` = 余量 <4in。
 */
export async function solveLayout(project, profileKey, opts = {}) {
  const profile = LAYOUT_PROFILES.find((p) => p.key === profileKey) ?? LAYOUT_PROFILES[0]
  const iterations = opts.iterations ?? 260
  const rng = makeRng(opts.seed ?? 42)

  const zones = zonesOf(project)
  const placements = project.placements ?? []
  // 静态底图(分区/墙/门的栅格分类)只算一次:每步评估只有家具变,
  // 复用底图砍掉栅格化大头 —— 省下的时间直接变成更多迭代 = 更优解
  const circBase = buildCirculationBase(project)
  const baseCirc = analyzeCirculation(project, { base: circBase })
  if (!baseCirc.ok) return { ok: false, reason: baseCirc.reason ?? '没有可分析的户型', profile, moves: [] }

  const movables = placements
    .map((pl, idx) => ({ pl, idx, zone: zoneOfPlacement(pl, zones) }))
    .filter((m) => isMovable(m.pl) && m.zone)
  if (!movables.length) {
    return { ok: false, reason: '没有可移动的落地家具', profile, moves: [] }
  }

  // 候选位缓存(按家具);候选是几何可行域,重叠/动线由搜索时裁决
  const slotsOf = movables.map((m) => candidateSlots(m.pl, m.zone))

  const base = circMetrics(baseCirc)
  const baseWallFt = freeWallFt(project, placements)

  // 设计规范基线:认对/贴墙/净空/门窗/视线,上下文只建一次
  const ctx = buildDesignContext(project, placements, zones)
  const pairs = ctx.pairs
  const boxByIdOf = (plist) =>
    new Map(plist.map((p) => [p.id, { x: p.x, y: p.y, w: p.w, h: p.h }]))
  const baseAffinity = designPenaltyIn(ctx, boxByIdOf(placements))

  // 伴随对协同移动表:anchor(b)动,follower(a)保持相对位置跟着动
  const movIdxByPlId = new Map(movables.map((m, i) => [m.pl.id, i]))
  /** @type {Map<number, number[]>} */
  const followersOf = new Map()
  for (const pair of pairs) {
    const ai = movIdxByPlId.get(pair.aId)
    const bi = movIdxByPlId.get(pair.bId)
    if (ai === undefined || bi === undefined) continue
    if (!followersOf.has(bi)) followersOf.set(bi, [])
    followersOf.get(bi).push(ai)
  }

  /** 当前状态:每件家具的 {x,y,w,h,rotDelta} */
  let cur = movables.map((m) => ({ x: m.pl.x, y: m.pl.y, w: m.pl.w, h: m.pl.h, rotDelta: 0 }))
  let curScore = 0 // 现状分数按定义为 0(所有 delta 为 0)
  let best = cur.map((s) => ({ ...s }))
  let bestScore = 0

  /** 状态 → placements 数组(不动的原样引用,动过的浅拷贝) */
  const materialize = (state) =>
    placements.map((pl) => {
      const mi = movables.findIndex((m) => m.pl === pl)
      if (mi < 0) return pl
      const s = state[mi]
      if (s.x === pl.x && s.y === pl.y && s.rotDelta === 0) return pl
      return {
        ...pl,
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        rotation: ((pl.rotation ?? 0) + s.rotDelta) % 360,
      }
    })

  /** 硬检查:与其他家具/设施不重叠(动线/堵门交给真实评分) */
  const collides = (state, mi, box) => {
    for (let i = 0; i < placements.length; i++) {
      const other = placements[i]
      if (other === movables[mi].pl) continue
      if (other.kind === 'rug' || other.kind === 'yoga_mat' || other.kind === 'mat') continue
      const oi = movables.findIndex((m) => m.pl === other)
      const ob = oi >= 0 ? state[oi] : other
      if (boxesOverlap(box, { x: ob.x, y: ob.y, w: ob.w, h: ob.h })) return true
    }
    for (const fx of project.fixtures ?? []) {
      if (fx.bounds && boxesOverlap(box, fx.bounds)) return true
    }
    return false
  }

  const moveCostOf = (state) => {
    let cost = 0
    for (let i = 0; i < state.length; i++) {
      const s = state[i]
      const pl = movables[i].pl
      const d = Math.hypot(s.x - pl.x, s.y - pl.y) / PX_PER_FT
      if (d > 0.05 || s.rotDelta !== 0) {
        cost += d * effortWeight(pl) + (s.rotDelta !== 0 ? 1.5 : 0)
      }
    }
    return cost
  }

  const evaluate = (state) => {
    const nextPlacements = materialize(state)
    const candidate = { ...project, placements: nextPlacements }
    const circ = analyzeCirculation(candidate, { base: circBase })
    if (!circ.ok) return -Infinity
    const affinity = designPenaltyIn(ctx, boxByIdOf(nextPlacements))
    return scoreState({
      profileKey: profile.key,
      m: circMetrics(circ),
      base,
      wallFt: profile.key === 'max_storage' ? freeWallFt(project, nextPlacements) : baseWallFt,
      baseWallFt,
      moveCost: moveCostOf(state),
      affinityGain: baseAffinity - affinity,
    })
  }

  for (let it = 0; it < iterations; it++) {
    if (opts.yieldFn && it % 16 === 0) {
      opts.onProgress?.(it / iterations)
      await opts.yieldFn()
    }
    const temp = 1 - it / iterations
    const mi = Math.floor(rng() * movables.length)
    const slots = slotsOf[mi]
    if (!slots.length) continue
    const slot = slots[Math.floor(rng() * slots.length)]
    const prev = cur[mi]
    if (slot.x === prev.x && slot.y === prev.y && slot.rotDelta === prev.rotDelta) continue
    if (collides(cur, mi, slot)) continue

    /** @type {Array<[number, typeof prev]>} 本步动过的全部件(拒绝时整体回滚) */
    const changed = [[mi, prev]]
    cur[mi] = { x: slot.x, y: slot.y, w: slot.w, h: slot.h, rotDelta: slot.rotDelta }

    // 伴随家具跟着一起挪(保持相对位置):否则「先拆散再归位」要跨两步,
    // 退火的容忍窗迈不过中间那道分数谷 —— 床永远带不动床头柜
    const dx = slot.x - prev.x
    const dy = slot.y - prev.y
    for (const fi of followersOf.get(mi) ?? []) {
      const f = cur[fi]
      const nb = { x: f.x + dx, y: f.y + dy, w: f.w, h: f.h }
      const fZone = movables[fi].zone
      if (!fZone || !boxInPolygon(nb, fZone.polygon)) continue
      if (collides(cur, fi, nb)) continue
      changed.push([fi, f])
      cur[fi] = { ...f, x: nb.x, y: nb.y }
    }

    const s = evaluate(cur)
    // Metropolis-Hastings 接受准则(Make It Home 同款):改进必收;
    // 劣解按 exp(Δ/T) 概率接受 —— 比线性容忍窗更标准地跳局部最优,
    // 后期 T→0 自然收敛。rng 是种子化的,确定性不变。
    const delta = s - curScore
    const accept =
      delta >= 0 || (s > -Infinity && rng() < Math.exp(delta / Math.max(1e-6, temp * 40)))
    if (accept) {
      curScore = s
      if (s > bestScore) {
        bestScore = s
        best = cur.map((v) => ({ ...v }))
      }
    } else {
      for (const [idx, prevState] of changed) cur[idx] = prevState
    }
  }

  // 没有比现状好出门槛的方案 —— 如实说,别硬凑三套
  if (bestScore <= 1) {
    return { ok: false, reason: '按这个目标,现状已接近最优(或问题不靠挪家具解决)', profile, moves: [] }
  }

  const finalPlacements = materialize(best)
  const finalProject = { ...project, placements: finalPlacements }

  // 独立复检:交付前对最终状态做与搜索路径无关的全量硬约束验收。
  // 理论上退火的硬门槛已保证这里必过 —— 正因如此,复检不过就是求解器有 bug,
  // 宁可如实拒发方案,也不把一套没验过的摆法说成「已验证」。
  const audit = auditLayout(project, finalProject, { base: circBase })
  if (!audit.ok) {
    return {
      ok: false,
      reason: `复检未过(疑似求解器缺陷,请反馈):${audit.violations.map((v) => v.zh).join(';')}`,
      profile,
      moves: [],
    }
  }

  const finalCirc = analyzeCirculation(finalProject, { base: circBase })
  const moves = []
  for (let i = 0; i < best.length; i++) {
    const s = best[i]
    const pl = movables[i].pl
    const movedFt = Math.hypot(s.x - pl.x, s.y - pl.y) / PX_PER_FT
    if (movedFt < 0.1 && s.rotDelta === 0) continue
    moves.push({
      id: pl.id,
      label: pl.label,
      kind: pl.kind,
      zoneNameZh: movables[i].zone?.nameZh ?? '',
      from: { x: pl.x, y: pl.y, rotation: pl.rotation ?? 0 },
      to: { x: s.x, y: s.y, rotation: ((pl.rotation ?? 0) + s.rotDelta) % 360 },
      movedFt: Math.round(movedFt * 10) / 10,
      rotated: s.rotDelta !== 0,
      heavy: isHeavy(pl),
      directionZh: directionZh(s.x - pl.x, s.y - pl.y),
    })
  }
  moves.sort((a, b) => b.movedFt - a.movedFt)

  // 成对搬动的标出来:「床头柜 向西挪 2.9 ft · 跟着床」——
  // 用户一看就懂这步不是乱挪,是保持配对
  const moveById = new Map(moves.map((m) => [m.id, m]))
  for (const pair of pairs) {
    const ma = moveById.get(pair.aId)
    const mb = moveById.get(pair.bId)
    if (!ma || !mb || ma.withZh) continue
    const dRel =
      Math.abs(ma.from.x - mb.from.x - (ma.to.x - mb.to.x)) +
      Math.abs(ma.from.y - mb.from.y - (ma.to.y - mb.to.y))
    if (dRel < 6 * PX_PER_IN) ma.withZh = mb.label
  }

  // 日常任务路径:只在首尾各算一次(两次栅格 BFS,毫秒级),不进退火评分 ——
  // 先作为如实汇报的指标;等权重被真实行为数据校准过再考虑参与优化
  const baseWalk = computeTaskRoutes(project, { base: circBase }).dailyWalkFt
  const afterWalk = computeTaskRoutes(finalProject, { base: circBase }).dailyWalkFt

  const after = {
    ...circMetrics(finalCirc),
    wallFt: freeWallFt(project, finalPlacements),
    affinityIn: Math.round(designPenaltyIn(ctx, boxByIdOf(finalPlacements))),
    walkFtPerDay: afterWalk,
  }

  // 状态分级 + 余量:方案不只说「通过」,还说**凭什么信、信到什么程度**。
  // provisional 有两条来路,都属于「方案建立在缺失语义上」:
  //   ① 有搬动件尺寸来自低置信度扫描 —— 图上通过不等于现场通过;
  //   ② 关系完整度门禁:搬动件的家规目标已被删,约束被静默丢掉(见 plan-readiness.js)。
  const movedIds = new Set(moves.map((m) => m.id))
  const lowConfidence = finalPlacements
    .filter((p) => movedIds.has(p.id) && p.attrs?.confidence === 'low')
    .map((p) => p.label)
  const readiness = assessRelationReadiness(finalProject, movedIds)
  const provisionalReasons = [
    ...lowConfidence.map((l) => ({
      code: 'low_confidence',
      label: l,
      zh: `「${l}」尺寸来自低置信度扫描,建议补测后再照着搬`,
    })),
    ...readiness.provisionalReasons,
  ]
  // slack = 方案里全屋最窄通道距「侧身极限」还剩几英寸。数字虽然「通过」,
  // 余量小于常见的扫描/手测误差(~1.5in)时按脆弱标记,别让绿灯骗人
  const slackIn = Math.round((after.minWidthIn - CLEARANCE.minimum) * 10) / 10

  return {
    ok: true,
    profile,
    moves,
    project: finalProject,
    score: Math.round(bestScore),
    status: provisionalReasons.length ? 'provisional' : 'certified',
    lowConfidence, // 兼容旧消费方;新代码读 provisionalReasons
    provisionalReasons,
    // unmet:家规有效、进了求解,但最优解仍没满足 —— Pareto 取舍,不降级,只如实附言
    unmetRelations: readiness.unmetRelations,
    slackIn,
    fragile: slackIn < 4,
    before: { ...base, wallFt: baseWallFt, affinityIn: Math.round(baseAffinity), walkFtPerDay: baseWalk },
    after,
  }
}

/**
 * 三个目标各解一套,去重(两套方案搬动完全相同只留一套)。
 * @param {SpatialProject} project
 * @param {{
 *   iterations?: number, seed?: number,
 *   yieldFn?: () => Promise<void>,
 *   onProgress?: (profileIndex: number, frac: number) => void,
 * }} [opts]
 */
export async function solveAllProfiles(project, opts = {}) {
  const out = []
  /** @type {Map<string, string>} 搬动签名 → 先出现的方案名 */
  const seen = new Map()
  for (let pi = 0; pi < LAYOUT_PROFILES.length; pi++) {
    const profile = LAYOUT_PROFILES[pi]
    const res = await solveLayout(project, profile.key, {
      ...opts,
      onProgress: (frac) => opts.onProgress?.(pi, frac),
    })
    if (!res.ok) {
      out.push(res)
      continue
    }
    const sig = res.moves
      .map((m) => `${m.id}:${m.to.x},${m.to.y},${m.to.rotation}`)
      .sort()
      .join('|')
    if (seen.has(sig)) {
      out.push({ ...res, signature: sig, duplicateOfZh: seen.get(sig) })
    } else {
      seen.set(sig, profile.nameZh)
      out.push({ ...res, signature: sig })
    }
  }
  return out
}
