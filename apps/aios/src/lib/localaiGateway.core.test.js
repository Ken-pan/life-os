import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_GATEWAY,
  SAME_ORIGIN_GATEWAY,
  isBuiltinGatewayUrl,
  isLoopbackHost,
  resolveGatewayUrl,
  shouldUseSameOriginLocalAiProxy,
} from './localaiGateway.core.js'

describe('localaiGateway.core', () => {
  it('detects loopback', () => {
    assert.equal(isLoopbackHost('127.0.0.1'), true)
    assert.equal(isLoopbackHost('localhost'), true)
    assert.equal(isLoopbackHost('::1'), true)
    assert.equal(isLoopbackHost('10.20.202.15'), false)
  })

  it('uses same-origin proxy on phone-reachable private hosts', () => {
    assert.equal(
      shouldUseSameOriginLocalAiProxy('Kens-M5-Max-MacBook-Pro.local'),
      true,
    )
    assert.equal(
      shouldUseSameOriginLocalAiProxy(
        'kens-m5-max-macbook-pro.tail04e0e6.ts.net',
      ),
      true,
    )
    assert.equal(shouldUseSameOriginLocalAiProxy('100.111.7.15'), true)
    assert.equal(shouldUseSameOriginLocalAiProxy('10.20.202.15'), true)
    assert.equal(shouldUseSameOriginLocalAiProxy('192.168.1.1'), true)
    assert.equal(shouldUseSameOriginLocalAiProxy('100.50.0.1'), false)
    assert.equal(shouldUseSameOriginLocalAiProxy('127.0.0.1'), false)
    assert.equal(shouldUseSameOriginLocalAiProxy('www.kenos.space'), false)
  })

  it('prefers explicit override, then env, then auto proxy, then loopback', () => {
    assert.equal(
      resolveGatewayUrl({
        override: 'http://example.tailnet:18888/',
        hostname: '10.0.0.1',
      }),
      'http://example.tailnet:18888',
    )
    assert.equal(
      resolveGatewayUrl({
        envGateway: 'http://10.0.0.2:18888',
        hostname: '10.0.0.1',
      }),
      'http://10.0.0.2:18888',
    )
    assert.equal(
      resolveGatewayUrl({
        hostname: 'kens-m5-max-macbook-pro.tail04e0e6.ts.net',
      }),
      SAME_ORIGIN_GATEWAY,
    )
    assert.equal(resolveGatewayUrl({ hostname: '127.0.0.1' }), DEFAULT_GATEWAY)
    assert.equal(
      resolveGatewayUrl({ hostname: 'www.kenos.space' }),
      DEFAULT_GATEWAY,
    )
  })

  it('ignores stale loopback overrides on Tailscale / LAN hosts', () => {
    assert.equal(
      resolveGatewayUrl({
        override: 'http://127.0.0.1:18888',
        hostname: 'kens-m5-max-macbook-pro.tail04e0e6.ts.net',
      }),
      SAME_ORIGIN_GATEWAY,
    )
    assert.equal(
      resolveGatewayUrl({
        override: 'http://localhost:18888',
        hostname: '10.20.202.15',
      }),
      SAME_ORIGIN_GATEWAY,
    )
  })

  it('classifies builtin gateway urls', () => {
    assert.equal(isBuiltinGatewayUrl(DEFAULT_GATEWAY), true)
    assert.equal(isBuiltinGatewayUrl(SAME_ORIGIN_GATEWAY), true)
    assert.equal(isBuiltinGatewayUrl('http://100.1.2.3:18888'), false)
  })
})
