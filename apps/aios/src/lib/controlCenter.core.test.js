import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildTodayReadModel,
  sortActivityNewestFirst,
  summarizeControlQueue,
} from './kenos/controlCenter.core.js'

describe('Kenos Phase 2 control center read model', () => {
  it('turns the existing Portal summary into domain-owned next actions', () => {
    const model = buildTodayReadModel({
      ok: true,
      asOf: '2026-07-19T12:00:00Z',
      planner: { todayOpen: 3, overdue: 2 },
      finance: { monthSurplus: 500, monthIncome: 900, monthExpense: 400 },
      fitness: { workedOutToday: false, lastSessionDate: '2026-07-18' },
    })

    assert.deepEqual(
      {
        id: model.priorities[0].id,
        tone: model.priorities[0].tone,
        href: model.priorities[0].href,
      },
      {
        id: 'plan-overdue',
        tone: 'critical',
        href: 'https://planner.kenos.space/upcoming',
      },
    )
    assert.deepEqual(model.signals.map((signal) => signal.id), ['training', 'money'])
  })

  it('fails soft when the legacy read model is unavailable', () => {
    assert.deepEqual(buildTodayReadModel(null), {
      asOf: null,
      priorities: [],
      signals: [],
      emptyReason: '今日读模型尚未连接。各 Space 仍可独立使用。',
    })
  })

  it('counts open control items without treating terminal records as pending', () => {
    assert.deepEqual(
      summarizeControlQueue({
        inbox: [{ status: 'open' }, { status: 'classified' }],
        approvals: [{ status: 'pending' }, { status: 'approved' }],
        activities: [{ status: 'failed' }, { status: 'succeeded' }],
      }),
      { inboxOpen: 1, approvalsOpen: 1, activityFailures: 1 },
    )
  })

  it('sorts activity by canonical timestamp without mutating the source', () => {
    const records = [
      { id: 'old', occurredAt: '2026-07-18T10:00:00Z' },
      { id: 'new', occurredAt: '2026-07-19T10:00:00Z' },
    ]
    assert.deepEqual(sortActivityNewestFirst(records).map((item) => item.id), ['new', 'old'])
    assert.deepEqual(records.map((item) => item.id), ['old', 'new'])
  })
})
