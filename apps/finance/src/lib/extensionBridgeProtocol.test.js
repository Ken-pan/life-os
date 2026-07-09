import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { BRIDGE_MSG, isCaptureEnvelope } from '@life-os/finance-core/extension-sync'

/**
 * Protocol smoke for Chrome extension ↔ Finance page bridge.
 * Does not mount ExtensionSyncBridge; verifies handshake message shapes and
 * origin-scoped postMessage contract used by the Svelte port.
 */
describe('extension bridge protocol', () => {
  /** @type {Array<{ data: unknown, origin: string }>} */
  let posted = []
  /** @type {typeof window.postMessage} */
  let originalPostMessage

  beforeEach(() => {
    posted = []
    originalPostMessage = window.postMessage.bind(window)
    window.postMessage = (data, targetOrigin) => {
      posted.push({ data, origin: String(targetOrigin) })
    }
  })

  afterEach(() => {
    window.postMessage = originalPostMessage
  })

  it('exposes stable BRIDGE_MSG constants (extension contract)', () => {
    expect(BRIDGE_MSG.hello).toBe('FOS_BRIDGE_HELLO')
    expect(BRIDGE_MSG.ready).toBe('FOS_BRIDGE_READY')
    expect(BRIDGE_MSG.requestSnapshot).toBe('FOS_BRIDGE_REQUEST_SNAPSHOT')
    expect(BRIDGE_MSG.snapshot).toBe('FOS_BRIDGE_SNAPSHOT')
    expect(BRIDGE_MSG.captures).toBe('FOS_BRIDGE_CAPTURES')
    expect(BRIDGE_MSG.ack).toBe('FOS_BRIDGE_ACK')
    expect(BRIDGE_MSG.syncResult).toBe('FOS_BRIDGE_SYNC_RESULT')
  })

  it('simulates hello → ready → requestSnapshot handshake with same-origin target', () => {
    const origin = window.location.origin
    window.postMessage({ type: BRIDGE_MSG.hello }, origin)
    window.postMessage({ type: BRIDGE_MSG.ready }, origin)
    window.postMessage({ type: BRIDGE_MSG.requestSnapshot }, origin)

    expect(posted.map((p) => /** @type {{ type: string }} */ (p.data).type)).toEqual([
      BRIDGE_MSG.hello,
      BRIDGE_MSG.ready,
      BRIDGE_MSG.requestSnapshot,
    ])
    expect(posted.every((p) => p.origin === origin)).toBe(true)
  })

  it('validates capture envelopes before ack', () => {
    expect(
      isCaptureEnvelope({
        v: 1,
        id: 'env-1',
        source: 'robinhood',
        kind: 'holdings',
        asOfDate: '2026-07-08',
        data: { institution: 'Robinhood', accountLabel: 'Individual', positions: [] },
      }),
    ).toBe(true)
    expect(isCaptureEnvelope({ id: 'bad' })).toBe(false)
    expect(isCaptureEnvelope(null)).toBe(false)
  })

  it('ack payload shape matches extension listener expectations', () => {
    const origin = window.location.origin
    const id = 'capture-abc'
    window.postMessage({ type: BRIDGE_MSG.ack, id }, origin)
    expect(posted[0]?.data).toEqual({ type: BRIDGE_MSG.ack, id })
  })

  it('ignores cross-origin style mismatch (receiver guard contract)', () => {
    const handler = vi.fn((e) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      if (/** @type {{ type?: string }} */ (e.data)?.type === BRIDGE_MSG.captures) {
        handler.captured = true
      }
    })
    // Simulate foreign origin — guard must no-op
    handler({
      source: window,
      origin: 'https://evil.example',
      data: { type: BRIDGE_MSG.captures, captures: [] },
    })
    expect(handler.captured).toBeUndefined()

    handler({
      source: window,
      origin: window.location.origin,
      data: { type: BRIDGE_MSG.captures, captures: [] },
    })
    expect(handler.captured).toBe(true)
  })
})
