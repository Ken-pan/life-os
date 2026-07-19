import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveAssistantScopeLabel } from './assistantScopeLabel.core.js'

describe('assistantScopeLabel.core', () => {
  it('labels Global Assistant as All Kenos', () => {
    const scope = resolveAssistantScopeLabel({})
    assert.equal(scope.kind, 'global')
    assert.equal(scope.label, 'Scope: All Kenos')
  })

  it('labels Focus context with entity', () => {
    const scope = resolveAssistantScopeLabel({
      focus: {
        status: 'active',
        activeSpace: 'work',
        title: 'Q3 launch',
        activeSessionRef: { type: 'work.project', title: 'Q3 launch' },
      },
    })
    assert.equal(scope.kind, 'context')
    assert.equal(scope.label, 'Scope: Work · Q3 launch')
  })

  it('labels Work hub context without inventing Focus', () => {
    const scope = resolveAssistantScopeLabel({
      workContext: { title: 'Alpha' },
    })
    assert.equal(scope.kind, 'context')
    assert.equal(scope.label, 'Scope: Work · Alpha')
  })

  it('does not fabricate Work context when empty', () => {
    const scope = resolveAssistantScopeLabel({ workContext: null, focus: null })
    assert.equal(scope.kind, 'global')
    assert.equal(scope.label, 'Scope: All Kenos')
  })
})
