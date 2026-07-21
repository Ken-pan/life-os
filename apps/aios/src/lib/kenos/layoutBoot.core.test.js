import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hasLayoutBooted,
  resetLayoutBootForTests,
  takeLayoutBoot,
} from './layoutBoot.core.js'

describe('layoutBoot.core', () => {
  it('latches first boot only', () => {
    resetLayoutBootForTests()
    assert.equal(hasLayoutBooted(), false)
    assert.equal(takeLayoutBoot(), true)
    assert.equal(hasLayoutBooted(), true)
    assert.equal(takeLayoutBoot(), false)
    assert.equal(takeLayoutBoot(), false)
  })
})
