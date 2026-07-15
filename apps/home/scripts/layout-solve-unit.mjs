/**
 * 布局求解器单测:硬约束(不重叠/不出区/动线只许更好)、确定性(同种子同解)、
 * 人造堵门/瓶颈必须被解掉、性能预算。
 * 户型走 buildFromWallGraph(与 circulation-unit 同一套 fixture 思路):
 * 12x10ft 卧室 + 8x10ft 客厅,隔墙带 32in 门。
 * Usage: node apps/home/scripts/layout-solve-unit.mjs
 */
import assert from 'node:assert/strict'
import {
  candidateSlots,
  circMetrics,
  directionZh,
  freeWallFt,
  LAYOUT_PROFILES,
  solveAllProfiles,
  solveLayout,
} from '../src/lib/spatial/layout-solve.js'
import { analyzeCirculation, CLEARANCE } from '../src/lib/spatial/circulation.js'
import { buildFromWallGraph } from '../src/lib/spatial/wall-graph.js'

const PX = 36
const ft = (v) => v * PX

function baseProject(overrides = {}) {
  const W = ft(20)
  const H = ft(10)
  const midX = ft(12)
  const graph = {
    pxPerFt: PX,
    margin: { x: 24, y: 24 },
    vertices: [
      { id: 'v1', x: 24, y: 24 },
      { id: 'v2', x: 24 + W, y: 24 },
      { id: 'v3', x: 24 + W, y: 24 + H },
      { id: 'v4', x: 24, y: 24 + H },
      { id: 'v5', x: 24 + midX, y: 24 },
      { id: 'v6', x: 24 + midX, y: 24 + H },
    ],
    edges: [
      { id: 'e1', a: 'v1', b: 'v5' },
      { id: 'e1b', a: 'v5', b: 'v2' },
      { id: 'e2', a: 'v2', b: 'v3' },
      { id: 'e3', a: 'v3', b: 'v6' },
      { id: 'e3b', a: 'v6', b: 'v4' },
      { id: 'e4', a: 'v4', b: 'v1' },
      { id: 'e5', a: 'v5', b: 'v6' }, // 隔墙
    ],
  }
  const zones = [
    {
      id: 'z-1',
      nameZh: '卧室',
      polygon: [
        { x: 24, y: 24 },
        { x: 24 + midX, y: 24 },
        { x: 24 + midX, y: 24 + H },
        { x: 24, y: 24 + H },
      ],
    },
    {
      id: 'z-2',
      nameZh: '客厅',
      polygon: [
        { x: 24 + midX, y: 24 },
        { x: 24 + W, y: 24 },
        { x: 24 + W, y: 24 + H },
        { x: 24 + midX, y: 24 + H },
      ],
    },
  ]
  const { placements, fixtures, ...rest } = overrides
  return {
    ...buildFromWallGraph(graph, {
      graphOpenings: [
        { id: 'op1', edgeId: 'e5', offsetIn: 54, spanIn: 32, type: 'door', style: 'swing' },
      ],
      zones,
      placements: placements ?? [],
      fixtures: fixtures ?? [],
      viewpoints: [],
      storageZones: [],
      meta: { id: 'test', nameZh: '测试' },
    }),
    ...rest,
  }
}

/* ---- 方向文案(y 向下、北向上) ---- */
assert.equal(directionZh(120, 0), '向东')
assert.equal(directionZh(-120, -80), '向北西')
assert.equal(directionZh(0, 60), '向南')
assert.equal(directionZh(2, 3), '原地')

/* ---- 候选位:全部在分区内、含两个朝向 ---- */
const squareZone = {
  id: 'z1',
  nameZh: '测试间',
  polygon: [
    { x: 0, y: 0 },
    { x: 432, y: 0 },
    { x: 432, y: 360 },
    { x: 0, y: 360 },
  ],
}
const sofaSample = { id: 'p1', kind: 'sofa', label: '沙发', x: 36, y: 36, w: 216, h: 90, rotation: 0 }
const slots = candidateSlots(sofaSample, squareZone)
assert.ok(slots.length > 20, `候选要够多,得到 ${slots.length}`)
assert.ok(slots.some((s) => s.rotDelta === 90), '要有转 90° 的候选')
for (const s of slots) {
  assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= 433 && s.y + s.h <= 361, '候选不出区')
}

/* ---- 场景 A:沙发+柜子夹出 18in 瓶颈,best_flow 必须拓宽 ---- */
{
  const p = baseProject({
    placements: [
      { id: 'pl1', kind: 'sofa', label: '沙发', x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2' },
      { id: 'pl2', kind: 'cabinet', label: '柜', x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2' },
    ],
  })
  const before = circMetrics(analyzeCirculation(p))
  assert.ok(before.bottlenecks > 0, '前置:场景确实有瓶颈')

  const t0 = Date.now()
  const res = await solveLayout(p, 'best_flow', { iterations: 200, seed: 7 })
  const ms = Date.now() - t0
  console.log(`best_flow(200 iters): ${ms}ms · 搬 ${res.ok ? res.moves.length : '-'} 件 · 最窄 ${before.minWidthIn}→${res.ok ? res.after.minWidthIn : '-'} in`)
  assert.ok(res.ok, `瓶颈场景必须解得动:${res.reason ?? ''}`)
  assert.ok(res.after.minWidthIn > before.minWidthIn, '最窄通道必须变宽')
  // 这间房家具占地 62.5/80 sqft,30in 通道几何上不可能 —— 极限标准(24in)即最优级
  assert.ok(res.after.minWidthIn >= CLEARANCE.minimum, `至少达到极限通道(got ${res.after.minWidthIn})`)
  assert.ok(res.moves.length >= 1)
  assert.ok(ms < 20_000, `单套方案 20s 预算,用了 ${ms}ms`)

  // 无重叠
  const solid = res.project.placements
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a2 = solid[i]
      const b2 = solid[j]
      const overlap =
        a2.x < b2.x + b2.w && a2.x + a2.w > b2.x && a2.y < b2.y + b2.h && a2.y + a2.h > b2.y
      assert.ok(!overlap, `「${a2.label}」与「${b2.label}」重叠`)
    }
  }
  // 家具没被挪出自己的分区(客厅两件仍在客厅)
  for (const mv of res.moves) {
    assert.ok(mv.to.x >= 24 + ft(12) - 1, `${mv.label} 不该跑出客厅`)
  }

  // 确定性
  const again = await solveLayout(p, 'best_flow', { iterations: 200, seed: 7 })
  assert.deepEqual(
    res.moves.map((m) => [m.id, m.to.x, m.to.y]),
    again.moves.map((m) => [m.id, m.to.x, m.to.y]),
    '同种子必须同解',
  )
}

/* ---- 场景 B:柜子怼在门口(堵门),min_effort 必须救回来且动得少 ---- */
{
  // 门在隔墙 x=456,中心 y ≈ 24 + (54+16)·3 = 234;柜子贴门客厅侧
  const p = baseProject({
    placements: [
      // 压住门口那格(门在 x=456,栅格恰好落在墙线上):柜子从 450 起才盖得住
      { id: 'pl1', kind: 'cabinet', label: '堵门柜', x: 24 + ft(12) - 6, y: 180, w: ft(3), h: ft(3), rotation: 0, zoneId: 'z-2' },
      { id: 'pl2', kind: 'sofa', label: '沙发', x: 24 + ft(17), y: 24 + ft(7), w: ft(3), h: ft(8) - ft(5), rotation: 0, zoneId: 'z-2' },
    ],
  })
  const before = circMetrics(analyzeCirculation(p))
  assert.ok(before.blocked > 0, `前置:门确实被堵(got ${before.blocked})`)

  const res = await solveLayout(p, 'min_effort', { iterations: 200, seed: 5 })
  assert.ok(res.ok, `堵门必须解得动:${res.reason ?? ''}`)
  assert.equal(res.after.blocked, 0, '解完不许再有堵门')
  assert.ok(res.moves.length <= 2, `最少折腾不该大动干戈(动了 ${res.moves.length} 件)`)
  const mover = res.moves.find((m) => m.id === 'pl1')
  assert.ok(mover, '被挪的应该是堵门那件')
  assert.ok(mover.movedFt > 0)
  assert.ok(['向', '原地'].some((s) => mover.directionZh.startsWith(s)))
}

/* ---- 场景 C:没有问题时,min_effort 如实说「不用动」 ---- */
{
  const p = baseProject({
    placements: [
      { id: 'pl1', kind: 'bed', label: '床', x: 24 + ft(1), y: 24 + ft(1), w: ft(5), h: ft(6.6), rotation: 0, zoneId: 'z-1' },
    ],
  })
  const before = circMetrics(analyzeCirculation(p))
  assert.equal(before.blocked, 0)
  const res = await solveLayout(p, 'min_effort', { iterations: 120, seed: 3 })
  assert.ok(!res.ok, `无问题时不该硬凑方案(却给了 ${res.ok ? res.moves.length : 0} 步)`)
  assert.ok(res.reason.includes('现状'), res.reason)
}

/* ---- solveAllProfiles:三套齐出,重复方案标注 ---- */
{
  const p = baseProject({
    placements: [
      { id: 'pl1', kind: 'sofa', label: '沙发', x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2' },
      { id: 'pl2', kind: 'cabinet', label: '柜', x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2' },
      { id: 'pl3', kind: 'bed', label: '床', x: 24 + ft(1), y: 24 + ft(1), w: ft(5), h: ft(6.6), rotation: 0, zoneId: 'z-1' },
    ],
  })
  const t0 = Date.now()
  const all = await solveAllProfiles(p, { iterations: 160, seed: 9 })
  const ms = Date.now() - t0
  console.log(
    `solveAllProfiles(160×3): ${ms}ms ·`,
    all.map((r) => `${r.profile.nameZh}:${r.ok ? `${r.moves.length} 步` : '不动'}`).join(' · '),
  )
  assert.equal(all.length, LAYOUT_PROFILES.length)
  assert.ok(ms < 45_000, `三套 45s 预算,用了 ${ms}ms`)
  const base = circMetrics(analyzeCirculation(p))
  for (const r of all) {
    if (!r.ok) continue
    assert.ok(r.after.blocked <= base.blocked)
    assert.ok(r.after.minWidthIn >= base.minWidthIn, `${r.profile.nameZh} 动线不许更差`)
  }
}

/* ---- freeWallFt:清空家具后贴墙长度只多不少 ---- */
{
  const p = baseProject({
    placements: [
      { id: 'pl1', kind: 'cabinet', label: '柜', x: 24 + ft(13), y: 24 + ft(0.2), w: ft(7), h: ft(2), rotation: 0, zoneId: 'z-2' },
    ],
  })
  const withFurniture = freeWallFt(p, p.placements)
  const empty = freeWallFt(p, [])
  assert.ok(empty > 0, '空房应有可用贴墙长度')
  assert.ok(empty >= withFurniture, `清空只多不少(${empty} vs ${withFurniture})`)
  assert.ok(empty - withFurniture >= 5, '7ft 贴墙柜挪走应释放明显贴墙长度')
}

console.log('layout-solve-unit: all assertions passed')
