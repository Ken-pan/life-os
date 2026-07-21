import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@life-os/platform-web/kenos-native-bridge', () => ({
  isNativeBridgeAvailable: vi.fn(() => false),
  getNativeCapabilities: vi.fn(async () => ({ ok: false })),
  hasNativeLocalNotifications: vi.fn(() => false),
  nativeNotificationsSchedule: vi.fn(async () => ({ ok: true })),
  nativeNotificationsCancel: vi.fn(async () => ({ ok: true })),
}))

import * as bridge from '@life-os/platform-web/kenos-native-bridge'
import {
  selectBillDueCandidates,
  localMorningMs,
  syncBillDueAlerts,
  setBillRemindersEnabled,
  __resetBillAlertCachesForTests,
} from './billLocalAlerts.js'

describe('billLocalAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetBillAlertCachesForTests()
    bridge.isNativeBridgeAvailable.mockReturnValue(false)
    bridge.hasNativeLocalNotifications.mockReturnValue(false)
    globalThis.localStorage = {
      store: {},
      getItem(k) {
        return this.store[k] ?? null
      },
      setItem(k, v) {
        this.store[k] = String(v)
      },
      removeItem(k) {
        delete this.store[k]
      },
    }
    setBillRemindersEnabled(true)
  })

  it('selects outflow open bills within horizon; skips amounts in selection logic', () => {
    const now = new Date(2026, 6, 21, 10, 0, 0)
    const rows = [
      {
        id: 'a',
        label: 'Rent',
        date: '2026-07-25',
        expectedAmount: -1200,
        state: 'upcoming',
      },
      {
        id: 'b',
        label: 'Paycheck',
        date: '2026-07-22',
        expectedAmount: 3000,
        state: 'upcoming',
      },
      {
        id: 'c',
        label: 'Card',
        date: '2026-08-20',
        expectedAmount: -200,
        state: 'planned',
      },
      {
        id: 'd',
        label: 'Done',
        date: '2026-07-22',
        expectedAmount: -50,
        state: 'matched',
      },
    ]
    const picked = selectBillDueCandidates(rows, { now, horizonDays: 14 })
    expect(picked.map((r) => r.id)).toEqual(['a'])
  })

  it('localMorningMs is local 09:00', () => {
    const ms = localMorningMs('2026-07-25', 9)
    const d = new Date(ms)
    expect(d.getHours()).toBe(9)
    expect(d.getDate()).toBe(25)
  })

  it('schedules Continuity bill without amount in body', async () => {
    bridge.isNativeBridgeAvailable.mockReturnValue(true)
    bridge.hasNativeLocalNotifications.mockReturnValue(true)
    bridge.getNativeCapabilities.mockResolvedValue({
      ok: true,
      capabilities: { localNotifications: true },
    })
    const now = new Date(2026, 6, 21, 10, 0, 0)
    const r = await syncBillDueAlerts(
      [
        {
          id: 'bill-1',
          label: 'Rent',
          date: '2026-07-25',
          expectedAmount: -1200.55,
          state: 'upcoming',
        },
      ],
      { now },
    )
    expect(r.ok).toBe(true)
    expect(r.scheduled).toBe(1)
    const arg = bridge.nativeNotificationsSchedule.mock.calls[0][0]
    expect(arg.type).toBe('money_bill_due')
    expect(arg.safeBody).toBe('Rent · 2026-07-25')
    expect(arg.safeBody).not.toMatch(/1200/)
    expect(arg.deduplicationKey).toBe('money-bill-bill-1')
  })

  it('skips when reminders disabled', async () => {
    bridge.isNativeBridgeAvailable.mockReturnValue(true)
    bridge.hasNativeLocalNotifications.mockReturnValue(true)
    bridge.getNativeCapabilities.mockResolvedValue({
      ok: true,
      capabilities: { localNotifications: true },
    })
    setBillRemindersEnabled(false)
    const r = await syncBillDueAlerts([
      {
        id: 'bill-1',
        label: 'Rent',
        date: '2026-07-25',
        expectedAmount: -100,
        state: 'upcoming',
      },
    ])
    expect(r.cleared).toBe(true)
    expect(bridge.nativeNotificationsSchedule).not.toHaveBeenCalled()
  })
})
