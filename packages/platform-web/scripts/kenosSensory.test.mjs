import assert from 'node:assert/strict'
import {
  SENSORY_MAP,
  SENSORY_MIN_INTERVAL_MS,
  normalizeSensoryIntent,
  resetSensoryThrottle,
  shouldFireSensory,
  sensory,
} from '../src/kenosSensory.js'

resetSensoryThrottle()

assert.equal(normalizeSensoryIntent('success'), 'success')
assert.equal(normalizeSensoryIntent('TICK'), 'tick')
assert.equal(normalizeSensoryIntent('unknown'), 'soft')
assert.equal(normalizeSensoryIntent(''), 'soft')
assert.equal(normalizeSensoryIntent(null), 'soft')

assert.equal(SENSORY_MAP.select.haptic, 'selection')
assert.equal(SENSORY_MAP.tick.haptic, 'rigid')
assert.equal(SENSORY_MAP.soft.haptic, 'soft')
assert.equal(SENSORY_MAP.commit.haptic, 'medium')
assert.equal(SENSORY_MAP.success.haptic, 'success')
assert.equal(SENSORY_MAP.warn.haptic, 'warning')
assert.equal(SENSORY_MAP.error.haptic, 'error')
assert.equal(SENSORY_MAP.pulse.haptic, 'pulse')
assert.deepEqual(SENSORY_MAP.pulse.vibrate, [120, 60, 120])
assert.equal(SENSORY_MIN_INTERVAL_MS.tick, 90)
assert.ok(SENSORY_MIN_INTERVAL_MS.pulse >= 300)

assert.equal(shouldFireSensory('tick', { now: 1000 }), true)
assert.equal(shouldFireSensory('tick', { now: 1000, force: true }), true)

// Node: no native bridge, no vibrate → skipped no-op.
const result = await sensory('success', { force: true, now: 2000 })
assert.equal(result.ok, false)
assert.equal(result.skipped, true)
assert.equal(result.intent, 'success')
assert.equal(result.via, 'none')

const soft = await sensory(undefined, { force: true, now: 3000 })
assert.equal(soft.intent, 'soft')

// Vibrate path + throttle (defineProperty — navigator is getter-only on Node 22).
const prevDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  enumerable: true,
  value: {
    vibrate(pattern) {
      assert.ok(pattern)
      return true
    },
  },
})
try {
  resetSensoryThrottle()
  const first = await sensory('tick', { now: 10_000 })
  assert.equal(first.ok, true)
  assert.equal(first.via, 'vibrate')
  const second = await sensory('tick', { now: 10_040 })
  assert.equal(second.throttled, true)
  assert.equal(second.ok, false)
  const forced = await sensory('tick', { now: 10_050, force: true })
  assert.equal(forced.ok, true)
  const later = await sensory('tick', { now: 10_200 })
  assert.equal(later.ok, true)
} finally {
  if (prevDesc) Object.defineProperty(globalThis, 'navigator', prevDesc)
  else delete globalThis.navigator
  resetSensoryThrottle()
}

console.log('kenosSensory.test.mjs: ok')
