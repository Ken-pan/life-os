import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCursorSendScript,
  corsHeadersFor,
  extractToken,
  isLoopbackAddress,
  jwtExpiryMs,
  looksLikeJwt,
  parseConsoleLocked,
  pickBubbleFetch,
} from './cursorBridge.core.mjs'

describe('cursorBridge edge cases', () => {
  it('CORS rejects lookalike and mutated origins', () => {
    for (const evil of [
      'https://kenos.space.evil.com',
      'https://evilkenos.space',
      'https://www.kenos.space.attacker.io',
      'http://kenos.space', // http 降级不允许
      'https://localhost', // https localhost 非白名单形态
      'null',
      'file://',
      'tauri://evil',
      'http://tauri.localhost.evil.com',
    ]) {
      assert.equal(corsHeadersFor(evil), null, evil)
    }
  })

  it('AppleScript injection cannot escape the string literal', () => {
    const hostile = '"\ntell application "System Events" to keystroke "rm -rf ~"\n"'
    const s = buildCursorSendScript(hostile)
    // 敌意内容必须整体停留在 clipboard 字面量里:注入的引号都被转义
    const clipLine = s.split('\n').find((l) => l.includes('set the clipboard to') && !l.includes('savedClipboard'))
    assert.ok(clipLine.includes('\\"'))
    // 变成脚本行的只有我们自己的固定行
    const dangerous = s.split('\n').filter((l) => l.trim().startsWith('tell application "System Events"'))
    assert.equal(dangerous.length, 1) // 只有我们自己的 System Events 块
    const bs = buildCursorSendScript('back\\slash "quote"')
    assert.ok(bs.includes('back\\\\slash \\"quote\\"'))
  })

  it('pickBubbleFetch survives hostile counts', () => {
    const headers = [{ bubbleId: 'a' }, { bubbleId: 'b' }]
    assert.deepEqual(pickBubbleFetch({ headers, seenCount: -5, lastSeenId: 'a' }), { mode: 'all' })
    assert.deepEqual(pickBubbleFetch({ headers, seenCount: 9999, lastSeenId: 'b' }), {
      mode: 'ids',
      ids: [],
    })
    assert.deepEqual(pickBubbleFetch({ headers, seenCount: Number.NaN }), { mode: 'all' })
    assert.deepEqual(pickBubbleFetch({ headers: [], seenCount: 0 }), { mode: 'all' })
    // 非法 bubbleId 被过滤,不进 SQL
    const bad = [{ bubbleId: 'ok-1' }, { bubbleId: "x'; DROP--" }, { bubbleId: 'ok-2' }]
    const r = pickBubbleFetch({ headers: bad, seenCount: 1, lastSeenId: 'ok-1' })
    assert.deepEqual(r.ids, ['ok-2'])
  })

  it('jwt helpers survive malformed input', () => {
    assert.equal(looksLikeJwt(''), false)
    assert.equal(looksLikeJwt(null), false)
    assert.equal(looksLikeJwt('a.b'), false)
    assert.equal(jwtExpiryMs('..'), 0)
    assert.equal(jwtExpiryMs(`h.${Buffer.from('not json').toString('base64url')}.s`), 0)
    assert.equal(jwtExpiryMs(`h.${Buffer.from('{"exp":"soon"}').toString('base64url')}.s`), 0)
    assert.equal(jwtExpiryMs(`h.${Buffer.from('{"exp":-1}').toString('base64url')}.s`), 0)
  })

  it('token extraction handles array/duplicate headers safely', () => {
    // node http 对重复头可能给数组 —— 不能崩、不能取数组
    assert.equal(extractToken({ 'x-kenos-token': ['a', 'b'] }), '')
    assert.equal(extractToken({ authorization: ['Bearer x'] }), '')
    assert.equal(extractToken({ authorization: 'bearer lowercase' }), '') // 大小写严格
  })

  it('loopback check rejects spoofable forms', () => {
    for (const addr of ['127.0.0.2', '10.0.0.1', '::2', '::ffff:10.0.0.1', 'localhost', '', undefined]) {
      assert.equal(isLoopbackAddress(addr), false, String(addr))
    }
  })

  it('parseConsoleLocked handles whitespace variants', () => {
    assert.equal(parseConsoleLocked('<key>IOConsoleLocked</key><true/>'), true)
    assert.equal(parseConsoleLocked('<key>IOConsoleLocked</key>\n\t\t<false/>'), false)
  })
})
