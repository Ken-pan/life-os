/**
 * 容量定性单测(规范 §6.3–6.5, 评审 B4)。不需要 dev server。
 *   node scripts/capacity-unit.mjs
 *
 * 锁死:
 * - CP-04 未知容量不得伪造 fillPct(缺尺寸 → null)。
 * - CP-02 用户明示 functional-full 压过几何。
 * - CP-01/05 空格是资源;CP-06 单一 inbox。
 */
import assert from 'node:assert/strict'
import {
  zoneCapacity,
  computeFillPct,
  isFull,
  emptySlots,
  enforceSingleInbox,
} from '../src/lib/spatial/capacity.js'

const zone = (over = {}) => ({ id: 'z', code: 'S1', nameZh: '', locationZh: '', formZh: '', bounds: { x: 0, y: 0, w: 1, h: 1 }, marker: { x: 0, y: 0 }, items: [], ...over })

// CP-04 缺容器 → unknown,无 fillPct
{
  assert.deepEqual(zoneCapacity(zone()), { state: 'unknown', evidence: null, fillPct: null })
  assert.equal(computeFillPct(zone()), null)
}

// CP-04 有容器但某件缺尺寸 → fillPct 退回 null(不伪造精度)
{
  const z = zone({
    container: { scanId: 's', interiorIn: { w: 20, d: 20, h: 20 }, shelfHeightsIn: [], compartments: [] },
    items: [
      { id: 'a', name: 'A', sizeIn: { w: 5, d: 5, h: 5 }, updatedAt: 0 },
      { id: 'b', name: 'B', updatedAt: 0 }, // 缺尺寸
    ],
  })
  assert.equal(computeFillPct(z), null)
  assert.equal(zoneCapacity(z).state, 'unknown')
}

// 几何体积:8000 in³ 内腔,装满/接近/宽裕
{
  const mk = (items) => zone({ container: { scanId: 's', interiorIn: { w: 20, d: 20, h: 20 }, shelfHeightsIn: [], compartments: [] }, items })
  // 宽裕:1000/8000 = 13%
  const roomy = mk([{ id: 'a', name: 'A', sizeIn: { w: 10, d: 10, h: 10 }, updatedAt: 0 }])
  assert.equal(zoneCapacity(roomy).fillPct, 13)
  assert.equal(zoneCapacity(roomy).state, 'available')
  // 接近满:7000/8000 = 88% ≥ 85(=100-15)
  const near = mk([{ id: 'a', name: 'A', sizeIn: { w: 10, d: 10, h: 70 }, updatedAt: 0 }])
  assert.equal(zoneCapacity(near).state, 'near-full')
  assert.equal(isFull(near), true)
  // 溢出:超 100% → functional-full,理由 volume-estimate
  const over = mk([{ id: 'a', name: 'A', sizeIn: { w: 20, d: 20, h: 25 }, updatedAt: 0 }])
  const oc = zoneCapacity(over)
  assert.equal(oc.state, 'functional-full')
  assert.equal(oc.evidence.reason, 'volume-estimate')
}

// CP-02 用户明示 functional-full(取物受阻)压过几何(哪怕体积看着宽裕)
{
  const z = zone({
    capacityState: 'functional-full',
    capacityEvidence: { source: 'user', at: '2026-07-16T00:00:00Z', reason: 'blocked-access' },
    container: { scanId: 's', interiorIn: { w: 100, d: 100, h: 100 }, shelfHeightsIn: [], compartments: [] },
    items: [{ id: 'a', name: 'A', sizeIn: { w: 1, d: 1, h: 1 }, updatedAt: 0 }],
  })
  const c = zoneCapacity(z)
  assert.equal(c.state, 'functional-full')
  assert.equal(c.evidence.reason, 'blocked-access')
  assert.equal(isFull(z), true)
}

// CP-01/05 空格是资源
{
  const z = zone({
    container: { scanId: 's', interiorIn: { w: 1, d: 1, h: 1 }, shelfHeightsIn: [], compartments: [
      { level: 0, y0In: 0, y1In: 12, heightIn: 12 },
      { level: 1, y0In: 12, y1In: 24, heightIn: 12 },
      { level: 2, y0In: 24, y1In: 36, heightIn: 12 },
    ] },
    items: [{ id: 'a', name: 'A', level: 1, updatedAt: 0 }],
  })
  assert.equal(emptySlots(z), 2) // level 0 和 2 空着
  assert.equal(emptySlots(zone()), null) // 无实测层 → 未知,不是 0
}

// CP-06 单一 inbox:保留第一个,清其余;幂等
{
  const zs = [zone({ id: 'a', inbox: true }), zone({ id: 'b', inbox: true }), zone({ id: 'c' })]
  const out = enforceSingleInbox(zs)
  assert.equal(out.filter((z) => z.inbox).length, 1)
  assert.equal(out[0].inbox, true)
  assert.equal(out[1].inbox, undefined)
  // 已 ≤1 → 原样返回(引用相等)
  const one = [zone({ id: 'a', inbox: true }), zone({ id: 'b' })]
  assert.equal(enforceSingleInbox(one), one)
}

console.log('capacity-unit: ok')
