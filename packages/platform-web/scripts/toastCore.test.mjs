import assert from 'node:assert/strict'

import {
  normalizeToastArgs,
  resolveToastKey,
} from '../src/svelte/toast/toastCore.js'

// ── 签名归一化：planner/fitness 字符串形式 ──
{
  const { tone, options } = normalizeToastArgs('error', { duration: 5000 })
  assert.equal(tone, 'error')
  assert.deepEqual(options, { duration: 5000 })
}
{
  const { tone, options } = normalizeToastArgs(undefined, undefined)
  assert.equal(tone, 'success')
  assert.deepEqual(options, {})
}

// ── 签名归一化：music 对象形式 ──
{
  const { tone } = normalizeToastArgs({ error: true, duration: 1200 })
  assert.equal(tone, 'error')
}
{
  const { tone } = normalizeToastArgs({ warn: true })
  assert.equal(tone, 'warn')
}
{
  const { tone, options } = normalizeToastArgs({ duration: 800, key: 'k' })
  assert.equal(tone, 'success')
  assert.deepEqual(options, { duration: 800, key: 'k' })
}

// ── 去重 key 规则（与三 app 原实现一致）──
assert.equal(resolveToastKey('已保存', 'success'), '已保存')
assert.equal(resolveToastKey('失败', 'error'), 'error:失败')
assert.equal(resolveToastKey('注意', 'warn'), 'warn:注意')
assert.equal(resolveToastKey('x', 'error', { key: 'custom' }), 'custom')

console.log('toastCore.test.mjs — OK')
