import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONTROL_SNAPSHOT_MAX_AGE_MS,
  CONTROL_SNAPSHOT_VERSION,
  buildControlSnapshot,
  planControlHydration,
  refreshTransitionSourceState,
} from './controlSnapshot.core.js'

const NOW = 1_700_000_000_000
const UID = 'user-1'

function readyControl(overrides = {}) {
  return {
    demo: false,
    summary: { ok: true, planner: { todayOpen: 3 } },
    inbox: [{ id: 'i1' }],
    approvals: [],
    activities: [{ id: 'a1' }],
    focusContexts: [],
    workProjects: [],
    workCards: [],
    sources: {
      today: {
        status: 'ready',
        source: 'public.portal_today_summary',
        lastUpdated: NOW - 1000,
        availableCount: 1,
      },
      inbox: {
        status: 'empty',
        source: 'public.life_events',
        lastUpdated: NOW - 1000,
        availableCount: 0,
      },
      approvals: { status: 'loading', source: 'x' },
    },
    ...overrides,
  }
}

describe('controlSnapshot.core buildControlSnapshot', () => {
  it('builds a user-scoped snapshot from readable sources only', () => {
    const snap = buildControlSnapshot(readyControl(), { userId: UID, now: NOW })
    assert.ok(snap)
    assert.equal(snap.v, CONTROL_SNAPSHOT_VERSION)
    assert.equal(snap.userId, UID)
    assert.equal(snap.savedAt, NOW)
    assert.equal(snap.summary.planner.todayOpen, 3)
    assert.deepEqual(Object.keys(snap.sourceMeta).sort(), ['inbox', 'today'])
    assert.equal(snap.sourceMeta.today.availableCount, 1)
  })

  it('refuses demo, missing user, and all-loading controls', () => {
    assert.equal(
      buildControlSnapshot(readyControl({ demo: true }), { userId: UID }),
      null,
    )
    assert.equal(buildControlSnapshot(readyControl(), { userId: '' }), null)
    const loading = readyControl({
      sources: { today: { status: 'loading', source: 'x' } },
    })
    assert.equal(buildControlSnapshot(loading, { userId: UID }), null)
  })

  it('caps persisted list sizes', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `x${i}` }))
    const snap = buildControlSnapshot(readyControl({ inbox: many }), {
      userId: UID,
      now: NOW,
    })
    assert.equal(snap.inbox.length, 30)
  })
})

describe('controlSnapshot.core planControlHydration', () => {
  const validSnap = () =>
    buildControlSnapshot(readyControl(), { userId: UID, now: NOW })

  it('hydrates matching user with stale-downgraded sources', () => {
    const plan = planControlHydration(validSnap(), {
      userId: UID,
      now: NOW + 60_000,
    })
    assert.ok(plan)
    assert.equal(plan.fields.summary.ok, true)
    assert.equal(plan.sources.today.status, 'stale')
    assert.equal(plan.sources.today.stale, true)
    assert.equal(plan.sources.inbox.status, 'stale')
    assert.ok(plan.sources.today.message.includes('上次同步'))
    // 未快照的源不出现(保持外部默认,不伪造状态)
    assert.equal(plan.sources.approvals, undefined)
  })

  it('fail-closed on user mismatch / missing user', () => {
    assert.equal(
      planControlHydration(validSnap(), { userId: 'other', now: NOW }),
      null,
    )
    assert.equal(planControlHydration(validSnap(), { userId: '', now: NOW }), null)
  })

  it('rejects expired, future-dated, and wrong-version snapshots', () => {
    const snap = validSnap()
    assert.equal(
      planControlHydration(snap, {
        userId: UID,
        now: NOW + CONTROL_SNAPSHOT_MAX_AGE_MS + 1,
      }),
      null,
    )
    assert.equal(
      planControlHydration(
        { ...snap, savedAt: NOW + 10 * 60_000 },
        { userId: UID, now: NOW },
      ),
      null,
    )
    assert.equal(
      planControlHydration({ ...snap, v: 99 }, { userId: UID, now: NOW }),
      null,
    )
    assert.equal(planControlHydration(null, { userId: UID, now: NOW }), null)
  })
})

describe('controlSnapshot.core refreshTransitionSourceState', () => {
  it('keeps readable sources visible as stale during refetch', () => {
    const next = refreshTransitionSourceState(
      {
        status: 'ready',
        source: 's',
        lastUpdated: NOW,
        availableCount: 2,
      },
      true,
    )
    assert.equal(next.status, 'stale')
    assert.equal(next.stale, true)
    assert.equal(next.availableCount, 2)
    assert.equal(next.lastUpdated, NOW)
  })

  it('drops to loading when nothing is retained or source was unreadable', () => {
    assert.equal(
      refreshTransitionSourceState({ status: 'ready', source: 's' }, false)
        .status,
      'loading',
    )
    assert.equal(
      refreshTransitionSourceState(
        { status: 'permission_denied', source: 's' },
        true,
      ).status,
      'loading',
    )
  })
})
