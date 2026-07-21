import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyFocusState } from './focusStore.core.js'
import {
  applyEndFocus,
  applyStartFocus,
  formatFocusStatus,
  normalizeFocusMode,
} from './focusAssistantTools.core.js'

describe('focusAssistantTools', () => {
  it('normalizes plan/work aliases to deep_work', () => {
    assert.equal(normalizeFocusMode('plan'), 'deep_work')
    assert.equal(normalizeFocusMode('开始计划'), null)
    assert.equal(normalizeFocusMode('training'), 'training')
    assert.equal(normalizeFocusMode('workout'), 'training')
  })

  it('starts and ends deep work focus', () => {
    let state = emptyFocusState()
    assert.match(formatFocusStatus(state), /没有进行中/)
    const started = applyStartFocus(state, {
      mode: 'deep_work',
      title: 'Kenos IA',
    })
    assert.equal(started.ok, true)
    state = started.state
    assert.equal(state.focus?.status, 'active')
    assert.match(formatFocusStatus(state), /Kenos IA/)
    const ended = applyEndFocus(state, { notes: 'done' })
    assert.equal(ended.ok, true)
    assert.match(ended.message, /已结束/)
  })

  it('refuses second start while focus active', () => {
    const started = applyStartFocus(emptyFocusState(), { mode: 'training' })
    const again = applyStartFocus(started.state, { mode: 'deep_work' })
    assert.equal(again.ok, false)
    assert.match(again.message, /无法开始/)
  })
})
