/**
 * 硬安全规则单测(规范 §5, 评审 §3)。不需要 dev server。
 *   node scripts/safety-rules-unit.mjs
 *
 * 锁死:热敏物近热源、高柜防倾(未贴墙)、贴墙不报、数据不足显式列出。
 */
import assert from 'node:assert/strict'
import { analyzeSafety } from '../src/lib/spatial/safety-rules.js'

const ft = (v) => v * 36

// 规则1:热敏物近热源(灶台旁的柜里放了热敏耗材)
{
  const project = {
    fixtures: [{ id: 'stove', kind: 'stove', label: '灶台', bounds: { x: 0, y: 0, w: ft(2), h: ft(2) } }],
    placements: [],
    storageZones: [
      // 离灶台 ~1ft 的柜,放热敏物
      { code: 'S1', bounds: { x: ft(2), y: 0, w: ft(2), h: ft(2) }, marker: { x: ft(3), y: ft(1) }, items: [{ id: 'a', name: '3D打印耗材', envSensitive: ['heat'] }] },
      // 远处(10ft)的柜,同样热敏物 → 不报
      { code: 'S2', bounds: { x: ft(12), y: 0, w: ft(2), h: ft(2) }, marker: { x: ft(13), y: ft(1) }, items: [{ id: 'b', name: '巧克力', envSensitive: ['heat'] }] },
    ],
  }
  const { hazards } = analyzeSafety(project)
  const h = hazards.find((x) => x.subjectId === 'a')
  assert.ok(h, '灶台旁热敏物应报')
  assert.equal(h.reasonCode, 'SAFETY_HEAT_SENSITIVE_NEAR_HEAT')
  assert.equal(h.params.heatLabel, '灶台')
  assert.ok(!hazards.some((x) => x.subjectId === 'b'), '远处的不该报')
}

// 规则2:高柜防倾 —— 高且未贴墙
{
  const project = {
    placements: [
      // 高置物架(tall=72),无 wallAnchor → 倾倒风险 high
      { id: 'rack', kind: 'wire_rack', label: '钢架', x: ft(5), y: ft(5), w: ft(3), h: ft(1.5), rotation: 0 },
      // 同样高,但贴墙 → 不报
      { id: 'rack2', kind: 'wire_rack', label: '靠墙钢架', x: 0, y: 0, w: ft(3), h: ft(1.5), rotation: 0, wallAnchor: { y: { edgeId: 'e', side: 'up', gapIn: 2, alongIn: 0 }, rotation: 0 } },
      // 矮开放架(heightIn 30 覆写)→ 不报
      { id: 'low', kind: 'shelf', label: '矮架', x: ft(9), y: ft(9), w: ft(3), h: ft(1), rotation: 0, attrs: { heightIn: 30 } },
    ],
    storageZones: [],
  }
  const { hazards } = analyzeSafety(project)
  const tip = hazards.find((x) => x.subjectId === 'rack')
  assert.ok(tip, '高而未贴墙的钢架应报倾倒')
  assert.equal(tip.reasonCode, 'SAFETY_TALL_UNANCHORED_TIP_RISK')
  assert.equal(tip.severity, 'high')
  assert.ok(!hazards.some((x) => x.subjectId === 'rack2'), '贴墙的不该报')
  assert.ok(!hazards.some((x) => x.subjectId === 'low'), '矮的不该报')
  // high 排前
  assert.equal(hazards[0].severity, 'high')
}

// 数据不足的规则显式列出,不冒充「安全」
{
  const { dataLimited } = analyzeSafety({ placements: [], storageZones: [] })
  assert.ok(dataLimited.includes('SAFETY_POWER_CORD_ROUTING'))
  assert.ok(dataLimited.includes('SAFETY_HEAT_DISSIPATION_CLEARANCE'))
  assert.ok(dataLimited.includes('SAFETY_LOAD_BEARING'))
}

console.log('safety-rules-unit: ok')
