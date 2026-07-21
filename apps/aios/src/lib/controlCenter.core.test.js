import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildTodayReadModel,
  buildLegacyTodayShadowProjection,
  buildTodayShadowProjection,
  sortActivityNewestFirst,
  summarizeControlQueue,
} from './kenos/controlCenter.core.js'

describe('Kenos Phase 2 control center read model', () => {
  it('turns the existing Portal summary into domain-owned next actions', () => {
    const model = buildTodayReadModel(
      {
        ok: true,
        asOf: '2026-07-19T12:00:00Z',
        planner: { todayOpen: 3, overdue: 2 },
        finance: { monthSurplus: 500, monthIncome: 900, monthExpense: 400 },
        fitness: { workedOutToday: false, lastSessionDate: '2026-07-18' },
      },
      { now: Date.parse('2026-07-19T12:05:00Z') },
    )

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
    assert.deepEqual(
      model.signals.map((signal) => signal.id),
      ['training', 'money'],
    )
    assert.equal(model.priorities[0].ownerDomain, 'plan')
    assert.equal(model.signals[1].source, 'portal_today_summary.finance')
    assert.equal(model.signals[1].futureActionAllowed, false)
    assert.equal(model.status, 'ready')
  })

  it('fails soft when the legacy read model is unavailable', () => {
    assert.deepEqual(buildTodayReadModel(null), {
      asOf: null,
      priorities: [],
      signals: [],
      emptyReason: '今日读模型尚未连接。各 Space 仍可独立使用。',
      source: 'public.portal_today_summary',
      status: 'unavailable',
    })
  })

  it('surfaces Health readiness without vitals when Portal summary is offline', () => {
    const model = buildTodayReadModel(null, {
      now: Date.parse('2026-07-19T12:05:00Z'),
      healthReadiness: {
        version: 1,
        asOf: '2026-07-19T12:00:00Z',
        source: 'healthkit',
        dayCount: 7,
        dims: {
          energy: 'watch',
          focus: 'unknown',
          recovery: 'watch',
          stress: 'ok',
          sleepDebt: 'bad',
          physical: 'watch',
        },
        headlineKey: 'state.h_sleepDebt',
        focusCapacity: 'low',
        training: { code: 'recover', trained: false },
        policy: { driver: 'sleepDebt', limitMinutes: 12 },
      },
    })
    assert.ok(model.priorities.some((p) => p.id === 'health-readiness'))
    assert.ok(model.signals.some((s) => s.id === 'health'))
    assert.doesNotMatch(JSON.stringify(model), /sleepHours|hrv|restingHR/)
  })

  it('counts open control items without treating terminal records as pending', () => {
    assert.deepEqual(
      summarizeControlQueue({
        inbox: [{ status: 'open' }, { status: 'classified' }],
        approvals: [{ status: 'pending' }, { status: 'approved' }],
        activities: [{ status: 'failed' }, { status: 'succeeded' }],
        sources: {
          inbox: { status: 'ready' },
          approvals: { status: 'ready' },
          activity: { status: 'ready' },
        },
      }),
      {
        inboxOpen: 1,
        approvalsOpen: 1,
        activityFailures: 1,
        inboxAvailable: true,
        approvalsAvailable: true,
        activityAvailable: true,
      },
    )
  })

  it('returns null counts when sources are unavailable instead of fake zeros', () => {
    assert.deepEqual(
      summarizeControlQueue({
        inbox: [],
        approvals: [],
        activities: [],
        sources: {
          inbox: { status: 'unavailable' },
          approvals: { status: 'permission_denied' },
          activity: { status: 'offline' },
        },
      }),
      {
        inboxOpen: null,
        approvalsOpen: null,
        activityFailures: null,
        inboxAvailable: false,
        approvalsAvailable: false,
        activityAvailable: false,
      },
    )
  })

  it('sorts activity by canonical timestamp without mutating the source', () => {
    const records = [
      { id: 'old', occurredAt: '2026-07-18T10:00:00Z' },
      { id: 'new', occurredAt: '2026-07-19T10:00:00Z' },
    ]
    assert.deepEqual(
      sortActivityNewestFirst(records).map((item) => item.id),
      ['new', 'old'],
    )
    assert.deepEqual(
      records.map((item) => item.id),
      ['old', 'new'],
    )
  })

  it('normalizes legacy and Today cards to the same shadow comparison shape', () => {
    const summary = {
      ok: true,
      asOf: '2026-07-19T12:00:00Z',
      planner: { todayOpen: 1, overdue: 0 },
      finance: { monthSurplus: 1, monthIncome: 2, monthExpense: 1 },
    }
    const options = { now: Date.parse('2026-07-19T12:05:00Z') }
    assert.deepEqual(
      buildTodayShadowProjection(buildTodayReadModel(summary, options)),
      buildLegacyTodayShadowProjection(summary, options),
    )
  })
})
