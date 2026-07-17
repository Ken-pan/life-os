/**
 * 布局求解器单测:硬约束(不重叠/不出区/动线只许更好)、确定性(同种子同解)、
 * 人造堵门/瓶颈必须被解掉、性能预算。
 * 户型走 buildFromWallGraph(与 circulation-unit 同一套 fixture 思路):
 * 12x10ft 卧室 + 8x10ft 客厅,隔墙带 32in 门。
 * Usage: node apps/home/scripts/layout-solve-unit.mjs
 */
import assert from 'node:assert/strict'
import {
  affinityPenaltyIn,
  boxGapIn,
  buildDesignContext,
  candidateSlots,
  circMetrics,
  designPenaltyIn,
  detectPairs,
  directionZh,
  freeWallFt,
  LAYOUT_PROFILES,
  minWallGapIn,
  openingSegments,
  segIntersectsBox,
  sideFreeDepthIn,
  solveAllProfiles,
  solveLayout,
  viewingAnglePenaltyIn,
} from '../src/lib/spatial/layout-solve.js'
import {
  analyzeCirculation,
  buildCirculationBase,
  CLEARANCE,
} from '../src/lib/spatial/circulation.js'
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
  // 这间房家具占地 62.5/80 sqft 且柜子要给西门让位 —— 真实最优 ~18-22in。
  // (瓶颈亚格精化前栅格报 24,那是 12in 量化的恭维;现在数字诚实了)
  assert.ok(res.after.minWidthIn >= 18, `接近该房型的几何上限(got ${res.after.minWidthIn})`)
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

/* ---- fixed 钉死件绝不参与移动 ---- */
{
  // 场景 B 的堵门柜标成 fixed:唯一能解堵门的件动不了 → 必须如实说解不动,
  // 而不是把公寓自带的柜子搬走
  const p = baseProject({
    placements: [
      { id: 'pl1', kind: 'cabinet', label: '内嵌柜', x: 24 + ft(12) - 6, y: 180, w: ft(3), h: ft(3), rotation: 0, zoneId: 'z-2', fixed: true },
    ],
  })
  const before = circMetrics(analyzeCirculation(p))
  assert.ok(before.blocked > 0, '前置:门确实被堵')
  const res = await solveLayout(p, 'min_effort', { iterations: 150, seed: 5 })
  if (res.ok) {
    assert.ok(!res.moves.some((m) => m.id === 'pl1'), '钉死件绝不该出现在搬动清单里')
  } else {
    assert.ok(res.reason.length > 0)
  }
}

/* ---- locked 用户锁定件:不参与移动,但仍是碰撞障碍(局部重算) ---- */
{
  // 场景 A 的瓶颈房,把柜子锁死:求解器只能围绕它挪沙发
  const p = baseProject({
    placements: [
      { id: 'pl1', kind: 'sofa', label: '沙发', x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2' },
      { id: 'pl2', kind: 'cabinet', label: '锁定柜', x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2', locked: true },
    ],
  })
  const res = await solveLayout(p, 'best_flow', { iterations: 200, seed: 7 })
  if (res.ok) {
    assert.ok(!res.moves.some((m) => m.id === 'pl2'), '锁定件绝不该出现在搬动清单里')
    const cab = res.project.placements.find((x) => x.id === 'pl2')
    assert.equal(cab.x, 24 + ft(13), '锁定件 x 原地不动')
    assert.equal(cab.y, 24 + ft(4.5), '锁定件 y 原地不动')
    // 锁定件仍是碰撞障碍:挪过的沙发不许压上来
    const sofa = res.project.placements.find((x) => x.id === 'pl1')
    const overlap =
      sofa.x < cab.x + cab.w && sofa.x + sofa.w > cab.x &&
      sofa.y < cab.y + cab.h && sofa.y + sofa.h > cab.y
    assert.ok(!overlap, '沙发不许压到锁定柜上')
  } else {
    assert.ok(res.reason.length > 0)
  }

  // 全部锁死 → 如实说没有可移动的家具,不硬编方案
  const allLocked = baseProject({
    placements: [
      { id: 'pl1', kind: 'sofa', label: '沙发', x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2', locked: true },
      { id: 'pl2', kind: 'cabinet', label: '柜', x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2', locked: true },
    ],
  })
  const none = await solveLayout(allLocked, 'best_flow', { iterations: 60, seed: 7 })
  assert.ok(!none.ok, '全锁死不该硬凑方案')
  assert.ok(none.reason.includes('可移动'), none.reason)
}

/* ---- 摆放逻辑:纯函数 ---- */
{
  // 边到边间距
  assert.equal(boxGapIn({ x: 0, y: 0, w: 30, h: 30 }, { x: 36, y: 0, w: 30, h: 30 }), 2)
  assert.equal(boxGapIn({ x: 0, y: 0, w: 30, h: 30 }, { x: 10, y: 10, w: 30, h: 30 }), 0)

  // 认对:床头柜认最近的床(同分区)
  const zones = [squareZone]
  const placements = [
    { id: 'b1', kind: 'bed', label: '床', x: 12, y: 12, w: 150, h: 200, rotation: 0, zoneId: 'z1' },
    { id: 'n1', kind: 'nightstand', label: '床头柜', x: 168, y: 12, w: 45, h: 45, rotation: 0, zoneId: 'z1' },
    { id: 'c1', kind: 'chair', label: '孤儿椅', x: 300, y: 300, w: 54, h: 54, rotation: 0, zoneId: 'z1' },
  ]
  const pairs = detectPairs(placements, zones)
  assert.ok(pairs.some((p2) => p2.aId === 'n1' && p2.bId === 'b1'), '床头柜↔床要认上')
  assert.ok(!pairs.some((p2) => p2.aId === 'c1'), '没有桌子,椅子不硬凑对')

  // 罚分:贴着 = 0;拉开 4ft 就有账
  const segs = [{ edgeId: 'e', vertical: false, at: 0, lo: 0, hi: 432 }]
  const near = new Map([
    ['b1', { x: 12, y: 0, w: 150, h: 200 }],
    ['n1', { x: 168, y: 0, w: 45, h: 45 }],
  ])
  const far = new Map([
    ['b1', { x: 12, y: 0, w: 150, h: 200 }],
    ['n1', { x: 330, y: 280, w: 45, h: 45 }],
  ])
  const huggers = [{ id: 'b1', kind: 'bed' }]
  const pNear = affinityPenaltyIn(near, pairs, segs, huggers)
  const pFar = affinityPenaltyIn(far, pairs, segs, huggers)
  assert.equal(pNear, 0, `贴着不该罚(got ${pNear})`)
  assert.ok(pFar > 20, `拆散要罚(got ${pFar})`)

  // 贴墙:床贴北墙 gap 0;推到 y=60(20in)要罚
  assert.equal(minWallGapIn({ x: 12, y: 0, w: 150, h: 200 }, segs), 0)
  assert.equal(minWallGapIn({ x: 12, y: 60, w: 150, h: 200 }, segs), 20)
}

/* ---- 伴随对协同移动:解瓶颈时床头柜跟着床走,不许被拆散 ---- */
{
  // 卧室:床横在房中央堵住通道(床 5×6.6ft 放房间正中),床头柜贴床右侧。
  // 解法必然要挪床 —— 床头柜必须跟着,解完两件仍然贴着。
  const p = baseProject({
    placements: [
      { id: 'bed', kind: 'bed', label: '床', x: 24 + ft(3.5), y: 24 + ft(2), w: ft(5), h: ft(6.6), rotation: 0, zoneId: 'z-1' },
      { id: 'ns', kind: 'nightstand', label: '床头柜', x: 24 + ft(8.6), y: 24 + ft(2), w: ft(1.5), h: ft(1.5), rotation: 0, zoneId: 'z-1' },
    ],
  })
  const basePairs = detectPairs(p.placements, p.zones)
  assert.ok(basePairs.length === 1, '前置:认出床头柜↔床')
  const gap0 = boxGapIn(
    { x: 24 + ft(3.5), y: 24 + ft(2), w: ft(5), h: ft(6.6) },
    { x: 24 + ft(8.6), y: 24 + ft(2), w: ft(1.5), h: ft(1.5) },
  )
  assert.ok(gap0 <= 8, `前置:现在是贴着的(${gap0}in)`)

  const res = await solveLayout(p, 'best_flow', { iterations: 260, seed: 13 })
  if (res.ok && res.moves.some((m) => m.id === 'bed')) {
    const bedBox = res.project.placements.find((x) => x.id === 'bed')
    const nsBox = res.project.placements.find((x) => x.id === 'ns')
    const gapAfter = boxGapIn(bedBox, nsBox)
    assert.ok(gapAfter <= 12, `床挪了,床头柜必须还贴着(拆到 ${Math.round(gapAfter)}in)`)
  }
}

/* ---- 流浪家具归位:办公椅漂在房间另一头,best_flow 把它带回桌边 ---- */
{
  const p = baseProject({
    placements: [
      { id: 'dk', kind: 'desk', label: '书桌', x: 24 + ft(12) + 6, y: 24 + 6, w: ft(5), h: ft(2.5), rotation: 0, zoneId: 'z-2' },
      { id: 'oc', kind: 'office_chair', label: '办公椅', x: 24 + ft(18), y: 24 + ft(8), w: ft(2), h: ft(2), rotation: 0, zoneId: 'z-2' },
    ],
  })
  const res = await solveLayout(p, 'best_flow', { iterations: 260, seed: 17 })
  assert.ok(res.ok, `流浪椅是可解的问题:${res.reason ?? ''}`)
  const dk = res.project.placements.find((x) => x.id === 'dk')
  const oc = res.project.placements.find((x) => x.id === 'oc')
  const gap = boxGapIn(dk, oc)
  assert.ok(gap <= 24, `椅子该回到桌边(还差 ${Math.round(gap)}in)`)
  assert.ok(res.after.affinityIn < res.before.affinityIn, '摆放逻辑分要改善')
}

/* ---- 专业设计规范:几何原语 ---- */
{
  // 侧向净深:柜子(北墙下)南侧 3ft 外有张桌子 → 南侧净深 36in
  const cab = { x: 100, y: 0, w: 108, h: 60 }
  const desk = { x: 100, y: 168, w: 108, h: 60 }
  const segs = [{ edgeId: 'n', vertical: false, at: 0, lo: 0, hi: 720 }]
  assert.equal(sideFreeDepthIn(cab, 's', [desk], segs), 36)
  assert.equal(sideFreeDepthIn(cab, 'n', [desk], segs), 0, '背贴墙,北侧净深 0')
  // 横向没搭上的障碍不算
  const aside = { x: 400, y: 168, w: 60, h: 60 }
  assert.equal(sideFreeDepthIn(cab, 's', [aside], segs), 96, '斜对面的不挡')

  // 线段穿盒
  assert.ok(segIntersectsBox(0, 0, 100, 100, { x: 40, y: 40, w: 20, h: 20 }))
  assert.ok(!segIntersectsBox(0, 0, 100, 0, { x: 40, y: 40, w: 20, h: 20 }))
}

/* ---- 门窗段解析 + 设计罚分(净空/门扇/窗前/视线) ---- */
{
  const p = baseProject({
    placements: [
      // wardrobe 需要 36in 前净空(词表);把一张桌子怼到它长边正前方 8in
      { id: 'wd', kind: 'wardrobe', label: '衣柜', x: 24 + ft(1), y: 24 + 6, w: ft(4), h: ft(2), rotation: 0, zoneId: 'z-1' },
      { id: 'tb', kind: 'table', label: '桌', x: 24 + ft(1), y: 24 + 6 + ft(2) + 24, w: ft(4), h: ft(3), rotation: 0, zoneId: 'z-1' },
    ],
  })
  const segsAll = openingSegments(p)
  assert.equal(segsAll.length, 1, '一道门要解析出来')
  assert.equal(segsAll[0].type, 'door')

  const ctx = buildDesignContext(p, p.placements, p.zones)
  assert.ok(ctx.access.some((a) => a.id === 'wd' && a.clearance >= 24), '衣柜有净空需求')
  const boxes = new Map(p.placements.map((x) => [x.id, { x: x.x, y: x.y, w: x.w, h: x.h }]))
  const jammed = designPenaltyIn(ctx, boxes)
  assert.ok(jammed > 10, `衣柜前净空被桌子吃掉,要罚(got ${jammed})`)

  // 把桌子挪远 → 罚分下降
  boxes.set('tb', { x: 24 + ft(1), y: 24 + ft(7), w: ft(4), h: ft(3) })
  const freed = designPenaltyIn(ctx, boxes)
  assert.ok(freed < jammed, `净空放开罚分要降(${jammed} → ${freed})`)
}

/* ---- 求解器会把「柜门打不开」当问题解掉 ---- */
{
  const p = baseProject({
    placements: [
      { id: 'wd', kind: 'wardrobe', label: '衣柜', x: 24 + ft(1), y: 24 + 6, w: ft(4), h: ft(2), rotation: 0, zoneId: 'z-1' },
      { id: 'tb', kind: 'table', label: '桌', x: 24 + ft(1), y: 24 + 6 + ft(2) + 24, w: ft(4), h: ft(3), rotation: 0, zoneId: 'z-1' },
    ],
  })
  const res = await solveLayout(p, 'best_flow', { iterations: 260, seed: 21 })
  assert.ok(res.ok, `净空问题可解:${res.reason ?? ''}`)
  assert.ok(res.after.affinityIn < res.before.affinityIn, '设计偏差要下降')
  // 解完衣柜长边前至少 30in(允许比标准 36 略紧,但必须能开门)
  const wd = res.project.placements.find((x) => x.id === 'wd')
  const others = res.project.placements.filter((x) => x.id !== 'wd')
  const southDepth = sideFreeDepthIn(
    wd,
    wd.y < 24 + ft(5) ? 's' : 'n',
    others.map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h })),
    [],
  )
  assert.ok(southDepth >= 30, `衣柜开门侧要留出净空(got ${Math.round(southDepth)}in)`)
}

/* ---- circMetrics 开阔度:空房 > 摆满的房 ---- */
{
  const empty = circMetrics(analyzeCirculation(baseProject()))
  const full = circMetrics(
    analyzeCirculation(
      baseProject({
        placements: [
          { id: 'pl1', kind: 'sofa', label: '沙发', x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2' },
          { id: 'pl2', kind: 'cabinet', label: '柜', x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2' },
        ],
      }),
    ),
  )
  assert.ok(empty.openIn > full.openIn, `空房更开阔(${empty.openIn} vs ${full.openIn})`)
  assert.ok(empty.openIn > 40, `12ft 房间的开阔圆该有几英尺(got ${empty.openIn})`)
}

/* ---- 观看角先验:电视该在沙发正前方,不是斜对角 ---- */
{
  // 沙发背贴北墙(y=0),前向朝南(+y)
  const segs = [{ edgeId: 'n', vertical: false, at: 0, lo: 0, hi: 720 }]
  const sofa = { x: 200, y: 3, w: 252, h: 108 }
  // 电视在正南 8ft:偏角 0 → 免罚
  const front = viewingAnglePenaltyIn(sofa, { x: 290, y: 350, w: 72, h: 18 }, segs)
  assert.equal(front, 0, `正前方免罚(got ${front})`)
  // 电视几乎在正东(偏角 ~87°):罚接近封顶
  const side = viewingAnglePenaltyIn(sofa, { x: 650, y: 40, w: 18, h: 72 }, segs)
  assert.ok(side > 25, `斜到侧面要重罚(got ${side})`)
  // 沙发不贴墙 → 前向猜不准,不罚
  const floating = viewingAnglePenaltyIn({ x: 200, y: 150, w: 252, h: 108 }, { x: 650, y: 40, w: 18, h: 72 }, segs)
  assert.equal(floating, 0, '不贴墙不装懂')
}

/* ---- 静态底图复用:与全量重算结果全等,且明显更快 ---- */
{
  const p = baseProject({
    placements: [
      { id: 'pl1', kind: 'sofa', label: '沙发', x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2' },
      { id: 'pl2', kind: 'cabinet', label: '柜', x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2' },
      { id: 'pl3', kind: 'bed', label: '床', x: 24 + ft(1), y: 24 + ft(1), w: ft(5), h: ft(6.6), rotation: 0, zoneId: 'z-1' },
    ],
  })
  const base = buildCirculationBase(p)
  const full = analyzeCirculation(p)
  const reused = analyzeCirculation(p, { base })
  assert.deepEqual(reused, full, '复用底图必须与全量重算逐字段全等')

  // 家具变了、底图不变:换个摆法仍然全等
  const moved = {
    ...p,
    placements: p.placements.map((x) =>
      x.id === 'pl2' ? { ...x, x: 24 + ft(12), y: 24 + ft(6) } : x,
    ),
  }
  assert.deepEqual(
    analyzeCirculation(moved, { base }),
    analyzeCirculation(moved),
    '挪家具后复用底图仍全等',
  )

  // 提速:同一 project 评估 60 次,复用底图要明显快于全量
  const N = 60
  const t0 = Date.now()
  for (let i = 0; i < N; i++) analyzeCirculation(p)
  const fullMs = Date.now() - t0
  const t1 = Date.now()
  for (let i = 0; i < N; i++) analyzeCirculation(p, { base })
  const reuseMs = Date.now() - t1
  console.log(`analyzeCirculation ×${N}: 全量 ${fullMs}ms vs 复用底图 ${reuseMs}ms`)
  assert.ok(reuseMs * 2 < fullMs, `复用底图至少 2× 提速(${fullMs} vs ${reuseMs})`)
}

/* ---- 用户指定关系(relations)与净空覆写(attrs.clearanceIn) ---- */
{
  // far_from:鸟笼(shelf 客串)贴着床 → 罚;隔开 6ft+ → 不罚
  const mk = (x) => ({
    id: 'cage', kind: 'shelf', label: '鸟笼',
    x, y: 24 + ft(1), w: ft(2), h: ft(2), rotation: 0, zoneId: 'z-1',
    relations: [{ type: 'far_from', targetId: 'bed', gapIn: [72, 999], zh: '鸟笼远离床' }],
  })
  const bed = { id: 'bed', kind: 'bed', label: '床', x: 24 + ft(1), y: 24 + ft(3.5), w: ft(5), h: ft(6.5), rotation: 0, zoneId: 'z-1' }

  const near = baseProject({ placements: [mk(24 + ft(1)), bed] })
  const ctxNear = buildDesignContext(near, near.placements, near.zones)
  assert.equal(ctxNear.farPairs.length, 1, 'far_from 关系要进上下文')
  const boxesOf = (p) => new Map(p.placements.map((x) => [x.id, { x: x.x, y: x.y, w: x.w, h: x.h }]))
  const pNear = designPenaltyIn(ctxNear, boxesOf(near))

  const far = baseProject({ placements: [mk(24 + ft(9.5)), bed] })
  const ctxFar = buildDesignContext(far, far.placements, far.zones)
  const pFar = designPenaltyIn(ctxFar, boxesOf(far))
  assert.ok(pNear > pFar + 30, `贴着床要重罚(near=${pNear} far=${pFar})`)

  // near:宠物粮桶(box 客串)指定靠近围栏目标 —— 拆散要罚
  const food = (x) => ({
    id: 'food', kind: 'storage_box', label: '宠物粮',
    x, y: 24 + ft(8), w: ft(1.5), h: ft(1.5), rotation: 0, zoneId: 'z-1',
    relations: [{ type: 'near', targetId: 'bed', gapIn: [0, 12], zh: '测试靠近' }],
  })
  const together = baseProject({ placements: [food(24 + ft(1)), bed] })
  const apart = baseProject({ placements: [food(24 + ft(10)), bed] })
  const ctxT = buildDesignContext(together, together.placements, together.zones)
  const ctxA = buildDesignContext(apart, apart.placements, apart.zones)
  assert.ok(ctxT.pairs.some((p2) => p2.zh === '测试靠近'), '用户 near 关系并进 pairs')
  const pT = designPenaltyIn(ctxT, boxesOf(together))
  const pA = designPenaltyIn(ctxA, boxesOf(apart))
  assert.ok(pA > pT, `拆散指定的 near 要罚(together=${pT} apart=${pA})`)

  // 目标件不存在:关系静默失效,不炸
  const orphan = baseProject({
    placements: [{ ...mk(24 + ft(1)), relations: [{ type: 'far_from', targetId: 'ghost' }] }],
  })
  const ctxO = buildDesignContext(orphan, orphan.placements, orphan.zones)
  assert.equal(ctxO.farPairs.length, 0, '悬空关系不进上下文')

  // 净空覆写:同一台洗衣机,attrs.clearanceIn 说了算
  const washer = baseProject({
    placements: [{ id: 'w1', kind: 'washer', label: '洗衣机', x: 24 + ft(1), y: 24 + ft(1), w: ft(2.5), h: ft(2.5), rotation: 0, zoneId: 'z-1', attrs: { clearanceIn: 26 } }],
  })
  const ctxW = buildDesignContext(washer, washer.placements, washer.zones)
  assert.equal(ctxW.access.find((a) => a.id === 'w1')?.clearance, 26, '实测净空覆写词表')
}

/* ---- 关系完整度门禁串到求解器:悬空关系的搬动件 → provisional ---- */
{
  // 堵门柜带一条目标已不存在的家规;它必须被挪(解堵门)→ provisional + 逐条理由
  const p = baseProject({
    placements: [
      { id: 'pl1', kind: 'cabinet', label: '堵门柜', x: 24 + ft(12) - 6, y: 180, w: ft(3), h: ft(3), rotation: 0, zoneId: 'z-2', relations: [{ type: 'far_from', targetId: 'ghost', zh: '远离「床」' }] },
    ],
  })
  const res = await solveLayout(p, 'min_effort', { iterations: 150, seed: 5 })
  if (res.ok && res.moves.some((m) => m.id === 'pl1')) {
    assert.equal(res.status, 'provisional', '搬了带悬空家规的件 → 暂定')
    assert.ok(res.provisionalReasons.some((r) => r.code === 'dangling_relation'), '要给出悬空关系理由')
  }

  // 无关系、非低置信度 → certified,且 unmetRelations 为空数组
  const clean = baseProject({
    placements: [
      { id: 'pl1', kind: 'sofa', label: '沙发', x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2' },
      { id: 'pl2', kind: 'cabinet', label: '柜', x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2' },
    ],
  })
  const cres = await solveLayout(clean, 'best_flow', { iterations: 200, seed: 7 })
  assert.ok(cres.ok)
  assert.equal(cres.status, 'certified')
  assert.deepEqual(cres.unmetRelations, [])
  assert.deepEqual(cres.provisionalReasons, [])
}

console.log('layout-solve-unit: all assertions passed')
