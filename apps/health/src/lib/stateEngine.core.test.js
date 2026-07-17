// State Engine v1 纯函数测试(信号驱动,零 $lib/$app 依赖,node --test 直接跑)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveState,
  recentSleeps,
  healthDaysToSleepObs,
  recommendPolicy,
  metricSeries,
  trendSummary,
  DIMENSION_ORDER,
} from './stateEngine.core.js'

const NOW = Date.parse('2026-07-16T14:00:00')

const day = (n) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** N 天历史基线(默认 6 天,足够建基线) */
const history = ({ hrv = 50, rhr = 56, sleep = 7.5, steps = 8000, n = 6 } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    date: day(i + 1),
    hrv,
    restingHR: rhr,
    sleepHours: sleep,
    steps,
  }))

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

test('无任何数据:关键维度 unknown,headline 引导连数据', () => {
  const { dims, headline } = deriveState({ now: NOW, health: [], agent: { online: false } })
  for (const k of ['energy', 'stress', 'sleepDebt', 'physical']) {
    assert.equal(dims[k].level, 'unknown', k)
    assert.ok(dims[k].reasons.length > 0, `${k} 要解释缺什么`)
  }
  assert.equal(headline.k, 'state.h_noData')
})

test('每个维度都带 reasons(可解释性合同)', () => {
  const health = [{ date: day(0), hrv: 52, restingHR: 55, sleepHours: 7.5, steps: 9000 }, ...history()]
  const { dims } = deriveState({ now: NOW, health, agent: agentIdle })
  for (const k of DIMENSION_ORDER) {
    assert.ok(dims[k].reasons.length > 0, `${k} 缺 reasons`)
    for (const r of dims[k].reasons) assert.match(r.k, /^state\.r_/)
  }
})

test('测量良好(睡够/HRV 达基线/静息心率正常)→ allGood,零手动输入', () => {
  const health = [{ date: day(0), hrv: 52, restingHR: 55, sleepHours: 7.5, steps: 9000 }, ...history()]
  const { dims, headline } = deriveState({ now: NOW, health, agent: agentIdle })
  assert.equal(dims.sleepDebt.level, 'good')
  assert.equal(dims.stress.level, 'good')
  assert.equal(dims.recovery.level, 'good')
  assert.equal(dims.energy.level, 'good')
  assert.equal(dims.physical.level, 'good')
  assert.equal(headline.k, 'state.h_allGood')
})

test('HRV 显著低于基线 → 压力 bad(HRV 是自主神经压力代理)', () => {
  const health = [{ date: day(0), hrv: 32, restingHR: 56, sleepHours: 7.5 }, ...history()]
  const { dims, headline } = deriveState({ now: NOW, health, agent: agentIdle })
  assert.equal(dims.stress.level, 'bad')
  assert.ok(dims.stress.reasons.some((r) => r.k === 'state.r_hrvToday'))
  assert.equal(headline.k, 'state.h_stress')
})

test('静息心率高于基线 +10 → 恢复 bad,精力被下调', () => {
  const health = [{ date: day(0), hrv: 50, restingHR: 66, sleepHours: 7.5 }, ...history()]
  const { dims } = deriveState({ now: NOW, health, agent: agentIdle })
  assert.equal(dims.recovery.level, 'bad')
  assert.ok(dims.recovery.reasons.some((r) => r.k === 'state.r_rhrToday'))
  assert.notEqual(dims.energy.level, 'good') // rhr 升高把精力从 good 压下来
})

test('昨晚睡眠不足 → 睡眠债 bad(测量,非手动)', () => {
  const health = [{ date: day(0), hrv: 50, restingHR: 56, sleepHours: 4.5 }, ...history()]
  const { dims, headline } = deriveState({ now: NOW, health, agent: agentIdle })
  assert.equal(dims.sleepDebt.level, 'bad')
  assert.ok(dims.sleepDebt.reasons.some((r) => r.k === 'state.r_sleepLastMeasured'))
  assert.equal(headline.k, 'state.h_sleepDebt')
})

test('有今日 HRV 但历史不足 4 天 → 压力 unknown,提示基线不足', () => {
  const health = [
    { date: day(0), hrv: 45 },
    { date: day(1), hrv: 50 },
    { date: day(2), hrv: 50 },
  ]
  const { dims } = deriveState({ now: NOW, health, agent: agentIdle })
  assert.equal(dims.stress.level, 'unknown')
  assert.ok(dims.stress.reasons.some((r) => r.k === 'state.r_needBaseline'))
})

test('多次逼近强制休息把压力再压一档', () => {
  const health = [{ date: day(0), hrv: 46, restingHR: 56, sleepHours: 7.5 }, ...history()] // 46/50=0.92 → ok
  const base = deriveState({ now: NOW, health, agent: agentIdle })
  assert.equal(base.dims.stress.level, 'ok')
  const warned = deriveState({ now: NOW, health, agent: { ...agentIdle, warnsToday: 2 } })
  assert.equal(warned.dims.stress.level, 'watch')
})

test('无生理信号但代理在线:恢复回落到负荷启发式', () => {
  const { dims } = deriveState({
    now: NOW,
    health: [],
    agent: { ...agentIdle, todayNetMinutes: 130, breaksToday: 0 },
  })
  assert.equal(dims.recovery.level, 'watch')
})

test('focus 相位:休息中 → ok;接近窗口 → watch', () => {
  const breaking = deriveState({ now: NOW, health: [], agent: { ...agentIdle, phase: 'breaking' } })
  assert.equal(breaking.dims.focus.level, 'ok')
  assert.equal(breaking.headline.k, 'state.h_breaking')
  const near = deriveState({ now: NOW, health: [], agent: { ...agentIdle, score: 1100 } })
  assert.equal(near.dims.focus.level, 'watch')
})

test('recentSleeps:今天/昨天算昨晚,>36h 外不算', () => {
  const fresh = [{ date: day(2), sleepHours: 5 }, { date: day(1), sleepHours: 5.5 }, { date: day(0), sleepHours: 8 }]
  const r = recentSleeps(fresh, NOW)
  assert.equal(r.last.hours, 8)
  assert.equal(r.recent.length, 3)

  const stale = [{ date: day(3), sleepHours: 8 }]
  assert.equal(recentSleeps(stale, NOW).last, null)
})

test('healthDaysToSleepObs:只取有 sleepHours 的天', () => {
  const obs = healthDaysToSleepObs([
    { date: '2026-07-15', sleepHours: 6.5, restingHR: 57 },
    { date: '2026-07-14', restingHR: 58 },
  ])
  assert.equal(obs.length, 1)
  assert.equal(obs[0].type, 'sleep')
  assert.equal(obs[0].hours, 6.5)
})

test('recommendPolicy:状态好不覆盖;睡眠债 bad → 12 分钟;watch → 16', () => {
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

test('metricSeries:对齐连续日期,缺的天填 null', () => {
  const health = [
    { date: day(2), hrv: 48 },
    { date: day(0), hrv: 52 },
  ] // 缺 day(1)
  const s = metricSeries(health, 'hrv', 3, NOW)
  assert.equal(s.values.length, 3)
  assert.deepEqual(s.values, [48, null, 52]) // 旧→新,中间缺 null
  assert.equal(s.iso.length, 3)
  assert.equal(s.iso[2], day(0))
})

test('trendSummary:近 7 天均值 + 相对前 7 天方向', () => {
  // 前 7 天均值 5,后 7 天均值 7 → 上升
  const values = [...Array(7).fill(5), ...Array(7).fill(7)]
  const t = trendSummary(values, 7)
  assert.equal(t.recent, 7)
  assert.equal(t.prior, 5)
  assert.equal(t.dir, 'up')
  assert.equal(t.n, 7)

  // 无前段 → dir na
  assert.equal(trendSummary([7, 7, 7], 7).dir, 'na')
  // 全空 → na
  assert.equal(trendSummary([null, null], 7).dir, 'na')
  // 变化 <3% → flat
  assert.equal(trendSummary([...Array(7).fill(7), ...Array(7).fill(7.1)], 7).dir, 'flat')
})

test('recommendPolicy:unknown 不触发收紧', () => {
  const rec = recommendPolicy(
    { sleepDebt: { level: 'unknown' }, stress: { level: 'unknown' }, recovery: { level: 'unknown' }, energy: { level: 'unknown' } },
    20,
  )
  assert.equal(rec.driver, null)
})
