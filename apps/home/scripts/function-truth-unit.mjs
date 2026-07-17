/**
 * 功能真源单测(规范 §1.1, 评审 B1)。不需要 dev server / VLM / Supabase。
 *   node scripts/function-truth-unit.mjs
 *
 * 锁死意图 vs 观察分离:
 * - FT-01 优先链:用户 > 种子导入 > 文档 > 扫描 > 猜测,**照片不参与**。
 * - FT-02 照片冲突只生成 drift,不改 effective(评审要求用例 1、2)。
 * - FT-03 纠正把旧 effective 压入 history。
 */
import assert from 'node:assert/strict'
import {
  resolveFunction,
  observedDrift,
  surfaceTypeOf,
  recordUserFunction,
  recordSessionImport,
  isUserConfirmed,
} from '../src/lib/spatial/function-truth.js'

const T0 = Date.parse('2026-07-16T00:00:00Z')

const pl = (kind, fn) => ({ id: 'p1', kind, label: kind, x: 0, y: 0, w: 36, h: 36, rotation: 0, attrs: fn ? { function: fn } : undefined })

// FT-01 优先链 —— 各档
{
  // 无证据 → 猜测(按 kind)
  assert.deepEqual(resolveFunction(pl('folding_table')), { key: 'dining', source: 'guess' })
  assert.deepEqual(resolveFunction(pl('desk')), { key: 'work-surface', source: 'guess' })
  assert.deepEqual(resolveFunction(pl('bed_king')), { key: 'sleep-only', source: 'guess' })

  // 扫描 < 文档 < 种子导入 < 用户
  assert.equal(resolveFunction(pl('folding_table', { byScan: { key: 'work-surface' } })).source, 'scan')
  assert.equal(
    resolveFunction(pl('folding_table', { byScan: { key: 'work-surface' }, byDocument: { key: 'dining' } })).source,
    'document',
  )
  assert.equal(
    resolveFunction(pl('folding_table', {
      byScan: { key: 'work-surface' },
      byDocument: { key: 'dining' },
      bySessionImport: { key: 'diet-equipment-station', at: '' },
    })).source,
    'user-session-import',
  )
  const full = pl('folding_table', {
    byScan: { key: 'work-surface' },
    byDocument: { key: 'dining' },
    bySessionImport: { key: 'general-storage', at: '' },
    byUser: { key: 'diet-equipment-station', at: '' },
  })
  assert.deepEqual(resolveFunction(full), { key: 'diet-equipment-station', source: 'user' })
  assert.equal(isUserConfirmed(full), true)
  assert.equal(isUserConfirmed(pl('folding_table', { bySessionImport: { key: 'x', at: '' } })), false)
}

// FT-02 用例1:用户确认永远压过后续照片观察 —— 照片不进 effective
{
  const p = pl('cabinet', {
    byUser: { key: 'photography', at: '2026-07-01T00:00:00Z' },
    observedByPhoto: { key: 'general-storage', at: '2026-07-14T00:00:00Z', confidence: 0.9 },
  })
  // effective 仍是用户确认的摄影柜,照片里的按摩枪不改它
  assert.deepEqual(resolveFunction(p), { key: 'photography', source: 'user' })
  // 用例2:照片冲突只生成 drift 提示
  const d = observedDrift(p)
  assert.equal(d.drift, true)
  assert.equal(d.reasonCode, 'FUNCTION_OBSERVED_DRIFT')
  assert.deepEqual(d.params, { observedKey: 'general-storage', effectiveKey: 'photography', confidence: 0.9 })

  // 观察与 effective 一致 → 无 drift
  const same = pl('cabinet', {
    byUser: { key: 'photography', at: '' },
    observedByPhoto: { key: 'photography', at: '', confidence: 0.5 },
  })
  assert.equal(observedDrift(same).drift, false)
  // 无照片 → 无 drift
  assert.equal(observedDrift(pl('cabinet')).drift, false)
}

// FT-03 纠正把旧 effective 压入 history,并置 byUser
{
  const p = pl('folding_table', { byScan: { key: 'work-surface' } })
  const attrs = recordUserFunction(p, 'diet-equipment-station', T0)
  assert.equal(attrs.function.byUser.key, 'diet-equipment-station')
  assert.equal(attrs.function.byUser.at, new Date(T0).toISOString())
  // 旧 effective(scan/work-surface)进历史
  assert.equal(attrs.function.history.length, 1)
  assert.deepEqual(attrs.function.history[0], { key: 'work-surface', source: 'scan', at: new Date(T0).toISOString() })
  // 原扫描证据不丢
  assert.deepEqual(attrs.function.byScan, { key: 'work-surface' })

  // 种子导入写 bySessionImport,不写 byUser
  const seeded = recordSessionImport(pl('cabinet'), 'photography', T0)
  assert.equal(seeded.function.bySessionImport.key, 'photography')
  assert.equal(seeded.function.byUser, undefined)

  // 重复确认同一 key 不再刷历史
  const again = recordUserFunction({ ...p, attrs }, 'diet-equipment-station', T0)
  assert.equal(again.function.history.length, 1)
}

// 表面策略(SF）—— B2 的关键:prohibited 无论用途都禁储物,diet-equipment 是 fixed
{
  // 灶台:kind 级硬规则,禁止储物面
  assert.equal(surfaceTypeOf(pl('stove')).mode, 'prohibited-storage')
  // 围栏:禁止储物面(顶部)
  assert.equal(surfaceTypeOf(pl('pet_pen')).mode, 'prohibited-storage')
  // 折叠桌确认为饮食设备站 → 固定设备面 + 批准类目
  const diet = pl('folding_table', { byUser: { key: 'diet-equipment-station', at: '' } })
  const sp = surfaceTypeOf(diet)
  assert.equal(sp.mode, 'fixed-equipment')
  assert.deepEqual(sp.allowedCategories, ['stove', 'fridge'])
  // 床:睡眠专用 → 禁止储物面(床面不是长期储物面)
  assert.equal(surfaceTypeOf(pl('bed_king')).mode, 'prohibited-storage')
  // 覆写优先
  assert.equal(surfaceTypeOf(pl('stove', undefined)).mode, 'prohibited-storage')
  const overridden = { ...pl('cabinet'), attrs: { surfacePolicy: { mode: 'temporary-activity', maxTemporaryHours: 48 } } }
  assert.equal(surfaceTypeOf(overridden).mode, 'temporary-activity')
}

console.log('function-truth-unit: ok')
