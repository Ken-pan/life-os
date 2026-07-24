import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isTransientChatError } from './cloudChat.core.js'

describe('isTransientChatError', () => {
  it('retries transient upstream/gateway/network errors', () => {
    assert.equal(isTransientChatError(new Error('upstream_error')), true)
    assert.equal(isTransientChatError(new Error('kimi_502')), true)
    assert.equal(isTransientChatError(new Error('kimi_503')), true)
    assert.equal(isTransientChatError(new Error('kimi_429')), true)
    assert.equal(isTransientChatError(new Error('gateway 502')), true)
    assert.equal(isTransientChatError(new Error('gateway 500')), true)
    const te = new TypeError('Load failed')
    assert.equal(isTransientChatError(te), true)
    assert.equal(isTransientChatError(new Error('network error')), true)
  })
  it('does NOT retry config / client errors (retry is pointless)', () => {
    assert.equal(isTransientChatError(new Error('kimi_not_configured')), false)
    assert.equal(isTransientChatError(new Error('not_configured')), false)
    assert.equal(isTransientChatError(new Error('forbidden_origin')), false)
    assert.equal(isTransientChatError(new Error('bad_messages')), false)
    assert.equal(isTransientChatError(new Error('bad_prompt')), false)
    assert.equal(isTransientChatError(new Error('kimi_vision_unsupported')), false)
    assert.equal(isTransientChatError(new Error('kimi_400')), false)
    assert.equal(isTransientChatError(new Error('kimi_401')), false)
  })
})
