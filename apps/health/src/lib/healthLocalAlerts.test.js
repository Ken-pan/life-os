import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@life-os/platform-web/kenos-native-bridge', () => ({
  isNativeBridgeAvailable: vi.fn(() => false),
  getNativeCapabilities: vi.fn(async () => ({ ok: false })),
  hasNativeLocalNotifications: vi.fn(() => false),
  nativeNotificationsSchedule: vi.fn(async () => ({ ok: true })),
  nativeNotificationsRequestPermission: vi.fn(async () => ({
    ok: true,
    status: 'authorized',
  })),
  nativeNotificationsGetStatus: vi.fn(async () => ({
    ok: true,
    status: 'authorized',
  })),
}))

import * as bridge from '@life-os/platform-web/kenos-native-bridge'
import {
  decideHealthAlerts,
  syncHealthLocalAlerts,
  __resetHealthAlertCachesForTests,
} from './healthLocalAlerts.js'

describe('healthLocalAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetHealthAlertCachesForTests()
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
    }
  })

  it('wind-down only after 21:00 with elevated sleep debt', () => {
    expect(
      decideHealthAlerts({ sleepDebtLevel: 'bad', agentPhase: 'normal', hour: 20 }),
    ).toEqual({ windDown: false, focusWarn: false })
    expect(
      decideHealthAlerts({ sleepDebtLevel: 'watch', agentPhase: 'normal', hour: 21 }),
    ).toEqual({ windDown: true, focusWarn: false })
  })

  it('focus warn when agent phase is warning', () => {
    expect(
      decideHealthAlerts({ sleepDebtLevel: 'good', agentPhase: 'warning', hour: 14 }),
    ).toEqual({ windDown: false, focusWarn: true })
  })

  it('schedules once per day on Continuity', async () => {
    bridge.isNativeBridgeAvailable.mockReturnValue(true)
    bridge.hasNativeLocalNotifications.mockReturnValue(true)
    bridge.getNativeCapabilities.mockResolvedValue({
      ok: true,
      capabilities: { localNotifications: true },
    })
    const now = new Date(2026, 6, 21, 22, 0, 0)
    const first = await syncHealthLocalAlerts({
      sleepDebtLevel: 'bad',
      agentPhase: 'warning',
      now,
    })
    expect(first.scheduled).toBe(2)
    const second = await syncHealthLocalAlerts({
      sleepDebtLevel: 'bad',
      agentPhase: 'warning',
      now,
    })
    expect(second.scheduled).toBe(0)
  })

  it('respects enabled:false without calling bridge schedule', async () => {
    bridge.isNativeBridgeAvailable.mockReturnValue(true)
    bridge.hasNativeLocalNotifications.mockReturnValue(true)
    const r = await syncHealthLocalAlerts({
      sleepDebtLevel: 'bad',
      agentPhase: 'warning',
      now: new Date(2026, 6, 21, 22, 0, 0),
      enabled: false,
    })
    expect(r.code).toBe('disabled')
    expect(bridge.nativeNotificationsSchedule).not.toHaveBeenCalled()
  })
})
