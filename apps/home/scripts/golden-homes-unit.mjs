/**
 * Golden homes 回归集 —— 一组形态各异的固定户型,每次改 solver 全量重跑。
 * 不是测「解得多好」,是测**不变量**:不炸、不撒谎、确定性、复检必过。
 *
 * 每套 home × 每个 profile 断言:
 * - 求解不抛异常;
 * - ok 时:复检(auditLayout)必过、锁定/钉死件绝不在搬动清单、
 *   状态 ∈ {certified, provisional}、slack 是数、同种子同解;
 * - !ok 时:reason 非空(如实说,不硬凑)。
 * 个别 home 另有专属断言(无解要认、低置信度要降级、相切不误报)。
 *
 * Usage: node apps/home/scripts/golden-homes-unit.mjs
 */
import assert from 'node:assert/strict'
import { auditLayout } from '../src/lib/spatial/layout-audit.js'
import { LAYOUT_PROFILES, solveLayout } from '../src/lib/spatial/layout-solve.js'
import { buildFromWallGraph } from '../src/lib/spatial/wall-graph.js'

const PX = 36
const ft = (v) => v * PX

/** 双房 20x10ft(与 layout-solve-unit 同构),隔墙带 32in 门 */
function twoRoom(placements = [], fixtures = []) {
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
      { id: 'e5', a: 'v5', b: 'v6' },
    ],
  }
  const zones = [
    { id: 'z-1', nameZh: '卧室', polygon: [
      { x: 24, y: 24 }, { x: 24 + midX, y: 24 }, { x: 24 + midX, y: 24 + H }, { x: 24, y: 24 + H },
    ] },
    { id: 'z-2', nameZh: '客厅', polygon: [
      { x: 24 + midX, y: 24 }, { x: 24 + W, y: 24 }, { x: 24 + W, y: 24 + H }, { x: 24 + midX, y: 24 + H },
    ] },
  ]
  return buildFromWallGraph(graph, {
    graphOpenings: [
      { id: 'op1', edgeId: 'e5', offsetIn: 54, spanIn: 32, type: 'door', style: 'swing' },
    ],
    zones,
    placements,
    fixtures: fixtures ?? [],
    viewpoints: [],
    storageZones: [],
    meta: { id: 'golden', nameZh: 'golden' },
  })
}

/** 单房 8x8ft 小间(带南墙门)—— 塞满/无解场景用 */
function tinyRoom(placements = []) {
  const W = ft(8)
  const H = ft(8)
  const graph = {
    pxPerFt: PX,
    margin: { x: 24, y: 24 },
    vertices: [
      { id: 'v1', x: 24, y: 24 },
      { id: 'v2', x: 24 + W, y: 24 },
      { id: 'v3', x: 24 + W, y: 24 + H },
      { id: 'v4', x: 24, y: 24 + H },
    ],
    edges: [
      { id: 'e1', a: 'v1', b: 'v2' },
      { id: 'e2', a: 'v2', b: 'v3' },
      { id: 'e3', a: 'v3', b: 'v4' },
      { id: 'e4', a: 'v4', b: 'v1' },
    ],
  }
  return buildFromWallGraph(graph, {
    graphOpenings: [
      { id: 'op1', edgeId: 'e3', offsetIn: 30, spanIn: 32, type: 'door', style: 'swing' },
    ],
    zones: [
      { id: 'z-1', nameZh: '小间', polygon: [
        { x: 24, y: 24 }, { x: 24 + W, y: 24 }, { x: 24 + W, y: 24 + H }, { x: 24, y: 24 + H },
      ] },
    ],
    placements,
    fixtures: [],
    viewpoints: [],
    storageZones: [],
    meta: { id: 'golden-tiny', nameZh: 'golden-tiny' },
  })
}

const sofa = (extra = {}) => ({
  id: 'pl1', kind: 'sofa', label: '沙发',
  x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2', ...extra,
})
const cabinet = (extra = {}) => ({
  id: 'pl2', kind: 'cabinet', label: '柜',
  x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2', ...extra,
})
const bed = (extra = {}) => ({
  id: 'pl3', kind: 'bed', label: '床',
  x: 24 + ft(1), y: 24 + ft(1), w: ft(5), h: ft(6.6), rotation: 0, zoneId: 'z-1', ...extra,
})

/** @type {Array<{ name: string, project: any, expect?: (results: any[]) => void }>} */
const HOMES = [
  {
    name: 'empty 空房',
    project: twoRoom([]),
    expect: (rs) => rs.forEach((r) => assert.ok(!r.ok, '空房没有可动的,不该硬凑')),
  },
  {
    name: 'no_problem 一床安好',
    project: twoRoom([bed()]),
    expect: (rs) => {
      const me = rs.find((r) => r.profile.key === 'min_effort')
      assert.ok(!me.ok, '没问题时最少折腾该说不用动')
    },
  },
  {
    name: 'bottleneck 沙发柜子夹瓶颈',
    project: twoRoom([sofa(), cabinet()]),
    expect: (rs) => {
      const bf = rs.find((r) => r.profile.key === 'best_flow')
      assert.ok(bf.ok, '瓶颈必须解得动')
      assert.ok(bf.after.minWidthIn > bf.before.minWidthIn, '最窄通道必须变宽')
    },
  },
  {
    name: 'blocked_door 柜子堵门',
    project: twoRoom([
      cabinet({ id: 'pl1', label: '堵门柜', x: 24 + ft(12) - 6, y: 180, w: ft(3), h: ft(3) }),
      sofa({ id: 'pl2', x: 24 + ft(17), y: 24 + ft(7), w: ft(3), h: ft(3) }),
    ]),
    expect: (rs) => {
      const me = rs.find((r) => r.profile.key === 'min_effort')
      assert.ok(me.ok, '堵门必须解得动')
      assert.equal(me.after.blocked, 0, '解完不许再堵')
    },
  },
  {
    name: 'all_locked 全部锁死',
    project: twoRoom([sofa({ locked: true }), cabinet({ locked: true })]),
    expect: (rs) =>
      rs.forEach((r) => {
        assert.ok(!r.ok)
        assert.ok(r.reason.includes('可移动'), r.reason)
      }),
  },
  {
    name: 'packed 塞满的小间',
    // 8x8 小间塞 4 件大家具,几乎没有腾挪余地 —— 不许炸、不许瞎给
    project: tinyRoom([
      { id: 'a', kind: 'bed', label: '床', x: 24, y: 24, w: ft(5), h: ft(6.6), rotation: 0, zoneId: 'z-1' },
      { id: 'b', kind: 'dresser', label: '斗柜', x: 24 + ft(5.2), y: 24, w: ft(2.6), h: ft(1.6), rotation: 0, zoneId: 'z-1' },
      { id: 'c', kind: 'shelf', label: '架', x: 24 + ft(5.2), y: 24 + ft(1.8), w: ft(2.6), h: ft(1.4), rotation: 0, zoneId: 'z-1' },
      { id: 'd', kind: 'chair', label: '椅', x: 24 + ft(5.4), y: 24 + ft(3.4), w: ft(1.6), h: ft(1.6), rotation: 0, zoneId: 'z-1' },
    ]),
  },
  {
    name: 'tangent 家具相切',
    // 沙发南边与柜北边正好贴合:复检不许把贴齐当重叠误杀
    project: twoRoom([sofa(), cabinet({ y: 24 + ft(3), h: ft(4) })]),
  },
  {
    name: 'low_conf 低置信度堵门柜',
    project: twoRoom([
      cabinet({ id: 'pl1', label: '堵门柜', x: 24 + ft(12) - 6, y: 180, w: ft(3), h: ft(3), attrs: { confidence: 'low' } }),
    ]),
    expect: (rs) => {
      for (const r of rs) {
        if (r.ok && r.moves.some((m) => m.id === 'pl1')) {
          assert.equal(r.status, 'provisional', `${r.profile.nameZh}:搬低置信度件必须降级为暂定`)
          assert.ok(r.lowConfidence.includes('堵门柜'))
        }
      }
    },
  },
]

const t0 = Date.now()
let solved = 0
for (const home of HOMES) {
  const results = []
  for (const profile of LAYOUT_PROFILES) {
    const res = await solveLayout(home.project, profile.key, { iterations: 150, seed: 11 })
    const again = await solveLayout(home.project, profile.key, { iterations: 150, seed: 11 })

    // 不变量:确定性
    assert.deepEqual(
      res.ok ? res.moves.map((m) => [m.id, m.to.x, m.to.y, m.to.rotation]) : res.reason,
      again.ok ? again.moves.map((m) => [m.id, m.to.x, m.to.y, m.to.rotation]) : again.reason,
      `${home.name} × ${profile.key}:同种子必须同解`,
    )

    if (res.ok) {
      solved += 1
      // 不变量:复检必过
      const audit = auditLayout(home.project, res.project)
      assert.ok(
        audit.ok,
        `${home.name} × ${profile.key} 复检未过:${audit.violations.map((v) => v.zh).join(';')}`,
      )
      // 不变量:锁定/钉死件绝不在清单里;状态与余量字段齐全
      for (const mv of res.moves) {
        const src = home.project.placements.find((p) => p.id === mv.id)
        assert.ok(!src.locked && !src.fixed, `${home.name}:「${mv.label}」不该被动`)
      }
      assert.ok(['certified', 'provisional'].includes(res.status))
      assert.equal(typeof res.slackIn, 'number')
      assert.equal(typeof res.fragile, 'boolean')
      assert.ok(res.moves.length > 0, 'ok 方案不该是空清单')
    } else {
      assert.ok(res.reason && res.reason.length > 0, `${home.name}:失败要给人话理由`)
    }
    results.push(res)
  }
  home.expect?.(results)
  console.log(
    `${home.name}: ${results.map((r) => `${r.profile.key}=${r.ok ? r.moves.length + '步' : '不动'}`).join(' ')}`,
  )
}
console.log(`golden-homes: ${HOMES.length} homes × ${LAYOUT_PROFILES.length} profiles(${solved} 套有解),${Date.now() - t0}ms — all invariants held`)
