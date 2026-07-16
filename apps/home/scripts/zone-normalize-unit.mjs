#!/usr/bin/env node
/**
 * 扫描分区归一化的纯逻辑断言(无需浏览器)。
 * 运行:npm run test:zone-normalize
 *
 * 背景:iOS 扫描/云端优化副本的 zones 按房间种子就近瓜分地面,多边形斜穿墙体
 * (508 实测)。normalizeScanZones 要把它们吸附到墙图检测出的房间面;吸不上
 * 又跨面的标 stale;开放空间里的功能划分(没穿墙)必须原样保留。
 */
import { normalizeScanZones } from '../src/lib/spatial/zone-normalize.js'
import { fenceDividerSegments } from '../src/lib/spatial/placements.js'

const P = 36 // pxPerFt

/** @param {[string, number, number][]} verts @param {[string, string][]} edges */
const graph = (verts, edges) => ({
  pxPerFt: P,
  margin: { x: 0, y: 0 },
  vertices: verts.map(([id, x, y]) => ({ id, x: x * P, y: y * P })),
  edges: edges.map(([a, b], i) => ({ id: `e${i}`, a, b })),
})

/** 英尺多边形 → px */
const poly = (...pts) => pts.map(([x, y]) => ({ x: x * P, y: y * P }))

/** @param {{ x: number, y: number }[]} pg 多边形 bbox(英尺,取整) */
const bboxFt = (pg) => {
  const xs = pg.map((p) => p.x / P)
  const ys = pg.map((p) => p.y / P)
  return [
    Math.round(Math.min(...xs)), Math.round(Math.min(...ys)),
    Math.round(Math.max(...xs)), Math.round(Math.max(...ys)),
  ]
}

let pass = 0
let fail = 0

/** @param {string} name @param {unknown} got @param {unknown} want */
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) {
    pass++
    console.log(`✅ ${name} → ${JSON.stringify(got)}`)
  } else {
    fail++
    console.log(`❌ ${name} → ${JSON.stringify(got)} (want ${JSON.stringify(want)})`)
  }
}

// 两间 10×10 并排,中间实体隔墙(a-b-c 顶边,f-e-d 底边,b-e 隔墙)
const twoRooms = () =>
  graph(
    [
      ['a', 0, 0], ['b', 10, 0], ['c', 20, 0],
      ['d', 20, 10], ['e', 10, 10], ['f', 0, 10],
    ],
    [
      ['a', 'b'], ['b', 'c'], ['c', 'd'],
      ['d', 'e'], ['e', 'f'], ['f', 'a'], ['b', 'e'],
    ],
  )

// ---- 1. 斜穿墙的分区吸附到房间面 ----
{
  const { zones, report } = normalizeScanZones({
    wallGraph: twoRooms(),
    zones: [
      // 甲:主体在左间,一角斜插进右间(就近瓜分的典型产物)
      { id: 'z-1', nameZh: '甲', polygon: poly([1, 1], [11, 1], [12, 5], [1, 9]) },
      // 乙:主体在右间
      { id: 'z-2', nameZh: '乙', polygon: poly([11, 0.5], [19.5, 0.5], [19.5, 9.5], [11, 9.5]) },
    ],
  })
  check('吸附 — 报告', report, { snapped: ['甲', '乙'], flagged: [] })
  check('吸附 — 甲贴墙成左间', bboxFt(zones[0].polygon), [0, 0, 10, 10])
  check('吸附 — 乙贴墙成右间', bboxFt(zones[1].polygon), [10, 0, 20, 10])
  check('吸附 — stale 清零', zones.map((z) => Boolean(z.stale)), [false, false])
}

// ---- 2. 横跨两间、谁也不占大头的分区 → 标 stale 待确认 ----
{
  const { zones, report } = normalizeScanZones({
    wallGraph: twoRooms(),
    zones: [{ id: 'z-1', nameZh: '跨墙', polygon: poly([3, 2], [17, 2], [17, 8], [3, 8]) }],
  })
  check('跨面 — 标 stale', zones.map((z) => Boolean(z.stale)), [true])
  check('跨面 — 报告', report, { snapped: [], flagged: ['跨墙'] })
  check(
    '跨面 — 多边形不动(只提示,不猜)',
    bboxFt(zones[0].polygon),
    [3, 2, 17, 8],
  )
}

// ---- 3. 开放空间里的功能划分(没穿墙)原样保留 ----
{
  const openBox = graph(
    [['a', 0, 0], ['b', 20, 0], ['c', 20, 10], ['d', 0, 10]],
    [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']],
  )
  const kitchen = poly([0, 0], [12, 0], [8, 10], [0, 10]) // 斜缝是功能分界,合法
  const dining = poly([12, 0], [20, 0], [20, 10], [8, 10])
  const { zones, report } = normalizeScanZones({
    wallGraph: openBox,
    zones: [
      { id: 'z-1', nameZh: '厨房', polygon: kitchen },
      { id: 'z-2', nameZh: '餐区', polygon: dining },
    ],
  })
  check('开放划分 — 不吸附不标记', report, { snapped: [], flagged: [] })
  check(
    '开放划分 — 多边形原样',
    zones.map((z) => bboxFt(z.polygon)),
    [[0, 0, 12, 10], [8, 0, 20, 10]],
  )
}

// ---- 4. 围栏隔断参与分面:狗区被栏板切出来,分区各自贴到半间 ----
{
  const openBox = graph(
    [['a', 0, 0], ['b', 20, 0], ['c', 20, 10], ['d', 0, 10]],
    [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']],
  )
  // 6″ 厚栏板贯通 x=10(placement 存 px)
  const fence = { id: 'pl-1', kind: 'pet_pen', x: 10 * P - 9, y: 0, w: 18, h: 10 * P }
  const { zones, report } = normalizeScanZones({
    wallGraph: openBox,
    placements: [fence],
    zones: [
      { id: 'z-1', nameZh: '狗区', polygon: poly([0.5, 0.5], [11, 0.5], [8, 9.5], [0.5, 9.5]) },
      { id: 'z-2', nameZh: '客厅', polygon: poly([11, 0.5], [19.5, 0.5], [19.5, 9.5], [8, 9.5]) },
    ],
  })
  check('围栏分面 — 报告', report, { snapped: ['狗区', '客厅'], flagged: [] })
  check(
    '围栏分面 — 各自贴到半间',
    zones.map((z) => bboxFt(z.polygon)),
    [[0, 0, 10, 10], [10, 0, 20, 10]],
  )
}

// ---- 5. fenceDividerSegments 本体:细长是隔断,围圈不是 ----
{
  const thin = { id: 'p1', kind: 'pet_pen', x: 0, y: 0, w: 18, h: 360 }
  const pen = { id: 'p2', kind: 'pet_pen', x: 0, y: 0, w: 108, h: 108 }
  const sofa = { id: 'p3', kind: 'sofa', x: 0, y: 0, w: 18, h: 360 }
  check('隔断判定 — 细长围栏 1 段', fenceDividerSegments([thin], P).length, 1)
  check('隔断判定 — 围圈 0 段', fenceDividerSegments([pen], P).length, 0)
  check('隔断判定 — 非围栏 0 段', fenceDividerSegments([sofa], P).length, 0)
  check(
    '隔断判定 — 中轴线沿长轴',
    fenceDividerSegments([thin], P)[0],
    { a: { x: 9, y: 0 }, b: { x: 9, y: 360 } },
  )
}

// ---- 6. 防御:没墙图/没分区原样返回 ----
{
  const z = [{ id: 'z-1', nameZh: '孤区', polygon: poly([0, 0], [5, 0], [5, 5], [0, 5]) }]
  check(
    '防御 — 无墙图原样返回',
    normalizeScanZones({ wallGraph: null, zones: z }).zones.length,
    1,
  )
  check(
    '防御 — 无分区原样返回',
    normalizeScanZones({ wallGraph: twoRooms(), zones: [] }).zones.length,
    0,
  )
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
