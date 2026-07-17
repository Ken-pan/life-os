import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBriefText,
  buildTaskCapturePayload,
  expenseAmt,
  formatLifeOsToday,
  resolvePeriod,
  ymd,
} from './lifeos.core.js'

test('resolvePeriod covers common keywords', () => {
  const today = '2026-07-17'
  assert.deepEqual(resolvePeriod({ period: 'today' }, today), {
    from: today,
    to: today,
    label: '今天',
  })
  assert.equal(resolvePeriod({ period: 'this_month' }, today).from, '2026-07-01')
  assert.equal(resolvePeriod({ period: 'last_month' }, today).from, '2026-06-01')
  assert.equal(resolvePeriod({ period: 'last_month' }, today).to, '2026-06-30')
  assert.equal(resolvePeriod({ from: '2026-01-01', to: '2026-01-31' }, today).label, '2026-01-01 ~ 2026-01-31')
})

test('expenseAmt prefers budget_impact', () => {
  assert.equal(expenseAmt({ budget_impact: -12.5, amount: 99 }), 12.5)
  assert.equal(expenseAmt({ amount: -8 }), 8)
})

test('formatLifeOsToday formats AIOS.20 snapshot slices', () => {
  const text = formatLifeOsToday({
    ok: true,
    asOf: '2026-07-17',
    planner: { todayOpen: 2, overdue: 1 },
    finance: { monthExpense: 100, monthIncome: 200, monthSurplus: 100 },
    fitness: { workedOutToday: false, lastSessionDate: '2026-07-15', lastDayId: 'A' },
    music: { trackTitle: 'Helplessness Blues', trackArtist: 'Fleet Foxes' },
    home: { storageZoneCount: 4 },
  })
  assert.match(text, /今天到期 2 项,逾期 1 项/)
  assert.match(text, /支出 ¥100/)
  assert.match(text, /今天还没训练,上次 2026-07-15 \(A\)/)
  assert.match(text, /Helplessness Blues/)
  assert.match(text, /收纳分区 4/)
})

test('buildTaskCapturePayload matches AIOS.21 core.task_captured shape', () => {
  const { payload } = buildTaskCapturePayload(
    { title: '买牛奶', notes: '全脂', dueDate: '2026-07-18' },
    { now: () => '11111111-1111-4111-8111-111111111111' },
  )
  // 对齐 packages/contracts CoreTaskCapturedSchema（不直 import .ts，避免 node --test 无 loader）
  assert.equal(payload.source, 'aios')
  assert.equal(payload.title, '买牛奶')
  assert.equal(payload.notes, '全脂')
  assert.equal(payload.due_date, '2026-07-18')
  assert.equal(payload.capture_id, '11111111-1111-4111-8111-111111111111')
  assert.deepEqual(Object.keys(payload).sort(), [
    'capture_id',
    'due_date',
    'notes',
    'source',
    'title',
  ])
})

test('buildTaskCapturePayload rejects empty title and bad dueDate', () => {
  assert.equal(buildTaskCapturePayload({ title: '  ' }).error, 'empty_title')
  const { payload } = buildTaskCapturePayload(
    { title: 'x', dueDate: 'tomorrow' },
    { now: () => '11111111-1111-4111-8111-111111111111' },
  )
  assert.equal(payload.due_date, undefined)
})

test('buildBriefText packs morning brief bits', () => {
  const brief = buildBriefText(
    {
      planner: { todayOpen: 1, overdue: 0 },
      finance: { monthExpense: 42 },
      fitness: { workedOutToday: true },
    },
    new Date('2026-07-17T15:00:00Z'),
  )
  assert.match(brief.title, /今日简报/)
  assert.match(brief.body, /1 项今日待办/)
  assert.match(brief.body, /本月支出 ¥42/)
  assert.match(brief.body, /今天已训练/)
  assert.equal(buildBriefText(null), null)
})

test('ymd formats in PT', () => {
  // Fixed UTC instant → America/Los_Angeles calendar day
  assert.match(ymd(new Date('2026-07-17T20:00:00Z')), /^\d{4}-\d{2}-\d{2}$/)
})
