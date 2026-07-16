/**
 * 布局复检器单测:清单一致/锁定不动/新增重叠/出区/动线不退化,
 * 以及求解器输出必须带 certified/provisional 状态与 slack 余量。
 * 户型 fixture 与 layout-solve-unit 同构:20x10ft 双房,隔墙带 32in 门。
 * Usage: node apps/home/scripts/layout-audit-unit.mjs
 */
import assert from 'node:assert/strict'
import { auditLayout } from '../src/lib/spatial/layout-audit.js'
import { solveLayout } from '../src/lib/spatial/layout-solve.js'
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
      { id: 'e5', a: 'v5', b: 'v6' },
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

const sofa = (extra = {}) => ({
  id: 'pl1', kind: 'sofa', label: '沙发',
  x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2', ...extra,
})
const cabinet = (extra = {}) => ({
  id: 'pl2', kind: 'cabinet', label: '柜',
  x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2', ...extra,
})

const withPlacements = (project, placements) => ({ ...project, placements })

/* ---- 求解器输出必须过复检,且带状态与余量 ---- */
{
  const p = baseProject({ placements: [sofa(), cabinet()] })
  const res = await solveLayout(p, 'best_flow', { iterations: 200, seed: 7 })
  assert.ok(res.ok, `瓶颈场景要解得动:${res.reason ?? ''}`)
  assert.equal(res.status, 'certified', '无低置信度输入 → certified')
  assert.deepEqual(res.lowConfidence, [])
  assert.equal(res.slackIn, Math.round((res.after.minWidthIn - CLEARANCE.minimum) * 10) / 10)
  assert.equal(res.fragile, res.slackIn < 4)
  const audit = auditLayout(p, res.project)
  assert.ok(audit.ok, `求解器输出复检必过:${audit.violations.map((v) => v.zh).join(';')}`)
}

/* ---- 低置信度搬动件 → provisional,并点名是谁 ---- */
{
  const p = baseProject({
    placements: [sofa(), cabinet({ attrs: { confidence: 'low' } })],
  })
  const res = await solveLayout(p, 'best_flow', { iterations: 200, seed: 7 })
  assert.ok(res.ok)
  const cabMoved = res.moves.some((m) => m.id === 'pl2')
  if (cabMoved) {
    assert.equal(res.status, 'provisional', '低置信度件被搬动 → 暂定')
    assert.ok(res.lowConfidence.includes('柜'), '要点名低置信度的件')
  } else {
    assert.equal(res.status, 'certified', '低置信度件没被动到就不该降级')
  }
}

/* ---- 锁定件被挪 → 违规 ---- */
{
  const p = baseProject({ placements: [sofa(), cabinet({ locked: true })] })
  const after = withPlacements(p, [sofa(), cabinet({ locked: true, x: 24 + ft(12) })])
  const audit = auditLayout(p, after)
  assert.ok(!audit.ok)
  assert.ok(audit.violations.some((v) => v.code === 'locked_moved'), '锁定件被挪要抓')
}

/* ---- 钉死件被转(位置没变) → 违规 ---- */
{
  const p = baseProject({ placements: [sofa({ fixed: true }), cabinet()] })
  const after = withPlacements(p, [sofa({ fixed: true, rotation: 90 }), cabinet()])
  const audit = auditLayout(p, after)
  assert.ok(audit.violations.some((v) => v.code === 'fixed_moved'), '钉死件被转要抓')
}

/* ---- 新增重叠 → 违规;既有重叠不算方案的账 ---- */
{
  const p = baseProject({ placements: [sofa(), cabinet()] })
  // 把柜子推到与沙发重叠
  const after = withPlacements(p, [sofa(), cabinet({ y: 24 + ft(1) })])
  const audit = auditLayout(p, after)
  assert.ok(audit.violations.some((v) => v.code === 'overlap_new'), '新增重叠要抓')

  // 现状本来就重叠(扫描噪声),方案原样保留 → 不违规
  const noisy = baseProject({ placements: [sofa(), cabinet({ y: 24 + ft(1) })] })
  const kept = withPlacements(noisy, [sofa(), cabinet({ y: 24 + ft(1) })])
  assert.ok(auditLayout(noisy, kept).ok, '既有重叠原样保留不该被否决')
}

/* ---- 相切不算重叠 ---- */
{
  const p = baseProject({ placements: [sofa(), cabinet()] })
  // 柜子北边贴住沙发南边(y = 24 + 3ft,正好相切)
  const after = withPlacements(p, [sofa(), cabinet({ y: 24 + ft(3) })])
  const audit = auditLayout(p, after)
  assert.ok(!audit.violations.some((v) => v.code === 'overlap_new'), '贴齐吸附不该被冤枉')
}

/* ---- 挪出分区 → 违规 ---- */
{
  const p = baseProject({ placements: [sofa(), cabinet()] })
  // 柜子(7ft 宽)挪进 12ft 卧室:塞得下,但它属于客厅
  const after = withPlacements(p, [sofa(), cabinet({ x: 24 + ft(1), y: 24 + ft(1) })])
  const audit = auditLayout(p, after)
  assert.ok(audit.violations.some((v) => v.code === 'zone_escape'), '出区要抓')
}

/* ---- 方案堵死门 → 动线违规 ---- */
{
  const p = baseProject({ placements: [sofa(), cabinet()] })
  // 柜子怼到隔墙门口(与 layout-solve-unit 场景 B 同一摆法)
  const after = withPlacements(p, [sofa(), cabinet({ x: 24 + ft(12) - 6, y: 180, w: ft(3), h: ft(3) })])
  const circ = analyzeCirculation(after)
  assert.ok(circ.blockedDoors.length > 0, '前置:这样摆确实堵门')
  const audit = auditLayout(p, after)
  assert.ok(audit.violations.some((v) => v.code === 'circulation_worse'), '新增堵门要抓')
}

/* ---- 静默丢件 → 违规 ---- */
{
  const p = baseProject({ placements: [sofa(), cabinet()] })
  const after = withPlacements(p, [sofa()])
  const audit = auditLayout(p, after)
  assert.ok(audit.violations.some((v) => v.code === 'inventory_changed'), '丢件要抓')
}

console.log('layout-audit-unit: all assertions passed')
