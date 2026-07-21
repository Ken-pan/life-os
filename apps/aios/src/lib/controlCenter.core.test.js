import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildAssistantAttentionBrief,
  buildTodayOverviewLine,
  buildTodayReadModel,
  buildLegacyTodayShadowProjection,
  buildTodayShadowProjection,
  resolveSpaceLiveDetail,
  selectTodayDynamicSpaces,
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
      ['plan', 'training', 'money'],
    )
    assert.equal(model.priorities[0].ownerDomain, 'plan')
    assert.equal(model.signals.find((s) => s.id === 'money')?.source, 'portal_today_summary.finance')
    assert.equal(model.signals.find((s) => s.id === 'plan')?.value, '2 项逾期')
    assert.equal(model.signals[0].futureActionAllowed, false)
    assert.match(String(model.overview || ''), /逾期/)
    assert.equal(model.status, 'ready')
  })

  it('fails soft when the legacy read model is unavailable', () => {
    assert.deepEqual(buildTodayReadModel(null), {
      asOf: null,
      priorities: [],
      signals: [],
      overview: null,
      emptyReason: '今日摘要尚未连接。各空间仍可独立使用。',
      source: 'public.portal_today_summary',
      status: 'unavailable',
    })
  })

  it('prefers live Plan copy on Today space rows and filters to changed spaces', () => {
    const model = buildTodayReadModel(
      {
        ok: true,
        asOf: '2026-07-19T12:00:00Z',
        planner: { todayOpen: 3, overdue: 0 },
        fitness: { workedOutToday: false, lastSessionDate: '2026-07-18' },
      },
      { now: Date.parse('2026-07-19T12:05:00Z') },
    )
    assert.equal(
      resolveSpaceLiveDetail('plan', {
        signals: model.signals,
        fallback: '任务 · 日程 · 即将到期',
      }),
      '3 项今天到期 · 从最重要的一项开始',
    )
    assert.deepEqual(
      selectTodayDynamicSpaces(
        [{ id: 'plan' }, { id: 'training' }, { id: 'knowledge' }],
        { signals: model.signals },
      ).map((s) => s.id),
      ['plan', 'training'],
    )
    assert.deepEqual(
      selectTodayDynamicSpaces(
        [{ id: 'plan' }, { id: 'training' }],
        { signals: [] },
      ),
      [],
    )
    assert.match(
      buildTodayOverviewLine({
        priorities: model.priorities,
        signals: model.signals,
        queue: { inboxOpen: 1, approvalsOpen: 0 },
      }),
      /今天到期/,
    )
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

  it('builds an Assistant steward brief from Plan / Training / Inbox', () => {
    const brief = buildAssistantAttentionBrief({
      summary: {
        ok: true,
        planner: { overdue: 1, todayOpen: 0 },
        fitness: { workedOutToday: true, todayCompleted: false },
      },
      queue: { inboxOpen: 2, approvalsOpen: 0 },
      session: {
        authenticationState: 'signed_in',
        accountSyncState: 'synced',
        inboxSyncState: 'ready',
        crossSpaceSummaryState: 'ready',
        needsSignIn: false,
        showTodaySkeleton: false,
        cloudAuthorized: true,
      },
    })
    assert.deepEqual(brief.bullets, [
      '1 项计划任务已逾期',
      '训练进行中，还未收尾',
      '收件箱有 2 项待确认',
    ])
    assert.equal(brief.ask, '你想先处理哪一项？')
    assert.equal(brief.availability, 'ready')
    assert.equal(brief.prompts.length, 3)
  })

  it('does not claim empty attention when summary / inbox are unread', () => {
    const brief = buildAssistantAttentionBrief({
      summary: null,
      queue: { inboxOpen: null, approvalsOpen: null, inboxAvailable: false },
      session: {
        authenticationState: 'signed_out',
        accountSyncState: 'disconnected',
        inboxSyncState: 'locked',
        crossSpaceSummaryState: 'locked',
        needsSignIn: true,
        showTodaySkeleton: false,
        cloudAuthorized: false,
      },
    })
    assert.match(brief.bullets[0], /连接 Kenos 账户/)
    assert.doesNotMatch(brief.bullets.join(' '), /没有急需|没有需要立即/)
    assert.equal(brief.availability, 'unavailable')
  })

  it('shows syncing copy while cross-space state is still loading', () => {
    const brief = buildAssistantAttentionBrief({
      summary: null,
      queue: { inboxOpen: null, approvalsOpen: null },
      session: {
        authenticationState: 'signed_in',
        accountSyncState: 'syncing',
        inboxSyncState: 'syncing',
        crossSpaceSummaryState: 'syncing',
        needsSignIn: false,
        showTodaySkeleton: true,
        cloudAuthorized: true,
      },
    })
    assert.match(brief.bullets[0], /正在检查/)
    assert.equal(brief.availability, 'syncing')
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
