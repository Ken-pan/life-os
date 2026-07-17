/**
 * 宠物安全单测(规范 §4, 评审 B5)。不需要 dev server。
 *   node scripts/pet-safety-unit.mjs
 *
 * 锁死:
 * - PET-03 多风险:一件可同时多种。
 * - PET-02 危险判定看容器:防护柜 ≠ 开放篮。
 * - PET-04 能力用户可配。
 * - 覆写:explicit-safe 清空、custom 自定;certainty confirmed/possible。
 */
import assert from 'node:assert/strict'
import {
  derivePetRisks,
  effectivePetRisks,
  zoneReachable,
  petHazards,
  isPetSafeZone,
  DEFAULT_REACH_CM,
} from '../src/lib/spatial/pet-safety.js'

// PET-03 多风险
{
  // 处方维生素:既 meds 又 toxic(补剂对狗有毒)
  const r = derivePetRisks({ name: '处方维生素 D 补剂' })
  assert.ok(r.includes('meds') && r.includes('toxic'), '药+毒应同时命中')
  assert.deepEqual(derivePetRisks({ name: 'Anker 充电线适配器' }), ['cord'])
  assert.deepEqual(derivePetRisks({ name: '干净的毛巾' }), [], '无风险物应空')
  // 商家标题也进检测
  assert.ok(derivePetRisks({ name: '小袋', purchase: { title: 'AA Battery 20-pack' } }).includes('small-parts'))
}

// 覆写:explicit-safe 清空;custom 自定
{
  assert.deepEqual(effectivePetRisks({ name: '药', petRiskOverride: { mode: 'explicit-safe', at: 't' } }), [])
  assert.deepEqual(
    effectivePetRisks({ name: '随便', petRiskOverride: { mode: 'custom', risks: ['chew'], at: 't' } }),
    ['chew'],
  )
  // 无覆写:优先已存 petRisks,否则派生
  assert.deepEqual(effectivePetRisks({ name: 'x', petRisks: ['food'] }), ['food'])
  assert.deepEqual(effectivePetRisks({ name: '巧克力' }), ['toxic'])
}

// PET-02 看容器
{
  const petSafety = { reachInCm: 90, canJumpToCounter: false, chews: true, opensCabinets: false }
  // 开放篮、低 → 可触
  assert.equal(zoneReachable({ zoneAccess: { open: true, closable: false, petProof: false, lockable: false, heightCm: 30 } }, petSafety), true)
  // 防护柜 → 不可触(哪怕矮)
  assert.equal(zoneReachable({ zoneAccess: { open: false, closable: true, petProof: true, lockable: true, heightCm: 20 } }, petSafety), false)
  // 带门能关、宠物不会开柜 → 挡得住
  assert.equal(zoneReachable({ zoneAccess: { open: false, closable: true, petProof: false, lockable: false, heightCm: 20 } }, petSafety), false)
  // 开放但高过可触带 → 够不着
  assert.equal(zoneReachable({ zoneAccess: { open: true, closable: false, petProof: false, lockable: false, heightCm: 150 } }, petSafety), false)
  // 无 zoneAccess → 未知(null)
  assert.equal(zoneReachable({}, petSafety), null)
}

// PET-04 能力用户可配:会跳台面 → 120cm 也够得着;会开柜 → 门挡不住
{
  const jumper = { reachInCm: 90, canJumpToCounter: true, chews: false, opensCabinets: false }
  assert.equal(zoneReachable({ zoneAccess: { open: true, closable: false, petProof: false, lockable: false, heightCm: 110 } }, jumper), true)
  const opener = { reachInCm: 90, canJumpToCounter: false, chews: false, opensCabinets: true }
  assert.equal(zoneReachable({ zoneAccess: { open: false, closable: true, petProof: false, lockable: false, heightCm: 40 } }, opener), true)
  // 缺 petSafety → 用默认 90
  assert.equal(zoneReachable({ zoneAccess: { open: true, closable: false, petProof: false, lockable: false, heightCm: DEFAULT_REACH_CM } }, undefined), true)
}

// petHazards:confirmed(开放可触)排在 possible(未知容器)前;安全区跳过
{
  const project = {
    meta: { petSafety: { reachInCm: 90, canJumpToCounter: false, chews: true, opensCabinets: false } },
    storageZones: [
      // 开放低架:确认可触 → confirmed
      { code: 'S1', items: [{ id: 'a', name: '狗狗驱虫药' }], zoneAccess: { open: true, closable: false, petProof: false, lockable: false, heightCm: 20 } },
      // 防护柜:安全 → 不出
      { code: 'S2', items: [{ id: 'b', name: '清洁剂' }], zoneAccess: { open: false, closable: true, petProof: true, lockable: true, heightCm: 20 } },
      // 无容器信息:possible
      { code: 'S3', items: [{ id: 'c', name: '巧克力' }] },
      // 无风险物:不出
      { code: 'S4', items: [{ id: 'd', name: '毛巾' }], zoneAccess: { open: true, closable: false, petProof: false, lockable: false, heightCm: 10 } },
    ],
  }
  const hz = petHazards(project)
  const ids = hz.map((h) => h.itemId)
  assert.ok(ids.includes('a') && ids.includes('c'), '可触与未知都应报')
  assert.ok(!ids.includes('b'), '防护柜里的不该报')
  assert.ok(!ids.includes('d'), '无风险物不该报')
  assert.equal(hz[0].itemId, 'a', 'confirmed 排最前')
  assert.equal(hz[0].certainty, 'confirmed')
  assert.equal(hz[0].reasonCode, 'PET_HAZARD_REACHABLE')
  assert.equal(hz.find((h) => h.itemId === 'c').certainty, 'possible')

  assert.equal(isPetSafeZone(project.storageZones[1], project.meta.petSafety), true)
  assert.equal(isPetSafeZone(project.storageZones[0], project.meta.petSafety), false)
}

console.log('pet-safety-unit: ok')
