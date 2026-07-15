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
 * 与地毯/宠物不参与移动。
 *
 * 每步候选都跑一次完整 analyzeCirculation(6in 栅格,毫秒级),分数是真几何,
 * 不是启发式近似 —— 这正是「LLM 解释,几何引擎裁决」的架构分工。
 */
import { analyzeCirculation, CLEARANCE, pointInPolygon, roomsAsZones } from './circulation.js'
import { placementSpec } from './placements.js'
import { wallAnchorSegments } from './wall-anchor.js'

/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').SpatialPlacement} SpatialPlacement */

const PX_PER_IN = 3
const PX_PER_FT = 36

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

/** 这些不参与移动:钉死的(公寓自带)、踩得过去的、有腿的(狗),以及非落地件 */
function isMovable(pl) {
  if (!pl || pl.fixed) return false
  if (pl.kind === 'rug' || pl.kind === 'yoga_mat' || pl.kind === 'mat') return false
  if (String(pl.kind).startsWith('dog')) return false
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

/** @param {{x:number,y:number,w:number,h:number}} a @param {{x:number,y:number,w:number,h:number}} b */
function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
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
  for (const z of circ.zoneStats) {
    freeSum += z.freeSqft
    tightSum += z.tightRatio * z.freeSqft
  }
  return {
    blocked: circ.blockedDoors.length,
    isolated: circ.isolatedZones.length,
    bottlenecks: circ.bottlenecks.length,
    minWidthIn,
    freeSqft: circ.totals.freeSqft,
    tight: freeSum > 0 ? tightSum / freeSum : 0,
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
 *   before?: any, after?: any,
 * }>}
 */
export async function solveLayout(project, profileKey, opts = {}) {
  const profile = LAYOUT_PROFILES.find((p) => p.key === profileKey) ?? LAYOUT_PROFILES[0]
  const iterations = opts.iterations ?? 260
  const rng = makeRng(opts.seed ?? 42)

  const zones = zonesOf(project)
  const placements = project.placements ?? []
  const baseCirc = analyzeCirculation(project)
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

  // 摆放逻辑基线:伴随对按当前布局认对(你的椅子跟你的桌子),
  // 贴墙偏好只评能动的件(钉死件的位置本来就是既成事实)
  const wallSegs = wallAnchorSegments(project.wallGraph)
  const pairs = detectPairs(placements, zones)
  const huggers = placements
    .filter((pl) => WALL_HUGGERS.has(pl.kind) && !pl.fixed)
    .map((pl) => ({ id: pl.id, kind: pl.kind }))
  const boxByIdOf = (plist) =>
    new Map(plist.map((p) => [p.id, { x: p.x, y: p.y, w: p.w, h: p.h }]))
  const baseAffinity = affinityPenaltyIn(boxByIdOf(placements), pairs, wallSegs, huggers)

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
    const circ = analyzeCirculation(candidate)
    if (!circ.ok) return -Infinity
    const affinity = affinityPenaltyIn(boxByIdOf(nextPlacements), pairs, wallSegs, huggers)
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
    // 退火:前期容忍小倒退跳出局部最优,后期只收严格改进
    if (s > curScore - temp * 12) {
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
  const finalCirc = analyzeCirculation(finalProject)
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

  return {
    ok: true,
    profile,
    moves,
    project: finalProject,
    score: Math.round(bestScore),
    before: { ...base, wallFt: baseWallFt, affinityIn: Math.round(baseAffinity) },
    after: {
      ...circMetrics(finalCirc),
      wallFt: freeWallFt(project, finalPlacements),
      affinityIn: Math.round(
        affinityPenaltyIn(boxByIdOf(finalPlacements), pairs, wallSegs, huggers),
      ),
    },
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
      out.push({ ...res, duplicateOfZh: seen.get(sig) })
    } else {
      seen.set(sig, profile.nameZh)
      out.push(res)
    }
  }
  return out
}
