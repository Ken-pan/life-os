// State Engine v0 纯函数测试(零 $lib/$app 依赖,node --test 直接跑)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveState,
  latestCheckin,
  recentSleeps,
  healthDaysToSleepObs,
  recommendPolicy,
  DIMENSION_ORDER,
} from './stateEngine.core.js'

const NOW = Date.parse('2026-07-16T14:00:00')
const HOUR = 3600 * 1000

const agentIdle = {
  online: true,
  phase: 'normal',
  score: 0,
  limitSeconds: 1200,
  note: '',
  breaksToday: 0,
  todayNetMinutes: 0,
  warnsToday: 0,
}

test('无任何数据:全 unknown,headline 提示先记录', () => {
  const { dims, headline } = deriveState({ now: NOW, observations: [], agent: { online: false } })
  for (const k of DIMENSION_ORDER) {
    assert.equal(dims[k].level, 'unknown', k)
    assert.ok(dims[k].reasons.length > 0, `${k} 必须解释缺什么`)
  }
  assert.equal(headline.k, 'state.h_noData')
})

test('每个维度都必须带 reasons(可解释性合同)', () => {
  const obs = [
    { ts: NOW - HOUR, type: 'checkin', energy: 4, stress: 2 },
    { ts: NOW - 6 * HOUR, type: 'sleep', hours: 7.5 },
  ]
  const { dims } = deriveState({ now: NOW, observations: obs, agent: agentIdle })
  for (const k of DIMENSION_ORDER) {
    assert.ok(dims[k].reasons.length > 0, `${k} 缺 reasons`)
    for (const r of dims[k].reasons) assert.match(r.k, /^state\.r_/)
  }
})

test('良好状态:精力足/压力低/睡眠够 → allGood', () => {
  const obs = [
    { ts: NOW - HOUR, type: 'checkin', energy: 4, stress: 2 },
    { ts: NOW - 6 * HOUR, type: 'sleep', hours: 7.5 },
  ]
  const { dims, headline } = deriveState({ now: NOW, observations: obs, agent: agentIdle })
  assert.equal(dims.energy.level, 'good')
  assert.equal(dims.stress.level, 'good')
  assert.equal(dims.sleepDebt.level, 'good')
  assert.equal(dims.physical.level, 'good')
  assert.equal(headline.k, 'state.h_allGood')
})

test('高负荷少休息 → recovery watch,并成为 headline', () => {
  const obs = [
    { ts: NOW - HOUR, type: 'checkin', energy: 4, stress: 2 },
    { ts: NOW - 6 * HOUR, type: 'sleep', hours: 7.5 },
  ]
  const agent = { ...agentIdle, todayNetMinutes: 130, breaksToday: 0 }
  const { dims, headline } = deriveState({ now: NOW, observations: obs, agent })
  assert.equal(dims.recovery.level, 'watch')
  assert.equal(headline.k, 'state.h_recovery')
})

test('长负荷会把精力下调一档并解释', () => {
  const obs = [
    { ts: NOW - HOUR, type: 'checkin', energy: 4, stress: 2 },
    { ts: NOW - 6 * HOUR, type: 'sleep', hours: 7.5 },
  ]
  const agent = { ...agentIdle, todayNetMinutes: 180, breaksToday: 3 }
  const { dims } = deriveState({ now: NOW, observations: obs, agent })
  assert.equal(dims.energy.level, 'ok')
  assert.ok(dims.energy.reasons.some((r) => r.k === 'state.r_highLoad'))
})

test('压力反向量表 + 多次预警上调:stress 5 → bad 优先级最高', () => {
  const obs = [
    { ts: NOW - HOUR, type: 'checkin', energy: 2, stress: 4 },
    { ts: NOW - 6 * HOUR, type: 'sleep', hours: 5.5 },
  ]
  const agent = { ...agentIdle, warnsToday: 2 }
  const { dims, headline } = deriveState({ now: NOW, observations: obs, agent })
  assert.equal(dims.stress.level, 'bad')
  assert.ok(dims.stress.reasons.some((r) => r.k === 'state.r_warns'))
  assert.equal(headline.k, 'state.h_stress')
})

test('单晚睡够但近几晚均值欠债 → good 降为 ok', () => {
  const obs = [
    { ts: NOW - 54 * HOUR, type: 'sleep', hours: 5 },
    { ts: NOW - 30 * HOUR, type: 'sleep', hours: 5.5 },
    { ts: NOW - 6 * HOUR, type: 'sleep', hours: 8 },
  ]
  const { dims } = deriveState({ now: NOW, observations: obs, agent: agentIdle })
  assert.equal(dims.sleepDebt.level, 'ok')
  assert.ok(dims.sleepDebt.reasons.some((r) => r.k === 'state.r_sleepAvg'))
})

test('只有代理数据、手动维度大面积缺数据 → 不宣称状态不错,引导记录', () => {
  const { dims, headline } = deriveState({ now: NOW, observations: [], agent: agentIdle })
  assert.equal(dims.focus.level, 'good')
  assert.equal(headline.k, 'state.h_noData')
})

test('focus 相位:休息中 → ok;接近窗口 → watch', () => {
  const breaking = deriveState({
    now: NOW,
    observations: [],
    agent: { ...agentIdle, phase: 'breaking' },
  })
  assert.equal(breaking.dims.focus.level, 'ok')
  assert.equal(breaking.headline.k, 'state.h_breaking')

  const near = deriveState({
    now: NOW,
    observations: [],
    agent: { ...agentIdle, score: 1100 },
  })
  assert.equal(near.dims.focus.level, 'watch')
})

test('选择器:过期 check-in 不算;睡眠 24h 外不算昨晚', () => {
  const stale = [{ ts: NOW - 20 * HOUR, type: 'checkin', energy: 5, stress: 1 }]
  assert.equal(latestCheckin(stale, NOW), null)

  const old = [{ ts: NOW - 30 * HOUR, type: 'sleep', hours: 8 }]
  assert.equal(recentSleeps(old, NOW).last, null)
  assert.equal(recentSleeps(old, NOW).recent.length, 1)
})

test('测量睡眠优先于手动:同一晚 health 覆盖 manual', () => {
  const night = Date.parse('2026-07-16T08:00:00')
  const obs = [
    { ts: night, type: 'sleep', hours: 8, source: undefined }, // 手动高报
    { ts: night + 60_000, type: 'sleep', hours: 5.5, source: 'health' }, // 测量偏低
  ]
  const { last, recent } = recentSleeps(obs, night + 2 * HOUR)
  assert.equal(recent.length, 1, '同一晚只留一条')
  assert.equal(last.source, 'health')
  assert.equal(last.hours, 5.5)
})

test('healthDaysToSleepObs:只取有 sleepHours 的天,标 source', () => {
  const obs = healthDaysToSleepObs([
    { date: '2026-07-15', sleepHours: 6.5, restingHR: 57 },
    { date: '2026-07-14', restingHR: 58 }, // 无睡眠 → 跳过
  ])
  assert.equal(obs.length, 1)
  assert.equal(obs[0].type, 'sleep')
  assert.equal(obs[0].source, 'health')
  assert.equal(obs[0].hours, 6.5)
})

test('recommendPolicy:状态好不覆盖;睡眠债 bad → 12 分钟', () => {
  const good = recommendPolicy(
    { sleepDebt: { level: 'good' }, stress: { level: 'ok' }, recovery: { level: 'good' }, energy: { level: 'good' } },
    20,
  )
  assert.equal(good.driver, null)
  assert.equal(good.limitMinutes, 20)

  const debt = recommendPolicy(
    { sleepDebt: { level: 'bad' }, stress: { level: 'ok' }, recovery: { level: 'good' }, energy: { level: 'good' } },
    20,
  )
  assert.equal(debt.driver, 'sleepDebt')
  assert.equal(debt.limitMinutes, 12)

  const watch = recommendPolicy(
    { sleepDebt: { level: 'good' }, stress: { level: 'watch' }, recovery: { level: 'good' }, energy: { level: 'good' } },
    20,
  )
  assert.equal(watch.driver, 'stress')
  assert.equal(watch.limitMinutes, 16)
})

test('recommendPolicy:unknown 不触发收紧', () => {
  const rec = recommendPolicy(
    { sleepDebt: { level: 'unknown' }, stress: { level: 'unknown' }, recovery: { level: 'unknown' }, energy: { level: 'unknown' } },
    20,
  )
  assert.equal(rec.driver, null)
})
