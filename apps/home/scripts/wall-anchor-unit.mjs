/**
 * 墙相对锚点单测(能力 6)—— 「桌子真的被挪了 40cm」判断的地基。
 * Usage: node apps/home/scripts/wall-anchor-unit.mjs
 */
import assert from 'node:assert/strict'
import {
  computeWallAnchor,
  diffWallAnchors,
  refreshWallAnchors,
  wallAnchorSegments,
} from '../src/lib/spatial/wall-anchor.js'
import { hydrateProject } from '../src/lib/spatial/model.js'
import { mergeFurnitureWithIdentity } from '../src/lib/spatial/scan-merge.js'

/* ---- 测试户型:10ft × 8ft 单间,36px/ft ---- */

const PX = 36 // px per ft
const graph = {
  pxPerFt: PX,
  margin: { x: 0, y: 0 },
  vertices: [
    { id: 'v-1', x: 0, y: 0 },
    { id: 'v-2', x: 360, y: 0 },
    { id: 'v-3', x: 360, y: 288 },
    { id: 'v-4', x: 0, y: 288 },
    // 斜墙端点(用于「非轴对齐跳过」)
    { id: 'v-5', x: 100, y: 100 },
  ],
  edges: [
    { id: 'wg-top', a: 'v-1', b: 'v-2', exterior: true },
    { id: 'wg-right', a: 'v-2', b: 'v-3', exterior: true },
    { id: 'wg-bottom', a: 'v-3', b: 'v-4', exterior: true },
    { id: 'wg-left', a: 'v-4', b: 'v-1', exterior: true },
    { id: 'wg-skew', a: 'v-1', b: 'v-5' }, // 45° 斜墙
  ],
}
const segs = wallAnchorSegments(graph)

/* ---- wallAnchorSegments ---- */

assert.equal(segs.length, 4, '斜墙不轴对齐,跳过')
assert.ok(segs.every((s) => s.edgeId.startsWith('wg-')), '墙段带 edgeId')
const left = segs.find((s) => s.edgeId === 'wg-left')
assert.deepEqual(
  { vertical: left.vertical, at: left.at, lo: left.lo, hi: left.hi },
  { vertical: true, at: 0, lo: 0, hi: 288 },
  '顶点顺序无关,lo/hi 归一',
)

/* ---- computeWallAnchor ---- */

// 贴左墙的矮柜:x=6px(2″),y=108px,36×72px —— 上下墙各 36″,纵向够不着
const bookcase = { x: 6, y: 108, w: 36, h: 72 }
const a1 = computeWallAnchor(bookcase, 0, segs, PX)
assert.equal(a1.x.edgeId, 'wg-left')
assert.equal(a1.x.side, 'left')
assert.equal(a1.x.gapIn, 2)
assert.equal(a1.x.alongIn, 36, '沿墙距离 = 墙段 lo 端到家具近端(108px = 36″)')
assert.equal(a1.y, undefined, '上下墙都在 30″ 外,纵向不锚')
assert.equal(a1.rotation, 0)

// 屋子正中的茶几:哪面墙都不贴 → 没有锚(硬记 6ft 的"墙距"只是噪声)
assert.equal(computeWallAnchor({ x: 150, y: 120, w: 60, h: 48 }, 0, segs, PX), null)

// 角落的柜子:两个轴都锚,且各取更近的一侧
const corner = computeWallAnchor({ x: 300, y: 250, w: 54, h: 32 }, 90, segs, PX)
assert.equal(corner.x.side, 'right')
assert.equal(corner.x.edgeId, 'wg-right')
assert.equal(corner.x.gapIn, 2)
assert.equal(corner.y.side, 'down')
assert.equal(corner.y.gapIn, 2)
assert.equal(corner.rotation, 90)

// 轻微穿模(扫描清洗的正常副作用)容忍并钳到 0;穿得深说明找错墙,不锚
assert.equal(computeWallAnchor({ x: -3, y: 108, w: 36, h: 72 }, 0, segs, PX).x.gapIn, 0)
const sunk = computeWallAnchor({ x: -12, y: 108, w: 36, h: 72 }, 0, segs, PX)
assert.ok(!sunk || !sunk.x, '穿模 4″ 超出容忍,不认这面墙')

/* ---- diffWallAnchors:挪了 vs 漂了 ---- */

// 矮柜(36×72px):y ∈ [96,120] 时上下墙都 >30″,只有横向锚
const at = (x, y, rot = 0) => computeWallAnchor({ x, y, w: 36, h: 72 }, rot, segs, PX)

// 同一位置 → 没挪
assert.deepEqual(diffWallAnchors(at(6, 108), at(6, 108)), {
  verdict: 'unchanged',
  shiftIn: 0,
  turned: false,
})

// 墙距差 1″(2.5cm,配准残差级)→ 仍算没挪
assert.equal(diffWallAnchors(at(6, 108), at(9, 108)).verdict, 'unchanged')

// 3″(7.6cm)→ 证据不足,不硬下结论
assert.equal(diffWallAnchors(at(6, 108), at(15, 108)).verdict, 'ambiguous')

// 离墙 2″ → 17.7″:桌子真的被挪了 40cm(47.24px = 15.75″)
const moved = diffWallAnchors(at(5.9, 108), at(53.1, 108))
assert.equal(moved.verdict, 'moved')
assert.ok(Math.abs(moved.shiftIn - 15.7) < 0.2, `40cm ≈ 15.7″,得 ${moved.shiftIn}`)

// 贴着同一面墙滑动(gap 不变):该轴的沿墙距离兜住另一个方向的位移
const slid = diffWallAnchors(at(6, 96), at(6, 120))
assert.equal(slid.verdict, 'moved')
assert.equal(slid.shiftIn, 8, '沿墙滑了 24px = 8″')

// 转了 90° 就是挪过,哪怕中心没动
const turned = diffWallAnchors(at(6, 108, 0), at(6, 108, 90))
assert.equal(turned.verdict, 'moved')
assert.equal(turned.turned, true)

// 换了锚定墙(左墙 → 右墙)且没有别的轴可量:位移说不出数,
// 但绝不能说没挪 —— 保守给 ambiguous
const reanchored = diffWallAnchors(at(6, 108), at(318, 108))
assert.equal(reanchored.verdict, 'ambiguous')
assert.equal(reanchored.shiftIn, null)

// 有第二个轴的锚时,换墙的位移能从那个轴的沿墙距离量出来:
// 高书柜(y 锚在顶墙)从左墙搬到右墙 → 沿顶墙的距离差就是横向位移
const tall = (x) => computeWallAnchor({ x, y: 72, w: 36, h: 144 }, 0, segs, PX)
const crossRoom = diffWallAnchors(tall(6), tall(318))
assert.equal(crossRoom.verdict, 'moved')
assert.equal(crossRoom.shiftIn, 104, '318px-6px = 312px = 104″')

// 任一侧没有锚 → unknown,这套判断帮不上忙
assert.equal(diffWallAnchors(null, at(6, 108)).verdict, 'unknown')
assert.equal(diffWallAnchors(at(6, 108), null).verdict, 'unknown')

/* ---- refreshWallAnchors:幂等 ---- */

const placements = [
  { id: 'p-1', kind: 'cabinet', label: '矮柜', x: 6, y: 108, w: 36, h: 72, rotation: 0 },
  { id: 'p-2', kind: 'coffee_table', label: '茶几', x: 150, y: 120, w: 60, h: 48, rotation: 0 },
]
const r1 = refreshWallAnchors(placements, graph)
assert.notEqual(r1, placements, '首次回填有变化,换数组')
assert.equal(r1[0].wallAnchor.x.edgeId, 'wg-left')
assert.equal(r1[1].wallAnchor, undefined, '居中家具不带锚字段')

const r2 = refreshWallAnchors(r1, graph)
assert.equal(r2, r1, '无变化时必须原样返回同一数组 —— hydrate 每次编辑都跑')

// 家具被拖离墙 → 锚字段整个摘掉,不留陈旧关系
const dragged = r1.map((p) => (p.id === 'p-1' ? { ...p, x: 150 } : p))
const r3 = refreshWallAnchors(dragged, graph)
assert.equal(r3[0].wallAnchor, undefined)
assert.equal(r3[1], r1[1], '没动的对象保持同一引用')

// 没有墙图(508 参数模式)不算锚:手录墙不配当跨扫描真值
assert.equal(refreshWallAnchors(placements, null), placements)

/* ---- hydrateProject 集成:墙图模式自动维护 ---- */

const project = hydrateProject({
  schemaVersion: 5,
  meta: { id: 't', nameZh: '测试' },
  layoutMode: 'wallGraph',
  wallGraph: graph,
  rooms: [],
  walls: [],
  openings: [],
  furniture: [],
  storageZones: [],
  furnitureInventory: [],
  placements,
  viewpoints: [],
})
assert.equal(project.placements[0].wallAnchor.x.gapIn, 2, 'hydrate 自动回填')
const again = hydrateProject(project)
assert.equal(again.placements[0], project.placements[0], '重复 hydrate 不churn对象')

/* ---- mergeFurnitureWithIdentity:moved 条目带墙锚裁决 ---- */

const prevScan = {
  id: 'scan-sofa',
  kind: 'sofa',
  label: '沙发',
  x: 6,
  y: 72,
  w: 36,
  h: 144,
  rotation: 0,
}
const base = { ...project, placements: [prevScan] }
// 同一张沙发,这次量到离墙 47″ 多(≈ 挪了 40cm)
const incoming = { ...prevScan, id: 'scan-new-1', x: 49.6 }
const { identity } = mergeFurnitureWithIdentity(base, {
  placements: [incoming],
  fixtures: [],
  viewpoints: [],
})
assert.equal(identity.moved.length, 1)
assert.equal(identity.moved[0].wall.verdict, 'moved', '墙距变了 40cm:真挪了')
assert.ok(identity.moved[0].wall.shiftIn > 14)

console.log('wall-anchor-unit: all assertions passed')
