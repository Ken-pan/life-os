/**
 * 关系完整度门禁单测:悬空关系 → provisional;有效但没满足 → unmet(不降级);
 * 两端都没动的关系不评价;near/far 的方向与容差正确。
 * Usage: node apps/home/scripts/plan-readiness-unit.mjs
 */
import assert from 'node:assert/strict'
import { assessRelationReadiness } from '../src/lib/spatial/plan-readiness.js'

const PX = 36
const ft = (v) => v * PX

/** 极简 project:只需要 placements（readiness 不看墙/分区） */
const proj = (placements) => ({ placements })

const bird = (extra = {}) => ({ id: 'bird', kind: 'shelf', label: '鸟笼', x: 24, y: 24, w: ft(2), h: ft(2), rotation: 0, ...extra })
const bed = (extra = {}) => ({ id: 'bed', kind: 'bed', label: '床', x: 24, y: 24 + ft(3), w: ft(5), h: ft(6.5), rotation: 0, ...extra })

/* ---- 悬空关系:目标被删 + 这件被挪过 → provisional ---- */
{
  const p = proj([bird({ relations: [{ type: 'far_from', targetId: 'ghost', zh: '远离「床」' }] })])
  const r = assessRelationReadiness(p, new Set(['bird']))
  assert.equal(r.provisionalReasons.length, 1, '悬空关系要报 provisional')
  assert.equal(r.provisionalReasons[0].code, 'dangling_relation')
  assert.ok(r.provisionalReasons[0].zh.includes('鸟笼'))
  assert.equal(r.unmetRelations.length, 0)
}

/* ---- 悬空关系但这件没动 → 不报（既有悬空,不是这套方案的账）---- */
{
  const p = proj([bird({ relations: [{ type: 'far_from', targetId: 'ghost' }] })])
  const r = assessRelationReadiness(p, new Set()) // 没挪任何件
  assert.equal(r.provisionalReasons.length, 0, '没挪的悬空关系不该记账')
}

/* ---- far_from 没满足:鸟笼贴着床(隔 0),要 far ≥72in → unmet(不降级)---- */
{
  const near = bird({ x: 24, y: 24 + ft(3), relations: [{ type: 'far_from', targetId: 'bed', gapIn: [72, 999], zh: '远离「床」' }] })
  // near 与 bed 在 y 上贴着(bird 底 y=24+72+... 其实重叠),制造小间距
  const p = proj([{ ...near, x: 24, y: 24 }, bed({ x: 24, y: 24 + ft(2) + 6 })]) // 间距约 6px≈2in
  const r = assessRelationReadiness(p, new Set(['bird']))
  assert.equal(r.provisionalReasons.length, 0, 'unmet 不该进 provisional')
  assert.equal(r.unmetRelations.length, 1, 'far 没拉开要进 unmet')
  assert.equal(r.unmetRelations[0].type, 'far_from')
  assert.ok(r.unmetRelations[0].gapIn < 72)
}

/* ---- far_from 满足了:隔够远 → 无 unmet ---- */
{
  const far = bird({ x: 24, y: 24, relations: [{ type: 'far_from', targetId: 'bed', gapIn: [72, 999] }] })
  const p = proj([far, bed({ x: 24, y: 24 + ft(9) })]) // 相隔约 9-2=7ft = 84in > 72
  const r = assessRelationReadiness(p, new Set(['bird']))
  assert.equal(r.unmetRelations.length, 0, `隔够远不该报(${JSON.stringify(r.unmetRelations)})`)
}

/* ---- near 没满足:该靠近却离得远 → unmet ---- */
{
  const food = { id: 'food', kind: 'storage_box', label: '宠物粮', x: 24, y: 24, w: ft(1.5), h: ft(1.5), rotation: 0, relations: [{ type: 'near', targetId: 'fence', gapIn: [0, 12], zh: '靠近「围栏」' }] }
  const fence = { id: 'fence', kind: 'pet_fence', label: '围栏', x: 24 + ft(10), y: 24, w: ft(3), h: ft(3), rotation: 0 }
  const r = assessRelationReadiness(proj([food, fence]), new Set(['food']))
  assert.equal(r.unmetRelations.length, 1, 'near 太远要报')
  assert.equal(r.unmetRelations[0].type, 'near')
  assert.ok(r.unmetRelations[0].gapIn > 12)
}

/* ---- 两端都没动的关系不评价 ---- */
{
  const food = { id: 'food', kind: 'storage_box', label: '宠物粮', x: 24, y: 24, w: ft(1.5), h: ft(1.5), rotation: 0, relations: [{ type: 'near', targetId: 'fence', gapIn: [0, 12] }] }
  const fence = { id: 'fence', kind: 'pet_fence', label: '围栏', x: 24 + ft(10), y: 24, w: ft(3), h: ft(3), rotation: 0 }
  const r = assessRelationReadiness(proj([food, fence]), new Set(['someone-else']))
  assert.equal(r.unmetRelations.length, 0, '两端都没动 = 现状,不评价')
}

/* ---- 没有 relations 的家具:干净 ---- */
{
  const r = assessRelationReadiness(proj([bird(), bed()]), new Set(['bird', 'bed']))
  assert.equal(r.provisionalReasons.length, 0)
  assert.equal(r.unmetRelations.length, 0)
}

console.log('plan-readiness-unit: all assertions passed')
