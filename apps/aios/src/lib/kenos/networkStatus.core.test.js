import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canRetryReconnect,
  reconnectDelayMs,
  shouldReconnectAfterOnline,
} from './networkStatus.core.js'

describe('networkStatus.core', () => {
  it('reconnects only after offline→online transition', () => {
    assert.equal(shouldReconnectAfterOnline({ online: true, wasOffline: true }), true)
    assert.equal(shouldReconnectAfterOnline({ online: true, wasOffline: false }), false)
    assert.equal(shouldReconnectAfterOnline({ online: false, wasOffline: true }), false)
  })

  it('bounds reconnect delays and attempts', () => {
    assert.equal(reconnectDelayMs(0), 0)
    assert.equal(reconnectDelayMs(99), 4000)
    assert.equal(canRetryReconnect(0), true)
    assert.equal(canRetryReconnect(4), true)
    assert.equal(canRetryReconnect(5), false)
  })
})
