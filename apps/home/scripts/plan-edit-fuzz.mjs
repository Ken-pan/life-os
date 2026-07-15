#!/usr/bin/env node
/**
 * 编辑系统随机压力测试（property-based fuzz，无需浏览器）。
 *
 * 每个 op 都严格复刻 state.svelte.js 的编排顺序，所以这里报出的违例
 * 都能由真实 UI 操作触达，而不是「直接调 API 的姿势不对」。
 *
 * 运行：npm run test:fuzz  [-- --runs=2000 --ops=60 --seed=1]
 */
import {
  addWallSegment,
  buildFromWallGraph,
  createEmptyWallGraph,
  deleteWallEdge,
  moveVertex,
  splitWallAtMidpoint,
} from '../src/lib/spatial/wall-graph.js'
import {
  createOpeningAtPoint,
  cycleDoorStyleOpening,
  cycleWindowStyleOpening,
  filterOpeningsForEdge,
  fitGraphOpeningOnEdge,
  flipGraphOpeningSwing,
  previewGraphOpeningEdit,
  remapOpeningsAfterSplit,
  toggleGraphOpeningType,
  MIN_OPENING_SPAN_IN,
} from '../src/lib/spatial/graph-openings.js'
import { createZoneFromChain, findZoneAtPoint } from '../src/lib/spatial/zones.js'
import {
  clampPlacementRect,
  createPlacement,
  rotatePlacement,
  PLACEMENT_KINDS,
  STORAGE_CODES,
} from '../src/lib/spatial/placements.js'
import { createViewpoint, normalizeHeading } from '../src/lib/spatial/viewpoints.js'
import { snapGraphPoint } from '../src/lib/spatial/wall-graph.js'

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)
const RUNS = Number(argv.runs ?? 800)
const OPS = Number(argv.ops ?? 40)
const SEED0 = Number(argv.seed ?? 1)
const VERBOSE = Boolean(argv.verbose)
// 已知类别可屏蔽，好让更深的违例浮出来：--ignore=O-OVERFLOW
const IGNORE = new Set(String(argv.ignore ?? '').split(',').filter(Boolean))

/**
 * 已知且接受的限制 —— 计入报告但不判失败。
 *
 * O-OVERFLOW-TINYWALL：门窗有 MIN_OPENING_SPAN_IN(24″) 的宽度下限，
 * 而拖顶点可以把一面已经带门的墙缩到 24″ 以下。此时门再怎么 fit 也超出墙长。
 * 要根治只能二选一：拖动时删掉用户的门，或者禁止墙缩到门宽以下（拖动会「顶住」）。
 * 两者都比症状本身更糟 —— 症状仅限 <2ft 的墙头，且渲染层会 clamp 成整面墙是洞，
 * 不崩溃、不丢数据。故记录在案。
 */
const ACCEPTED = new Set(['O-OVERFLOW-TINYWALL'])

const PX_PER_FT = 36
const EPS = 1e-6

/** mulberry32 —— 固定种子可复现 */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const inches = (px) => (px / PX_PER_FT) * 12
const edgeLenIn = (graph, edgeId) => {
  const e = graph.edges.find((x) => x.id === edgeId)
  if (!e) return null
  const a = graph.vertices.find((v) => v.id === e.a)
  const b = graph.vertices.find((v) => v.id === e.b)
  if (!a || !b) return null
  return inches(Math.hypot(b.x - a.x, b.y - a.y))
}

/**
 * 不变量。返回违例列表。
 * @param {{ wallGraph: any, graphOpenings: any[] }} st
 */
function checkInvariants(st) {
  const bad = []
  const g = st.wallGraph
  const vIds = new Set(g.vertices.map((v) => v.id))

  if (vIds.size !== g.vertices.length) bad.push(['G-DUP-VERTEX', '顶点 id 重复'])
  const eIds = new Set(g.edges.map((e) => e.id))
  if (eIds.size !== g.edges.length) bad.push(['G-DUP-EDGE', '墙段 id 重复'])

  for (const e of g.edges) {
    if (!vIds.has(e.a) || !vIds.has(e.b))
      bad.push(['G-DANGLING-EDGE', `墙段 ${e.id} 指向不存在的顶点`])
    if (e.a === e.b) bad.push(['G-SELF-LOOP', `墙段 ${e.id} 自环`])
  }

  const pairs = new Set()
  for (const e of g.edges) {
    const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`
    if (pairs.has(key)) bad.push(['G-DUP-SEGMENT', `重复墙段 ${e.id}`])
    pairs.add(key)
  }

  const used = new Set(g.edges.flatMap((e) => [e.a, e.b]))
  for (const v of g.vertices)
    if (!used.has(v.id)) bad.push(['G-ORPHAN-VERTEX', `孤立顶点 ${v.id}`])

  // --- 门窗 ---
  const oIds = new Set(st.graphOpenings.map((o) => o.id))
  if (oIds.size !== st.graphOpenings.length)
    bad.push(['O-DUP-ID', '门窗 id 重复'])

  for (const o of st.graphOpenings) {
    if (!eIds.has(o.edgeId)) {
      bad.push(['O-ORPHAN', `门窗 ${o.id} 挂在已不存在的墙段 ${o.edgeId}`])
      continue
    }
    const len = edgeLenIn(g, o.edgeId)
    if (len == null) continue
    if (!Number.isFinite(o.offsetIn) || !Number.isFinite(o.spanIn)) {
      bad.push(['O-NAN', `门窗 ${o.id} 数值非法 offset=${o.offsetIn} span=${o.spanIn}`])
      continue
    }
    if (o.offsetIn < -EPS)
      bad.push(['O-NEG-OFFSET', `门窗 ${o.id} 起点为负 ${o.offsetIn.toFixed(2)}″`])
    if (o.spanIn < MIN_OPENING_SPAN_IN - EPS)
      bad.push(['O-MIN-SPAN', `门窗 ${o.id} 宽 ${o.spanIn.toFixed(2)}″ < 下限 ${MIN_OPENING_SPAN_IN}″`])
    // 墙本身比最小门宽还短时溢出无解 —— 单独归类，不算主违例
    const overflow = o.offsetIn + o.spanIn - len
    if (overflow > 0.01) {
      const tag =
        len < MIN_OPENING_SPAN_IN ? 'O-OVERFLOW-TINYWALL' : 'O-OVERFLOW'
      bad.push([
        tag,
        `门窗 ${o.id} 越出墙段 ${o.edgeId}：${o.offsetIn.toFixed(1)}+${o.spanIn.toFixed(1)} > 墙长 ${len.toFixed(1)}″（超 ${overflow.toFixed(1)}″）`,
      ])
    }
  }

  // --- 分区 / 家具 / 视角 / 储藏：引用完整性 ---
  const zoneIds = new Set(st.zones.map((z) => z.id))
  if (zoneIds.size !== st.zones.length) bad.push(['Z-DUP-ID', '分区 id 重复'])
  for (const z of st.zones) {
    if (!Array.isArray(z.polygon) || z.polygon.length < 3)
      bad.push(['Z-DEGENERATE', `分区 ${z.id} 顶点数 < 3`])
  }

  const plIds = new Set(st.placements.map((p) => p.id))
  if (plIds.size !== st.placements.length) bad.push(['P-DUP-ID', '家具 id 重复'])
  for (const p of st.placements) {
    if (p.zoneId && !zoneIds.has(p.zoneId))
      bad.push(['P-DANGLING-ZONE', `家具 ${p.id} 指向已删除的分区 ${p.zoneId}`])
  }

  const vpIds = new Set(st.viewpoints.map((v) => v.id))
  if (vpIds.size !== st.viewpoints.length) bad.push(['V-DUP-ID', '视角 id 重复'])
  for (const v of st.viewpoints) {
    if (v.zoneId && !zoneIds.has(v.zoneId))
      bad.push(['V-DANGLING-ZONE', `视角 ${v.id} 指向已删除的分区 ${v.zoneId}`])
    if (!Number.isFinite(v.heading) || v.heading < 0 || v.heading >= 360)
      bad.push(['V-HEADING', `视角 ${v.id} 朝向越界 ${v.heading}`])
  }

  for (const sz of st.storageZones) {
    if (sz.zoneId && !zoneIds.has(sz.zoneId))
      bad.push(['SZ-DANGLING-ZONE', `储藏区 ${sz.code} 指向已删除的分区 ${sz.zoneId}`])
    if (sz.placementId && !plIds.has(sz.placementId))
      bad.push(['SZ-DANGLING-PLACEMENT', `储藏区 ${sz.code} 指向已删除的家具 ${sz.placementId}`])
  }

  // 渲染必须不炸
  try {
    const project = buildFromWallGraph(g, st)
    if (!Number.isFinite(project.viewport.width) || !Number.isFinite(project.viewport.height))
      bad.push(['R-VIEWPORT-NAN', 'viewport 出现 NaN'])
  } catch (err) {
    bad.push(['R-THROW', `buildFromWallGraph 抛错：${err.message}`])
  }
  return bad
}

/** 起手：一个矩形外壳，保证有可编辑的东西 */
function seedState(r) {
  let g = createEmptyWallGraph(PX_PER_FT, { x: 40, y: 40 })
  const w = 180 + Math.floor(r() * 360)
  const h = 144 + Math.floor(r() * 288)
  const sides = [
    [40, 40, 40 + w, 40],
    [40 + w, 40, 40 + w, 40 + h],
    [40 + w, 40 + h, 40, 40 + h],
    [40, 40 + h, 40, 40],
  ]
  for (const [x1, y1, x2, y2] of sides)
    g = addWallSegment(g, x1, y1, x2, y2, { exterior: true }).graph
  return {
    wallGraph: g,
    graphOpenings: [],
    zones: [],
    placements: [],
    viewpoints: [],
    // 储藏区清单始终存在（508 默认就有 8 个），只是未必指派到几何上
    storageZones: STORAGE_CODES.slice(0, 4).map((code, i) => ({
      id: `sz-${i + 1}`,
      code,
      nameZh: `储藏 ${code}`,
      locationZh: '',
      formZh: '',
      items: [],
    })),
  }
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const clone = (o) => JSON.parse(JSON.stringify(o))

/** 随机点：偏向已有几何附近，才能真正撞上吸附/合并逻辑 */
function randPt(r, g) {
  if (g.vertices.length && r() < 0.6) {
    const v = pick(r, g.vertices)
    return { x: v.x + (r() - 0.5) * 60, y: v.y + (r() - 0.5) * 60 }
  }
  return { x: 20 + r() * 600, y: 20 + r() * 500 }
}

/** 每个 op 复刻 state.svelte.js 的编排 */
const OPS_TABLE = {
  addWall(r, st) {
    const p1 = randPt(r, st.wallGraph)
    const p2 = randPt(r, st.wallGraph)
    const res = addWallSegment(st.wallGraph, p1.x, p1.y, p2.x, p2.y)
    if (!res.edgeId) return null
    return { ...st, wallGraph: res.graph }
  },
  removeWall(r, st) {
    if (!st.wallGraph.edges.length) return null
    const e = pick(r, st.wallGraph.edges)
    // state.svelte.js: removeGraphWall
    return {
      wallGraph: deleteWallEdge(st.wallGraph, e.id),
      graphOpenings: filterOpeningsForEdge(st.graphOpenings, e.id),
    }
  },
  splitWall(r, st) {
    if (!st.wallGraph.edges.length) return null
    const e = pick(r, st.wallGraph.edges)
    const res = splitWallAtMidpoint(st.wallGraph, e.id)
    if (!res) return null
    // state.svelte.js: splitGraphWall —— remap 用的是**分割前**的 graph
    const graphOpenings = remapOpeningsAfterSplit(
      st.wallGraph,
      st.graphOpenings,
      e.id,
      res.edgeAId,
      res.edgeBId,
      res.splitT,
    )
    return { wallGraph: res.graph, graphOpenings }
  },
  moveVertex(r, st) {
    if (!st.wallGraph.vertices.length) return null
    const v = pick(r, st.wallGraph.vertices)
    const pt = randPt(r, st.wallGraph)
    // state.svelte.js: commitGraphVertexMove —— 只动 graph，不碰 graphOpenings
    return { ...st, wallGraph: moveVertex(st.wallGraph, v.id, pt.x, pt.y) }
  },
  addOpening(r, st) {
    if (!st.wallGraph.edges.length) return null
    const e = pick(r, st.wallGraph.edges)
    const pt = randPt(r, st.wallGraph)
    const type = r() < 0.5 ? 'door' : 'window'
    const op = createOpeningAtPoint(st.wallGraph, e.id, pt, type)
    if (!op) return null
    return { ...st, graphOpenings: [...st.graphOpenings, op] }
  },
  dragOpening(r, st) {
    if (!st.graphOpenings.length) return null
    const o = pick(r, st.graphOpenings)
    const mode = pick(r, ['move', 'resize-start', 'resize-end'])
    const pt = randPt(r, st.wallGraph)
    return {
      ...st,
      graphOpenings: previewGraphOpeningEdit(
        st.wallGraph,
        st.graphOpenings,
        o.id,
        pt,
        mode,
      ),
    }
  },
  toggleOpeningKind(r, st) {
    if (!st.graphOpenings.length) return null
    const o = pick(r, st.graphOpenings)
    return {
      ...st,
      graphOpenings: st.graphOpenings.map((x) =>
        x.id === o.id ? fitGraphOpeningOnEdge(st.wallGraph, toggleGraphOpeningType(x)) : x,
      ),
    }
  },
  cycleOpeningStyle(r, st) {
    if (!st.graphOpenings.length) return null
    const o = pick(r, st.graphOpenings)
    return {
      ...st,
      graphOpenings: st.graphOpenings.map((x) => {
        if (x.id !== o.id) return x
        const next = x.type === 'window' ? cycleWindowStyleOpening(x) : cycleDoorStyleOpening(x)
        return fitGraphOpeningOnEdge(st.wallGraph, next)
      }),
    }
  },
  flipSwing(r, st) {
    if (!st.graphOpenings.length) return null
    const o = pick(r, st.graphOpenings)
    return {
      ...st,
      graphOpenings: st.graphOpenings.map((x) =>
        x.id === o.id ? flipGraphOpeningSwing(x) : x,
      ),
    }
  },

  // ── 分区 ──
  addZone(r, st) {
    // 画一个随机矩形分区（UI 是逐点圈选，闭合后等价于一条多边形链）
    const x = 60 + r() * 300
    const y = 60 + r() * 250
    const w = 40 + r() * 160
    const h = 40 + r() * 160
    const chain = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ]
    const zone = createZoneFromChain(chain, undefined, st.zones)
    if (!zone) return null
    return { ...st, zones: [...st.zones, zone] }
  },
  removeZone(r, st) {
    if (!st.zones.length) return null
    const z = pick(r, st.zones)
    // state.svelte.js: removeZone —— 只过滤 zones，不碰引用它的家具/视角/储藏区
    return { ...st, zones: st.zones.filter((x) => x.id !== z.id) }
  },
  moveZoneVertex(r, st) {
    if (!st.zones.length) return null
    const z = pick(r, st.zones)
    const idx = Math.floor(r() * z.polygon.length)
    const pt = randPt(r, st.wallGraph)
    const snapped = snapGraphPoint(pt.x, pt.y, st.wallGraph.pxPerFt)
    return {
      ...st,
      zones: st.zones.map((x) =>
        x.id === z.id
          ? { ...x, polygon: x.polygon.map((p, i) => (i === idx ? snapped : p)) }
          : x,
      ),
    }
  },

  // ── 家具 ──
  addPlacement(r, st) {
    const kind = pick(r, Object.keys(PLACEMENT_KINDS))
    const pt = randPt(r, st.wallGraph)
    const created = createPlacement(kind, pt.x, pt.y, st.zones, st.placements, PX_PER_FT)
    if (!created) return null
    const vp = buildFromWallGraph(st.wallGraph, st).viewport
    const at = clampPlacementRect(created.x, created.y, created.w, created.h, vp)
    return { ...st, placements: [...st.placements, { ...created, ...at }] }
  },
  removePlacement(r, st) {
    if (!st.placements.length) return null
    const p = pick(r, st.placements)
    // state.svelte.js: removePlacement —— 会把指向它的储藏区解绑
    return {
      ...st,
      placements: st.placements.filter((x) => x.id !== p.id),
      storageZones: st.storageZones.map((sz) =>
        sz.placementId === p.id
          ? { ...sz, placementId: undefined, zoneId: undefined }
          : sz,
      ),
    }
  },
  movePlacement(r, st) {
    if (!st.placements.length) return null
    const p = pick(r, st.placements)
    const pt = randPt(r, st.wallGraph)
    const snapped = snapGraphPoint(pt.x, pt.y, st.wallGraph.pxPerFt)
    const vp = buildFromWallGraph(st.wallGraph, st).viewport
    return {
      ...st,
      placements: st.placements.map((x) => {
        if (x.id !== p.id) return x
        const at = clampPlacementRect(snapped.x - x.w / 2, snapped.y - x.h / 2, x.w, x.h, vp)
        const zone = findZoneAtPoint(st.zones, { x: at.x + x.w / 2, y: at.y + x.h / 2 })
        return { ...x, x: at.x, y: at.y, zoneId: zone?.id }
      }),
    }
  },
  rotatePlacement(r, st) {
    if (!st.placements.length) return null
    const p = pick(r, st.placements)
    return {
      ...st,
      placements: st.placements.map((x) => (x.id === p.id ? rotatePlacement(x) : x)),
    }
  },

  // ── 视角 ──
  addViewpoint(r, st) {
    const pt = randPt(r, st.wallGraph)
    const vp = createViewpoint(pt.x, pt.y, st.zones, st.viewpoints)
    if (!vp) return null
    return { ...st, viewpoints: [...st.viewpoints, vp] }
  },
  moveViewpoint(r, st) {
    if (!st.viewpoints.length) return null
    const v = pick(r, st.viewpoints)
    const pt = randPt(r, st.wallGraph)
    const snapped = snapGraphPoint(pt.x, pt.y, st.wallGraph.pxPerFt)
    const zone = findZoneAtPoint(st.zones, snapped)
    return {
      ...st,
      viewpoints: st.viewpoints.map((x) =>
        x.id === v.id ? { ...x, x: snapped.x, y: snapped.y, zoneId: zone?.id } : x,
      ),
    }
  },
  turnViewpoint(r, st) {
    if (!st.viewpoints.length) return null
    const v = pick(r, st.viewpoints)
    const heading = normalizeHeading(r() * 720 - 180)
    return {
      ...st,
      viewpoints: st.viewpoints.map((x) => (x.id === v.id ? { ...x, heading } : x)),
    }
  },
  removeViewpoint(r, st) {
    if (!st.viewpoints.length) return null
    const v = pick(r, st.viewpoints)
    return { ...st, viewpoints: st.viewpoints.filter((x) => x.id !== v.id) }
  },

  // ── 储藏指派 ──
  assignStorage(r, st) {
    const sz = pick(r, st.storageZones)
    const toPlacement = r() < 0.5 && st.placements.length
    const target = toPlacement
      ? { placementId: pick(r, st.placements).id, zoneId: undefined }
      : st.zones.length
        ? { zoneId: pick(r, st.zones).id, placementId: undefined }
        : null
    if (!target) return null
    return {
      ...st,
      storageZones: st.storageZones.map((x) =>
        x.code === sz.code ? { ...x, ...target } : x,
      ),
    }
  },
  unassignStorage(r, st) {
    const sz = pick(r, st.storageZones)
    return {
      ...st,
      storageZones: st.storageZones.map((x) =>
        x.code === sz.code ? { ...x, zoneId: undefined, placementId: undefined } : x,
      ),
    }
  },
}

// 权重：建造类多一点，保证状态长得起来；删除类留足，才撞得到引用完整性
const WEIGHTED = [
  ...Array(4).fill('addWall'),
  ...Array(4).fill('addOpening'),
  ...Array(3).fill('dragOpening'),
  ...Array(3).fill('moveVertex'),
  ...Array(2).fill('splitWall'),
  ...Array(2).fill('removeWall'),
  'toggleOpeningKind',
  'cycleOpeningStyle',
  'flipSwing',
  ...Array(3).fill('addZone'),
  ...Array(2).fill('removeZone'),
  'moveZoneVertex',
  ...Array(3).fill('addPlacement'),
  ...Array(2).fill('removePlacement'),
  ...Array(2).fill('movePlacement'),
  'rotatePlacement',
  ...Array(2).fill('addViewpoint'),
  'moveViewpoint',
  'turnViewpoint',
  'removeViewpoint',
  ...Array(3).fill('assignStorage'),
  'unassignStorage',
]

/** @type {Map<string, { count: number, sample: any }>} */
const findings = new Map()
let runsOk = 0

for (let run = 0; run < RUNS; run++) {
  const seed = SEED0 + run
  const r = rng(seed)
  let st = seedState(r)
  const history = []
  let broke = false

  for (let i = 0; i < OPS && !broke; i++) {
    const name = pick(r, WEIGHTED)
    const before = clone(st)
    let next
    try {
      next = OPS_TABLE[name](r, st)
    } catch (err) {
      record('EX-THROW', `${name} 抛错：${err.message}`, { seed, history: [...history, name], err: err.stack })
      broke = true
      break
    }
    if (!next) continue

    // 纯函数性：输入不得被就地改写
    if (JSON.stringify(before) !== JSON.stringify(st)) {
      record('P-MUTATED-INPUT', `${name} 就地改写了入参`, { seed, history: [...history, name] })
      broke = true
      break
    }

    // 真实链路：每个编辑都走 applyEditSource → hydrateProject → buildFromWallGraph，
    // 落回 state 的是 hydrate 之后的结果。少了这步就测不到中央兜底。
    try {
      const built = buildFromWallGraph(next.wallGraph, next)
      next = {
        wallGraph: built.wallGraph,
        graphOpenings: built.graphOpenings,
        zones: built.zones,
        placements: built.placements,
        viewpoints: built.viewpoints,
        storageZones: built.storageZones,
      }
    } catch (err) {
      record('R-THROW', `hydrate 抛错：${err.message}`, { seed, history: [...history, name], err: err.stack })
      broke = true
      break
    }

    history.push(name)
    st = next
    const bad = checkInvariants(st).filter(([tag]) => !IGNORE.has(tag))
    if (bad.length) {
      for (const [tag, msg] of bad)
        record(tag, msg, { seed, history: [...history], op: name, state: st })
      broke = true
    }
  }
  if (!broke) runsOk++
}

function record(tag, msg, ctx) {
  const cur = findings.get(tag)
  if (cur) {
    cur.count++
    // 保留 history 最短的复现，最好定位
    if (ctx.history && ctx.history.length < cur.sample.history.length)
      cur.sample = { msg, ...ctx }
    return
  }
  findings.set(tag, { count: 1, sample: { msg, ...ctx } })
}

// --- 报告 ---
console.log(`\n压力测试：${RUNS} 轮 × ${OPS} ops，seed ${SEED0}..${SEED0 + RUNS - 1}`)
console.log(`干净跑完：${runsOk}/${RUNS}\n`)

if (!findings.size) {
  console.log('✅ 未发现不变量违例')
  process.exit(0)
}

const order = [...findings.entries()].sort((a, b) => b[1].count - a[1].count)
let failed = 0
for (const [tag, { count, sample }] of order) {
  const accepted = ACCEPTED.has(tag)
  if (!accepted) failed++
  console.log(`${accepted ? '⚠️ ' : '❌'} ${tag}  ×${count}${accepted ? '（已知限制，不判失败）' : ''}`)
  console.log(`   ${sample.msg}`)
  console.log(`   seed=${sample.seed}  ops=${sample.history?.length}`)
  console.log(`   复现路径: ${sample.history?.join(' → ')}`)
  if (VERBOSE && sample.err) console.log(sample.err)
  console.log()
}
if (!failed) console.log('✅ 无不变量违例（仅剩已知限制）')
process.exit(failed ? 1 : 0)
