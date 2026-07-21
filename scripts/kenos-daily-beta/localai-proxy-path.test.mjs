import assert from 'node:assert/strict'
import { normalizeProxyPath, usesChatSlot } from './localai-proxy-path.mjs'

assert.equal(normalizeProxyPath('/v1/models'), '/v1/models')
assert.equal(normalizeProxyPath('v1/chat/completions'), '/v1/chat/completions')
assert.equal(normalizeProxyPath('//evil.example/v1'), null)
assert.equal(normalizeProxyPath('/http://evil/v1'), null)
assert.equal(normalizeProxyPath('/../secrets'), null)
assert.equal(normalizeProxyPath('/v1/../admin'), null)
assert.equal(normalizeProxyPath('/v1/./models'), '/v1/models')

assert.equal(usesChatSlot('POST', '/v1/chat/completions'), true)
assert.equal(usesChatSlot('POST', '/v1/completions'), true)
assert.equal(usesChatSlot('GET', '/v1/models'), false)
assert.equal(usesChatSlot('POST', '/v1/embeddings'), false)

console.log('localai-proxy-path.test.mjs: ok')
