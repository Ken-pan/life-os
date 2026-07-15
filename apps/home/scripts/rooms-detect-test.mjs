#!/usr/bin/env node
/**
 * 墙图闭合环 → 房间识别的纯逻辑断言（无需浏览器）。
 * 运行：npm run test:rooms
 */
import {
  detectRooms,
  polygonInteriorPoint,
} from '../src/lib/spatial/rooms-from-graph.js'
import { pointInPolygon, zoneCentroid } from '../src/lib/spatial/zones.js'

const P = 36 // pxPerFt

/** @param {[string, number, number][]} verts @param {[string, string][]} edges */
const graph = (verts, edges) => ({
  pxPerFt: P,
  margin: { x: 0, y: 0 },
  vertices: verts.map(([id, x, y]) => ({ id, x: x * P, y: y * P })),
  edges: edges.map(([a, b], i) => ({ id: `e${i}`, a, b })),
})

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

/** @param {ReturnType<typeof graph>} g */
const areas = (g) => detectRooms(g).map((r) => Math.round(r.areaSqFt))

// 10×10 单间
check(
  '正方形 → 1 间',
  areas(
    graph(
      [['a', 0, 0], ['b', 10, 0], ['c', 10, 10], ['d', 0, 10]],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']],
    ),
  ),
  [100],
)

// 20×10 中间一道隔墙（隔墙端点是共享顶点）
check(
  '一分为二 → 2 间',
  areas(
    graph(
      [
        ['a', 0, 0], ['b', 10, 0], ['c', 20, 0],
        ['d', 20, 10], ['e', 10, 10], ['f', 0, 10],
      ],
      [
        ['a', 'b'], ['b', 'c'], ['c', 'd'],
        ['d', 'e'], ['e', 'f'], ['f', 'a'], ['b', 'e'],
      ],
    ),
  ),
  [100, 100],
)

// 悬空墙围不出房间，必须被剥掉
check(
  '悬空墙剥离 → 仍 1 间',
  areas(
    graph(
      [['a', 0, 0], ['b', 10, 0], ['c', 10, 10], ['d', 0, 10], ['x', 5, 5]],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'], ['a', 'x']],
    ),
  ),
  [100],
)

// T 型接头：隔墙端点顶在外墙中段，不是外墙的顶点。
// 这是最常见的画法——addWallSegment 不会切分被顶到的边，靠 planarize 补刀。
check(
  'T 型接头 → 2 间',
  areas(
    graph(
      [
        ['a', 0, 0], ['b', 10, 0], ['c', 10, 10], ['d', 0, 10],
        ['t1', 5, 0], ['t2', 5, 10],
      ],
      [
        ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'],
        ['t1', 't2'], // 两端都只是「落在」外墙上
      ],
    ),
  ),
  [50, 50],
)

// 真交叉：两墙相交却无共享顶点
check(
  '交叉墙 planarize → 4 间',
  areas(
    graph(
      [
        ['a', 0, 0], ['b', 10, 0], ['c', 10, 10], ['d', 0, 10],
        ['h1', 0, 5], ['h2', 10, 5], ['v1', 5, 0], ['v2', 5, 10],
      ],
      [
        ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'],
        ['h1', 'h2'], ['v1', 'v2'],
      ],
    ),
  ),
  [25, 25, 25, 25],
)

// 凹多边形
check(
  'L 形 → 1 间 75',
  areas(
    graph(
      [
        ['a', 0, 0], ['b', 10, 0], ['c', 10, 5],
        ['d', 5, 5], ['e', 5, 10], ['f', 0, 10],
      ],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'a']],
    ),
  ),
  [75],
)

// 面积过小的环不算房间（默认阈值 3 sq ft）
check(
  '1×1 环 → 滤除',
  areas(
    graph(
      [['a', 0, 0], ['b', 1, 0], ['c', 1, 1], ['d', 0, 1]],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']],
    ),
  ),
  [],
)

// 退化输入
check('单边 → 0 间', areas(graph([['a', 0, 0], ['b', 10, 0]], [['a', 'b']])), [])
check('空图 → 0 间', areas(graph([], [])), [])

// --- polygonInteriorPoint ---
// 凹多边形是重点：顶点均值（zoneCentroid）会落在多边形外，
// 拿它判「这个房间是否已有分区」会永远判否 → 每次识别都重复建区。

const L = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 },
  { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 },
]
const U = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 7, y: 10 },
  { x: 7, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 10 }, { x: 0, y: 10 },
]
const SQ = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
]

check('内部点 — 凸形在内', pointInPolygon(polygonInteriorPoint(SQ), SQ), true)
check('内部点 — L 形在内', pointInPolygon(polygonInteriorPoint(L), L), true)
check('内部点 — U 形在内', pointInPolygon(polygonInteriorPoint(U), U), true)

// 回归护栏：证明旧做法确实是坏的，别有人「优化」回顶点均值
check('回归 — 顶点均值对 L 形失效', pointInPolygon(zoneCentroid(L), L), false)
check('回归 — 顶点均值对 U 形失效', pointInPolygon(zoneCentroid(U), U), false)

// 退化多边形不应抛异常
check('内部点 — 空多边形', polygonInteriorPoint([]), { x: 0, y: 0 })
check(
  '内部点 — 两点退化',
  polygonInteriorPoint([{ x: 0, y: 0 }, { x: 4, y: 2 }]),
  { x: 2, y: 1 },
)

// detectRoomCandidates 的去重语义：识别出的房间内部点必须落在「自己」这个环内，
// 否则第二次点识别会重复建区。用真实检测结果而非手写多边形来验。
{
  const g = graph(
    [
      ['a', 0, 0], ['b', 10, 0], ['c', 10, 5],
      ['d', 5, 5], ['e', 5, 10], ['f', 0, 10],
    ],
    [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'a']],
  )
  const rooms = detectRooms(g)
  const inside = rooms.map((r) =>
    pointInPolygon(polygonInteriorPoint(r.polygon), r.polygon),
  )
  check('去重语义 — L 形房间内部点落在自身环内', inside, [true])
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
