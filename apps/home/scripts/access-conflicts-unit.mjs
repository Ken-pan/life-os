/**
 * 开合/出口冲突单测(评审 B7)。不需要 dev server。
 *   node scripts/access-conflicts-unit.mjs
 *
 * 锁死:抽屉/柜门被挡才报、egress 恒 high、旋转后不误报/不漏报。
 */
import assert from 'node:assert/strict'
import { analyzeAccessConflicts } from '../src/lib/spatial/access-conflicts.js'

const IN = 3

// 柜门开合区被推车挡住 → access 冲突
{
  const project = {
    placements: [
      // 柜:x0..108,y0..72;rotation0 正面朝下 → 包络 y72..144
      { id: 'cab', kind: 'cabinet', label: '柜', x: 0, y: 0, w: 36 * IN, h: 24 * IN, rotation: 0 },
      // 推车堵在柜门前(y72..144 区)
      { id: 'cart', kind: 'utility_cart', label: '推车', x: 10, y: 80, w: 60, h: 40, rotation: 0 },
    ],
  }
  const c = analyzeAccessConflicts(project)
  const hit = c.find((x) => x.actorId === 'cab' && x.blockedById === 'cart')
  assert.ok(hit, '柜门被推车挡应报')
  assert.equal(hit.envelopeType, 'access')
  assert.ok(hit.overlapDepthIn > 0)
}

// 旋转后不误报:柜转 180(正面朝上),推车仍在下方 → 不该报
{
  const project = {
    placements: [
      { id: 'cab', kind: 'cabinet', label: '柜', x: 0, y: 0, w: 36 * IN, h: 24 * IN, rotation: 180 },
      { id: 'cart', kind: 'utility_cart', label: '推车', x: 10, y: 80, w: 60, h: 40, rotation: 0 },
    ],
  }
  const c = analyzeAccessConflicts(project)
  assert.ok(!c.some((x) => x.actorId === 'cab' && x.blockedById === 'cart'), '门朝上、堵在下方不该报(漏报的反面:不误报)')
}

// egress 恒 high:床的上下床区被柜堵
{
  const project = {
    placements: [
      { id: 'bed', kind: 'bed_king', label: '床', x: 0, y: 0, w: 76 * IN, h: 80 * IN, rotation: 0 },
      // 床正面朝下 → egress 区 y240..312;放个矮柜堵住
      { id: 'blk', kind: 'cabinet', label: '堵床柜', x: 0, y: 80 * IN + 10, w: 30 * IN, h: 12 * IN, rotation: 90 },
    ],
  }
  const c = analyzeAccessConflicts(project)
  const eg = c.find((x) => x.actorId === 'bed')
  assert.ok(eg, '上下床区被挡应报')
  assert.equal(eg.envelopeType, 'egress')
  assert.equal(eg.severity, 'high')
  assert.equal(eg.reasonCode, 'EGRESS_BLOCKED')
  // egress 排在最前
  assert.equal(c[0].envelopeType, 'egress')
}

// 无冲突:空旷 → 空
{
  const project = {
    placements: [{ id: 'cab', kind: 'cabinet', label: '柜', x: 0, y: 0, w: 36 * IN, h: 24 * IN, rotation: 0 }],
  }
  assert.deepEqual(analyzeAccessConflicts(project), [])
}

console.log('access-conflicts-unit: ok')
