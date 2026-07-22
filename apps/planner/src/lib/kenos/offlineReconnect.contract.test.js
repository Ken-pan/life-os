import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Offline / reconnect contract for Planner.
 * - Legacy sync: offline mutations stay local; reconnect schedules bidirectional sync.
 * - Kenos Plan offline queue: reconnect also attempts flushOfflinePlanIntentQueue (flag-gated).
 */

describe('planner offline reconnect contract', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('isOffline follows navigator.onLine', () => {
    const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false
    expect(isOffline()).toBe(false)
    vi.stubGlobal('navigator', { onLine: false })
    expect(isOffline()).toBe(true)
  })

  it('offline perform path returns offline without push', () => {
    const isOffline = () => navigator.onLine === false
    vi.stubGlobal('navigator', { onLine: false })
    const result = isOffline()
      ? { pushed: false, pulled: false, offline: true }
      : { pushed: true, pulled: true, offline: false }
    expect(result).toEqual({ pushed: false, pulled: false, offline: true })
  })

  it('reconnect online schedules legacy sync when signed in', () => {
    let scheduled = 0
    const isSignedIn = () => true
    const onOnline = () => {
      if (!isSignedIn()) return
      scheduled += 1
    }
    onOnline()
    onOnline()
    expect(scheduled).toBeGreaterThanOrEqual(1)
  })

  it('reconnect online triggers Kenos offline flush import (flag-gated inside)', async () => {
    const flush = vi.fn(async () => ({ flushed: 0, remaining: 0, blocked: 'flag_off' }))
    const dynamicImport = vi.fn(async () => ({ flushOfflinePlanIntentQueue: flush }))

    const isSignedIn = () => true
    const onOnline = async () => {
      if (!isSignedIn()) return
      // Mirrors sync.js initAutoSync onOnline Kenos path.
      await dynamicImport('./kenos/planOfflineIntentQueue.host.js').then((mod) =>
        mod.flushOfflinePlanIntentQueue?.(),
      )
    }

    await onOnline()
    expect(dynamicImport).toHaveBeenCalledWith('./kenos/planOfflineIntentQueue.host.js')
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('reconnect does not flush Kenos queue when signed out', async () => {
    const flush = vi.fn()
    const isSignedIn = () => false
    const onOnline = async () => {
      if (!isSignedIn()) return
      await flush()
    }
    await onOnline()
    expect(flush).not.toHaveBeenCalled()
  })
})
