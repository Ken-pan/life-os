#!/usr/bin/env node
/**
 * 吸附引擎断言（无需浏览器）。
 * 运行：npm run test:snap
 */
import {
  resolveSnap,
  pointAtLength,
  parseLengthInput,
} from '../src/lib/spatial/snap.js'

const P = 36 // pxPerFt，网格步长 = 3px = 1″

/** @param {[string, number, number][]} [verts] @param {[string, string][]} [edges] */
const graph = (verts = [], edges = []) => ({
  pxPerFt: P,
  margin: { x: 0, y: 0 },
  vertices: verts.map(([id, x, y]) => ({ id, x, y })),
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

const r1 = (n) => Math.round(n * 10) / 10

// --- 角度吸附 ---

// 19.8° 的落点应吸到 15°；且长度取整后角度必须**仍然精确**是 15°
{
  const r = resolveSnap({ x: 0, y: 0 }, { x: 100, y: 36 }, graph(), {
    angleSnapDeg: 15,
  })
  check('15° 吸附 — 角度精确', r1(r.angleDeg), 15)
  check('15° 吸附 — snapKind', r.snapKind, 'angle')
  // 长度必须落在 1″ 网格上（沿射线，而非 x/y 各自取整）
  check(
    '15° 吸附 — 长度整寸',
    Math.abs(r.lengthIn - Math.round(r.lengthIn)) < 1e-6,
    true,
  )
}

// 45° 增量
check(
  '45° 吸附',
  r1(
    resolveSnap({ x: 0, y: 0 }, { x: 100, y: 90 }, graph(), {
      angleSnapDeg: 45,
    }).angleDeg,
  ),
  45,
)

// Shift 正交 = 90° 增量，保持原有行为
{
  const r = resolveSnap({ x: 0, y: 0 }, { x: 100, y: 36 }, graph(), {
    angleSnapDeg: 15,
    ortho: true,
  })
  check('Shift 正交 — 角度归零', r1(r.angleDeg), 0)
  check('Shift 正交 — 落点', [r1(r.x), r1(r.y)], [99, 0])
}

// Alt 自由角度：不约束角度，x/y 各自吸 1″ 网格
{
  const r = resolveSnap({ x: 0, y: 0 }, { x: 100, y: 36 }, graph(), {
    angleSnapDeg: 15,
    freeAngle: true,
  })
  check('自由角度 — 网格取整', [r1(r.x), r1(r.y)], [99, 36])
  check('自由角度 — snapKind', r.snapKind, 'grid')
}

// 关闭角度吸附（增量 0）等价于自由角度
check(
  '增量 0 = 关闭',
  resolveSnap({ x: 0, y: 0 }, { x: 100, y: 36 }, graph(), { angleSnapDeg: 0 })
    .snapKind,
  'grid',
)

// --- 顶点吸附 ---

{
  const g = graph([['v1', 100, 30]])
  const r = resolveSnap(null, { x: 103, y: 32 }, g, {})
  check('顶点吸附 — 落点', [r.x, r.y], [100, 30])
  check('顶点吸附 — snapKind', r.snapKind, 'vertex')
  check('顶点吸附 — vertexId', r.vertexId, 'v1')
}

// 顶点吸附优先于角度吸附
{
  const g = graph([['v1', 100, 30]])
  const r = resolveSnap({ x: 0, y: 0 }, { x: 103, y: 32 }, g, {
    angleSnapDeg: 15,
  })
  check('顶点吸附优先于角度', [r.x, r.y], [100, 30])
}

// 拖顶点时排除自身，否则会自吸
{
  const g = graph([['v1', 100, 30]])
  const r = resolveSnap(null, { x: 101, y: 31 }, g, { excludeVertexId: 'v1' })
  check('排除自身顶点', r.snapKind, 'grid')
}

// --- 对齐追踪 ---

{
  const g = graph([['v1', 100, 30]])
  const r = resolveSnap(null, { x: 102, y: 200 }, g, {})
  check('对齐追踪 — x 对齐', r1(r.x), 100)
  check('对齐追踪 — snapKind', r.snapKind, 'align')
  check('对齐追踪 — 参考线', r.guides.map((g) => g.kind), ['vertical'])
}

// 边中点也是对齐锚点
{
  const g = graph(
    [['a', 0, 0], ['b', 100, 0]],
    [['a', 'b']],
  )
  const r = resolveSnap(null, { x: 52, y: 200 }, g, {})
  check('中点对齐', r1(r.x), 50)
  check('中点对齐 — 来源', r.guides[0].source, 'midpoint')
}

// 角度射线 × 对齐参考线的交汇点
{
  const g = graph([['v1', 90, 500]])
  const r = resolveSnap({ x: 0, y: 0 }, { x: 88, y: 2 }, g, {
    angleSnapDeg: 15,
  })
  check('射线×参考线交汇 — x', r1(r.x), 90)
  check('射线×参考线交汇 — snapKind', r.snapKind, 'align')
}

// --- 精确长度 ---

check('pointAtLength 12′', pointAtLength({ x: 0, y: 0 }, { x: 10, y: 0 }, 144, P), {
  x: 432,
  y: 0,
})
check('pointAtLength 零长', pointAtLength({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, P), null)
check(
  'pointAtLength 同点',
  pointAtLength({ x: 5, y: 5 }, { x: 5, y: 5 }, 144, P),
  null,
)

check("parseLengthInput 12' 6\" 带空格", parseLengthInput(`12' 6"`), 150)
check("parseLengthInput 12'6 缺尾引号", parseLengthInput(`12'6`), 150)
check("parseLengthInput 0'6\"", parseLengthInput(`0'6"`), 6)
check('parseLengthInput 负数', parseLengthInput('-5'), null)
check('parseLengthInput 科学计数', parseLengthInput('1e3'), null)
check("parseLengthInput 12''", parseLengthInput(`12''`), null)
check('parseLengthInput 超长兜底', parseLengthInput('99999'), null)
check("parseLengthInput 12'6\"", parseLengthInput(`12'6"`), 150)
check("parseLengthInput 12'", parseLengthInput(`12'`), 144)
check('parseLengthInput 150"', parseLengthInput(`150"`), 150)
check('parseLengthInput 裸数字 = 英尺', parseLengthInput('12.5'), 150)
check('parseLengthInput 弯引号', parseLengthInput(`12’6”`), 150)
check('parseLengthInput 空', parseLengthInput('  '), null)
check('parseLengthInput 非法', parseLengthInput('abc'), null)
check('parseLengthInput 英寸溢出', parseLengthInput(`12'15"`), null)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
