import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_GATEWAY,
  SAME_ORIGIN_GATEWAY,
  isBuiltinGatewayUrl,
  isLoopbackHost,
  isUsableInjectedGateway,
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

  it('injected tailnet gateway replaces loopback default on public origins', () => {
    const injected = 'https://kens-m5-max-macbook-pro.tail04e0e6.ts.net'
    // 生产 origin(公网 hostname)+ 壳注入 → 走 tailnet HTTPS,手机离开 Mac 也可达
    assert.equal(
      resolveGatewayUrl({ hostname: 'www.kenos.space', injected }),
      injected,
    )
    // Daily Beta / LAN origin:同域代理仍然优先(更直接,无需证书)
    assert.equal(
      resolveGatewayUrl({
        hostname: 'kens-m5-max-macbook-pro.tail04e0e6.ts.net',
        injected,
      }),
      SAME_ORIGIN_GATEWAY,
    )
    // 用户显式覆盖仍最高
    assert.equal(
      resolveGatewayUrl({
        override: 'https://custom.example:1234',
        hostname: 'www.kenos.space',
        injected,
      }),
      'https://custom.example:1234',
    )
    // 无注入(非壳环境)→ 保持 loopback 默认,桌面行为零变化
    assert.equal(
      resolveGatewayUrl({ hostname: 'www.kenos.space' }),
      DEFAULT_GATEWAY,
    )
  })

  it('rejects unusable injected gateways (http / non-tailnet / garbage)', () => {
    assert.equal(isUsableInjectedGateway('https://kens.tail04e0e6.ts.net'), true)
    // http 会被 https 页的混合内容策略拦截 → 不可用
    assert.equal(isUsableInjectedGateway('http://kens.tail04e0e6.ts.net'), false)
    // 非 tailnet 主机不收(注入面防线:壳只应下发 tailnet)
    assert.equal(isUsableInjectedGateway('https://evil.example.com'), false)
    assert.equal(isUsableInjectedGateway(''), false)
    assert.equal(isUsableInjectedGateway('not a url'), false)
    // 不可用注入 → 回退 loopback,不炸
    assert.equal(
      resolveGatewayUrl({ hostname: 'www.kenos.space', injected: 'http://x.ts.net' }),
      DEFAULT_GATEWAY,
    )
  })

  it('classifies builtin gateway urls', () => {
    assert.equal(isBuiltinGatewayUrl(DEFAULT_GATEWAY), true)
    assert.equal(isBuiltinGatewayUrl(SAME_ORIGIN_GATEWAY), true)
    assert.equal(isBuiltinGatewayUrl('http://100.1.2.3:18888'), false)
  })
})
