/**
 * 整理计划单测(规范 §1.3, 评审 B2)。不需要 dev server / VLM。
 *   node scripts/tidy-plan-unit.mjs
 *
 * 首个 tidy-plan 单测,锁死表面策略门控:
 * - TP-01 普通台面:照旧「清空台面」。
 * - TP-02 固定设备站(确认为饮食设备站的折叠桌):**不要求清空**,保留设备只清外溢物。
 * - TP-03 禁止储物面(炉灶):doneWhen 硬性「一件不留」。
 */
import assert from 'node:assert/strict'
import { buildTidyPlan } from '../src/lib/spatial/tidy-plan.js'

const CIRC = { blockedDoors: [], isolatedZones: [], bottlenecks: [], zoneStats: [] }

function project(placement) {
  return {
    zones: [{ id: 'z1', nameZh: '工作区', polygon: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }] }],
    placements: placement ? [placement] : [],
    viewpoints: [
      { id: 'v1', zoneId: 'z1', x: 100, y: 100, observations: { surfaces: 2 }, describedAt: '2026-07-16', items: ['蛋白粉', '快递盒'] },
    ],
  }
}

const surfacesTask = (p) => buildTidyPlan(p, CIRC).tasks.find((t) => t.kind === 'surfaces')

// TP-01 普通区(无特殊表面)→ 清空台面
{
  const t = surfacesTask(project())
  assert.ok(t, '应有台面任务')
  assert.match(t.title, /清空.*台面/)
  assert.ok(t.doneWhen.some((d) => /台面至少 70% 是空/.test(d)))
  assert.ok(!t.doneWhen.some((d) => /禁放面/.test(d)))
}

// TP-02 固定设备站:确认为饮食设备站的折叠桌 → 保留设备、不一刀切清空
{
  const table = {
    id: 'pl-ft', kind: 'folding_table', label: '折叠桌', x: 50, y: 50, w: 108, h: 72, rotation: 0, zoneId: 'z1',
    attrs: { function: { byUser: { key: 'diet-equipment-station', at: '2026-07-01T00:00:00Z' } } },
  }
  const t = surfacesTask(project(table))
  assert.match(t.title, /保留设备站/, '固定设备站标题应提示保留')
  assert.ok(t.reason.includes('固定设备站'), 'reason 应说明是设备站')
  assert.ok(t.steps.some((s) => s.includes('保留') && s.includes('折叠桌')), '步骤应保留折叠桌')
  assert.ok(t.steps.some((s) => /散热/.test(s)), '应提示留散热空间')
  // 关键:doneWhen 不再无条件要求「台面70%空」,而是「设备站之外」
  assert.ok(t.doneWhen.some((d) => /设备站之外/.test(d)), 'doneWhen 应豁免设备站')
  assert.ok(!t.doneWhen.some((d) => /^台面至少 70% 是空/.test(d)), '不该无条件要求清空')
}

// TP-03 禁止储物面:炉灶 → doneWhen 硬性一件不留
{
  const stove = { id: 'pl-stove', kind: 'stove', label: '炉灶', x: 50, y: 50, w: 72, h: 60, rotation: 0, zoneId: 'z1' }
  const t = surfacesTask(project(stove))
  assert.ok(t.doneWhen.some((d) => /禁放面.*一件不留/.test(d)), '炉灶应有禁放面硬约束')
}

console.log('tidy-plan-unit: ok')
