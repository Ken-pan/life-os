import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterBuiltinToolEntries,
  formatCalculateResult,
  LOCAL_PURE_TOOL_KEYS,
  safeCalculate,
  WEB_GATED_TOOL_KEYS,
} from './local-tools.core.js'

const META = [
  { key: 'get_time', web: false },
  { key: 'calculate', web: false },
  { key: 'fetch_url', web: true },
  { key: 'web_search', web: true },
]

test('safeCalculate handles floats and BigInt integers', () => {
  assert.equal(safeCalculate('(1234.5 * 2) / 4'), 617.25)
  assert.equal(safeCalculate('Math.sqrt(9)'), 3)
  assert.equal(safeCalculate('1000000000000000000 + 1'), 1000000000000000001n)
})

test('safeCalculate rejects unsafe expressions', () => {
  assert.throws(() => safeCalculate('process.exit(1)'), /不允许/)
  assert.throws(() => safeCalculate('foo()'), /不允许/)
})

test('formatCalculateResult matches tool output shape', () => {
  assert.equal(formatCalculateResult('1+1', 2), '1+1 = 2')
})

test('webAccess=false drops gated tools only', () => {
  const open = filterBuiltinToolEntries(META, { webAccess: true }).map((t) => t.key)
  const closed = filterBuiltinToolEntries(META, { webAccess: false }).map((t) => t.key)
  assert.ok(WEB_GATED_TOOL_KEYS.every((k) => open.includes(k)))
  assert.ok(WEB_GATED_TOOL_KEYS.every((k) => !closed.includes(k)))
  assert.ok(LOCAL_PURE_TOOL_KEYS.every((k) => closed.includes(k) || k === 'run_javascript'))
  assert.ok(closed.includes('calculate'))
})
