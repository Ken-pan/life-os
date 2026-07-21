import assert from 'node:assert/strict'
import { describe, it, beforeEach, mock } from 'node:test'

const scheduleCalls = []
const cancelCalls = []
const bridgeState = {
  available: false,
  localNotifications: false,
}

mock.module('@life-os/platform-web/kenos-native-bridge', {
  namedExports: {
    isNativeBridgeAvailable: () => bridgeState.available,
    getNativeCapabilities: async () => ({
      ok: true,
      capabilities: { localNotifications: bridgeState.localNotifications },
    }),
    hasNativeLocalNotifications: (caps) =>
      Boolean(caps?.capabilities?.localNotifications ?? bridgeState.localNotifications),
    nativeNotificationsSchedule: async (payload) => {
      scheduleCalls.push(payload)
      return { ok: true }
    },
    nativeNotificationsCancel: async (payload) => {
      cancelCalls.push(payload)
      return { ok: true }
    },
  },
})

const {
  scheduleDailyBriefAlert,
  syncApprovalAlerts,
  syncDeliverableDueAlerts,
  __resetNativeAlertCachesForTests,
} = await import('./nativeLocalAlerts.js')

describe('nativeLocalAlerts', () => {
  beforeEach(() => {
    scheduleCalls.length = 0
    cancelCalls.length = 0
    bridgeState.available = false
    bridgeState.localNotifications = false
    __resetNativeAlertCachesForTests()
    globalThis.localStorage = {
      store: {},
      getItem(k) {
        return this.store[k] ?? null
      },
      setItem(k, v) {
        this.store[k] = String(v)
      },
    }
  })

  it('skips schedule when Continuity native alerts unavailable', async () => {
    const r = await scheduleDailyBriefAlert({
      title: 'Brief',
      body: 'hello',
      dayKey: '2026-07-21',
    })
    assert.equal(r.skipped, true)
    assert.equal(scheduleCalls.length, 0)
  })

  it('schedules daily brief on Continuity', async () => {
    bridgeState.available = true
    bridgeState.localNotifications = true
    const r = await scheduleDailyBriefAlert({
      title: 'Brief',
      body: '3 tasks',
      dayKey: '2026-07-21',
    })
    assert.equal(r.ok, true)
    assert.equal(scheduleCalls.length, 1)
    assert.equal(scheduleCalls[0].type, 'kenos_daily_brief')
    assert.equal(scheduleCalls[0].deduplicationKey, 'kenos-daily-brief-2026-07-21')
  })

  it('schedules each pending approval only once', async () => {
    bridgeState.available = true
    bridgeState.localNotifications = true
    const approvals = [
      { id: 'a1', status: 'pending', safeImpactSummary: 'Move task' },
      { id: 'a2', status: 'expired', safeImpactSummary: 'skip' },
    ]
    const first = await syncApprovalAlerts(approvals)
    assert.equal(first.scheduled, 1)
    const second = await syncApprovalAlerts(approvals)
    assert.equal(second.scheduled, 0)
  })

  it('skips demo approval spam', async () => {
    bridgeState.available = true
    bridgeState.localNotifications = true
    const r = await syncApprovalAlerts(
      [{ id: 'a1', status: 'pending', safeImpactSummary: 'x' }],
      { demo: true },
    )
    assert.equal(r.code, 'demo')
    assert.equal(scheduleCalls.length, 0)
  })

  it('schedules deliverable due with future fireAt', async () => {
    bridgeState.available = true
    bridgeState.localNotifications = true
    const dueAt = new Date(Date.now() + 3600_000).toISOString()
    const r = await syncDeliverableDueAlerts([
      {
        kind: 'deliverable_due_soon',
        id: 'deliverable-due:d1',
        title: 'Spec',
        entityRef: { id: 'd1' },
        dueAt,
      },
    ])
    assert.equal(r.scheduled, 1)
    assert.equal(scheduleCalls[0].type, 'work_deliverable_due')
    assert.equal(scheduleCalls[0].deduplicationKey, 'work-due-d1')
  })
})
