import assert from 'node:assert/strict'
import {
  dayLabel,
  formatReadinessHint,
  formatRecentSessions,
  formatTodayTraining,
} from './mcpFitness.mjs'

assert.equal(dayLabel('chest'), '胸')
assert.equal(dayLabel('unknown_day'), 'unknown_day')

{
  const t = formatTodayTraining({
    workedOutToday: true,
    todayCompleted: false,
    todayDayId: 'chest',
    lastSessionDate: '2026-07-17',
    lastDayId: 'back',
  })
  assert.match(t, /今天：胸（进行中）/)
  assert.match(t, /最近一次：2026-07-17 · 背/)
}

{
  const empty = formatTodayTraining(null)
  assert.match(empty, /还没有训练摘要/)
}

{
  const text = formatRecentSessions(
    [
      { session_date: '2026-07-18', day_id: 'legs', ended_at: 'x' },
      { session_date: '2026-07-16', day_id: 'arms', started_at: 'y' },
    ],
    { limit: 7 },
  )
  assert.match(text, /最近 2 次/)
  assert.match(text, /腿 · 完成/)
  assert.match(text, /臂 · 进行中/)
}

{
  const low = formatReadinessHint([
    { sets: [{ rir: 0 }, { rir: 0 }, { rir: 1 }, { rir: 0 }] },
    { sets: [{ rir: 0 }, { rir: 1 }, { rir: 0 }, { rir: 0 }] },
  ])
  assert.match(low, /偏疲劳/)
}

{
  const short = formatReadinessHint([{ sets: [{ rir: 2 }] }])
  assert.match(short, /不足/)
}

console.log('mcpFitness.test.mjs: ok')
