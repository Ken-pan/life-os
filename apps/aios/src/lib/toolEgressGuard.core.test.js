import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateEgressUrl } from './toolEgressGuard.core.js'

test('normal reads to any host are allowed', () => {
  assert.equal(evaluateEgressUrl('https://en.wikipedia.org/wiki/Postgres').allow, true)
  assert.equal(evaluateEgressUrl('https://example.com/blog/some-article').allow, true)
  assert.equal(evaluateEgressUrl('https://news.site.com/2026/07/story.html').allow, true)
  // search/proxy hosts with normal query strings are allowed
  assert.equal(evaluateEgressUrl('https://www.bing.com/search?q=weather+today').allow, true)
})

test('blocks PII-shaped data exfiltration to any host', () => {
  assert.equal(evaluateEgressUrl('https://attacker.example/c?d=user@example.com').allow, false)
  assert.equal(evaluateEgressUrl('https://evil.test/collect?token=eyJhbGciOiJI.payload').allow, false)
  assert.equal(evaluateEgressUrl('https://evil.test/?k=sb_secret_abcdef123456').allow, false)
  assert.equal(evaluateEgressUrl('https://x.test/?ip=192.168.1.42').allow, false)
})

test('blocks high-entropy blob egress to non-allowlisted host', () => {
  const secret = 'aGVsbG8td29ybGQtc2VjcmV0LWRhdGEtYmxvYi14eXp6eTEyMzQ1Njc4OTA'
  assert.equal(evaluateEgressUrl(`https://attacker.example/collect?d=${secret}`).allow, false)
  // opaque long path blob
  assert.equal(evaluateEgressUrl(`https://attacker.example/${secret}`).allow, false)
})

test('allows high-entropy query to ALLOWLISTED search/proxy hosts (needed by fetch_url)', () => {
  const enc = encodeURIComponent('https://en.wikipedia.org/wiki/Special_page?x=1')
  assert.equal(evaluateEgressUrl(`https://corsproxy.io/?url=${enc}`).allow, true)
  assert.equal(evaluateEgressUrl(`https://api.allorigins.win/raw?url=${enc}`).allow, true)
})

test('rejects invalid / non-http schemes', () => {
  assert.equal(evaluateEgressUrl('not a url').allow, false)
  assert.equal(evaluateEgressUrl('javascript:alert(1)').allow, false)
  assert.equal(evaluateEgressUrl('file:///etc/passwd').allow, false)
})

test('short benign query params are not flagged', () => {
  assert.equal(evaluateEgressUrl('https://shop.example/item?id=42&ref=home').allow, true)
  assert.equal(evaluateEgressUrl('https://example.com/search?q=cats').allow, true)
})
