import assert from 'node:assert/strict'
import { effectiveRestSeconds, isActiveRest } from './restPolicy.core.js'

assert.equal(effectiveRestSeconds({ rest: 90 }), 90)
assert.equal(effectiveRestSeconds({ rest: 90, scheme: 'straight' }), 90)
assert.equal(effectiveRestSeconds({ rest: 90, scheme: 'drop' }), 15)
assert.equal(effectiveRestSeconds({ rest: 10, scheme: 'drop' }), 10)
assert.equal(effectiveRestSeconds({ rest: 60, scheme: 'superset' }), 15)
assert.equal(effectiveRestSeconds({ rest: 0 }), 0)
assert.equal(effectiveRestSeconds(null), 0)

assert.equal(
  isActiveRest({
    visible: true,
    inline: true,
    mode: 'rest',
    status: '',
    showDone: false,
  }),
  true,
)
assert.equal(
  isActiveRest({
    visible: true,
    inline: true,
    mode: 'rest',
    status: 'complete',
    showDone: false,
  }),
  false,
)
assert.equal(
  isActiveRest({
    visible: true,
    inline: true,
    mode: 'work',
    status: '',
    showDone: false,
  }),
  false,
)

console.log('restPolicy.core.test.js OK')
