import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCursorSendScript,
  corsHeadersFor,
  extractToken,
  isLoopbackAddress,
  isSafeBubbleId,
  isSafeComposerId,
  jwtExpiryMs,
  looksLikeJwt,
  parseConsoleLocked,
  pickBubbleFetch,
} from './cursorBridge.core.mjs'

describe('cursorBridge.core', () => {
  it('validates ids with the same charset as native.js', () => {
    assert.ok(isSafeComposerId('33c9c4dc-3065-431e-ab7e-962e6c1b725b'))
    assert.ok(!isSafeComposerId("x'; DROP TABLE--"))
    assert.ok(!isSafeComposerId('short'))
    assert.ok(isSafeBubbleId('b-1'))
    assert.ok(!isSafeBubbleId('a b'))
  })

  it('picks incremental fetch when baseline matches, full otherwise', () => {
    const headers = [{ bubbleId: 'a' }, { bubbleId: 'b' }, { bubbleId: 'c' }]
    // 基线对上:只拉新增 + 重拉尾
    const inc = pickBubbleFetch({ headers, seenCount: 2, lastSeenId: 'b', refetchId: 'b' })
    assert.deepEqual(inc, { mode: 'ids', ids: ['b', 'c'] })
    // 无新增:只重拉尾
    const idle = pickBubbleFetch({ headers, seenCount: 3, lastSeenId: 'c', refetchId: 'c' })
    assert.deepEqual(idle, { mode: 'ids', ids: ['c'] })
    // 基线错位(header 被重写)→ 全量
    assert.deepEqual(pickBubbleFetch({ headers, seenCount: 2, lastSeenId: 'zzz' }), { mode: 'all' })
    // 首载 → 全量
    assert.deepEqual(pickBubbleFetch({ headers, seenCount: 0 }), { mode: 'all' })
    // 缺口太大 → 全量
    const many = Array.from({ length: 60 }, (_, i) => ({ bubbleId: `m${i}` }))
    assert.deepEqual(pickBubbleFetch({ headers: many, seenCount: 1, lastSeenId: 'm0' }), { mode: 'all' })
  })

  it('builds the Cursor send script with escaping and new-chat keys', () => {
    const s = buildCursorSendScript('say "hi"\\now', { newChat: true })
    assert.ok(s.includes('set the clipboard to "say \\"hi\\"\\\\ow"') || s.includes('set the clipboard to'))
    assert.ok(s.includes('com.todesktop.230313mzl4w4u92'))
    assert.ok(s.includes('keystroke "n" using command down')) // 新对话
    assert.ok(s.includes('key code 36')) // 回车
    const plain = buildCursorSendScript('hello')
    assert.ok(!plain.includes('keystroke "n"'))
    // 剪贴板保存在覆盖之前、恢复在回车之后
    assert.ok(plain.indexOf('savedClipboard to (the clipboard as text)') < plain.indexOf('set the clipboard to "hello"'))
    assert.ok(plain.indexOf('key code 36') < plain.indexOf('set the clipboard to savedClipboard'))
  })

  it('parses IOConsoleLocked, failing open', () => {
    assert.equal(parseConsoleLocked('<key>IOConsoleLocked</key>\n\t<true/>'), true)
    assert.equal(parseConsoleLocked('<key>IOConsoleLocked</key>\n\t<false/>'), false)
    assert.equal(parseConsoleLocked('no such key'), false)
    assert.equal(parseConsoleLocked(''), false)
  })

  it('emits CORS only for allowed origins', () => {
    assert.equal(corsHeadersFor('https://evil.example'), null)
    assert.equal(corsHeadersFor(undefined), null)
    assert.equal(corsHeadersFor('https://www.kenos.space')['Access-Control-Allow-Origin'], 'https://www.kenos.space')
    assert.ok(corsHeadersFor('http://localhost:5197'))
    assert.ok(corsHeadersFor('http://127.0.0.1:4173'))
    // 生产 Mac Tauri 壳 origin(配对上报路径)
    assert.ok(corsHeadersFor('tauri://localhost'))
    assert.ok(corsHeadersFor('http://tauri.localhost'))
  })

  it('extracts token from header or bearer', () => {
    assert.equal(extractToken({ 'x-kenos-token': ' t1 ' }), 't1')
    assert.equal(extractToken({ authorization: 'Bearer t2' }), 't2')
    assert.equal(extractToken({}), '')
  })

  it('distinguishes JWTs, decodes exp, gates loopback', () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1800000000 })).toString('base64url')
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-part-long-enough-here`
    assert.ok(looksLikeJwt(jwt))
    assert.ok(!looksLikeJwt('3ddab9593e2041d58201e07d438bf9b8')) // 静态配对码
    assert.equal(jwtExpiryMs(jwt), 1800000000 * 1000)
    assert.equal(jwtExpiryMs('not.a.jwt'), 0)
    assert.ok(isLoopbackAddress('127.0.0.1'))
    assert.ok(isLoopbackAddress('::1'))
    assert.ok(isLoopbackAddress('::ffff:127.0.0.1'))
    assert.ok(!isLoopbackAddress('192.168.1.20'))
  })
})
