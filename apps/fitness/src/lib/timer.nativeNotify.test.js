import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@life-os/platform-web/kenos-native-bridge', () => ({
  isNativeBridgeAvailable: vi.fn(() => false),
  getNativeCapabilities: vi.fn(async () => ({ ok: false, skipped: true })),
  hasNativeLocalNotifications: vi.fn(() => false),
  nativeNotificationsCancel: vi.fn(async () => ({ ok: true })),
  nativeNotificationsGetStatus: vi.fn(async () => ({ ok: true, status: 'not_determined' })),
  nativeNotificationsRequestPermission: vi.fn(async () => ({
    ok: true,
    status: 'authorized',
  })),
  nativeNotificationsSchedule: vi.fn(async () => ({ ok: true })),
}))

import * as nativeBridge from '@life-os/platform-web/kenos-native-bridge'
import {
  notificationCapability,
  refreshNotificationCapability,
  __resetNativeNotifyCacheForTests,
} from './timer.svelte.js'

describe('Fitness native notification capability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetNativeNotifyCacheForTests()
    nativeBridge.isNativeBridgeAvailable.mockReturnValue(false)
    nativeBridge.hasNativeLocalNotifications.mockReturnValue(false)
  })

  it('reports native channel default before status probe', () => {
    nativeBridge.isNativeBridgeAvailable.mockReturnValue(true)
    const cap = notificationCapability()
    expect(cap.channel).toBe('native')
    expect(cap.kind).toBe('default')
  })

  it('refresh maps authorized status to granted', async () => {
    nativeBridge.isNativeBridgeAvailable.mockReturnValue(true)
    nativeBridge.hasNativeLocalNotifications.mockReturnValue(true)
    nativeBridge.getNativeCapabilities.mockResolvedValue({
      ok: true,
      capabilities: { localNotifications: true },
      status: { localNotifications: 'authorized' },
    })
    const cap = await refreshNotificationCapability()
    expect(cap).toEqual({ kind: 'granted', channel: 'native' })
  })

  it('falls back to web capability outside Continuity', () => {
    nativeBridge.isNativeBridgeAvailable.mockReturnValue(false)
    const cap = notificationCapability()
    expect(cap.channel === 'web' || cap.kind === 'unsupported' || cap.kind === 'ios-browser').toBe(
      true,
    )
  })
})
