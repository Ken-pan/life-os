import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assistantScopeForPrompt,
  endFocus,
  focusUiFlags,
  pauseFocus,
  startDeepWorkFocus,
  startTrainingFocus,
  temporarilyLeaveFocus,
  emptyFocusState,
} from './focusStore.core.js'
import { canTransitionFocusStatus, evaluateInterruption, interruptionCandidate } from './focusRuntime.core.js'

describe('focusStore vertical slices', () => {
  it('runs Training Focus without exposing Work badges', () => {
    let state = emptyFocusState()
    state = startTrainingFocus(state)
    assert.equal(state.focus.status, 'active')
    assert.equal(focusUiFlags(state).hideGlobalNav, true)
    assert.equal(focusUiFlags(state).showDeferredBadge, false)
    assert.ok(state.deferred.some((d) => d.sourceDomain === 'work'))
    assert.ok(state.deferred.every((d) => d.status === 'pending'))
    const leak = assistantScopeForPrompt(state, ['work', 'money'], false)
    assert.equal(leak.kind, 'denied')
  })

  it('supports leave/return and end summary for Training', () => {
    let state = startTrainingFocus(emptyFocusState())
    state = temporarilyLeaveFocus(state)
    assert.equal(state.focus.status, 'temporarily_left')
    assert.equal(focusUiFlags(state).showReturnBanner, true)
    assert.equal(focusUiFlags(state).hideGlobalNav, false)
    state = endFocus(state)
    assert.equal(state.focus.status, 'completed')
    assert.ok(state.summary)
    assert.ok(state.summary.deferredItemCounts.work >= 1)
    assert.ok(state.deferred.some((d) => d.status === 'released'))
  })

  it('runs Deep Work Focus and defers Home/Money', () => {
    let state = startDeepWorkFocus(emptyFocusState())
    assert.equal(state.focus.mode, 'deep_work')
    assert.ok(state.focus.visibleDomains.includes('work'))
    assert.ok(state.deferred.some((d) => d.sourceDomain === 'home' || d.sourceDomain === 'money'))
    state = pauseFocus(state)
    assert.equal(state.focus.status, 'paused')
  })

  it('blocks starting a second Focus over an active one', () => {
    const first = startTrainingFocus(emptyFocusState())
    const second = startDeepWorkFocus(first)
    assert.equal(second.focus.mode, 'training')
    assert.match(second.lastError || '', /Foreground Focus/)
  })

  it('keeps transition table fail-closed', () => {
    assert.equal(canTransitionFocusStatus('completed', 'active'), false)
    assert.equal(canTransitionFocusStatus('active', 'paused'), true)
  })

  it('always allows health safety during Training', () => {
    const state = startTrainingFocus(emptyFocusState())
    const decision = evaluateInterruption(
      state.focus,
      interruptionCandidate({
        ownerId: state.ownerId,
        sourceDomain: 'health',
        category: 'health_safety',
        urgency: 'critical',
        risk: 'R2',
        safeSummary: 'Safety',
        explanation: 'Safety',
      }),
    )
    assert.equal(decision.value.handling, 'always_allow')
  })
})
