import { describe, it, expect } from 'vitest'
import {
  MUTATION_STATE,
  classifyFlushError,
  nextIntentState,
  userSyncStatus,
} from './mutationLifecycle.core.js'

describe('classifyFlushError', () => {
  it('maps permanent RPC rejections to rejected (never retry)', () => {
    for (const e of [
      'wrong_owner',
      'actor_user_mismatch',
      'schema_version_not_supported',
      'security_domain_not_allowed',
      'capture_not_found',
      'action_id_reused',
      'unsupported_action:plan.foo',
    ]) {
      expect(classifyFlushError(e)).toBe('rejected')
    }
  })
  it('maps auth errors to auth', () => {
    expect(classifyFlushError('auth_required')).toBe('auth')
    expect(classifyFlushError('JWT expired')).toBe('auth')
    expect(classifyFlushError('unauthorized')).toBe('auth')
  })
  it('maps conflict codes to conflict', () => {
    expect(classifyFlushError('stale_version')).toBe('conflict')
    expect(classifyFlushError('version_conflict')).toBe('conflict')
  })
  it('maps network/transient/unknown to retryable', () => {
    expect(classifyFlushError('rpc_failed')).toBe('retryable')
    expect(classifyFlushError('flush_exception')).toBe('retryable')
    expect(classifyFlushError('fetch failed')).toBe('retryable')
    expect(classifyFlushError('')).toBe('retryable')
    expect(classifyFlushError(undefined)).toBe('retryable')
  })
})

describe('nextIntentState', () => {
  const max = 5
  it('ok result → SERVER_CONFIRMED + removed', () => {
    const n = nextIntentState({ attempts: 2 }, { ok: true }, max)
    expect(n.status).toBe(MUTATION_STATE.SERVER_CONFIRMED)
    expect(n.removed).toBe(true)
  })
  it('permanent rejection → REJECTED immediately, no retry loop', () => {
    const n = nextIntentState({ attempts: 0 }, { ok: false, error: 'wrong_owner' }, max)
    expect(n.status).toBe(MUTATION_STATE.REJECTED)
    // one attempt recorded but state is terminal — flush loop skips it next time
    expect(n.attempts).toBe(1)
  })
  it('auth error → AUTH_BLOCKED and does NOT consume an attempt', () => {
    const n = nextIntentState({ attempts: 3 }, { ok: false, error: 'auth_required' }, max)
    expect(n.status).toBe(MUTATION_STATE.AUTH_BLOCKED)
    expect(n.attempts).toBe(3)
  })
  it('retryable error → RETRYABLE_FAILURE until max, then DEAD_LETTER', () => {
    const a = nextIntentState({ attempts: 0 }, { ok: false, error: 'rpc_failed' }, max)
    expect(a.status).toBe(MUTATION_STATE.RETRYABLE_FAILURE)
    expect(a.attempts).toBe(1)
    const b = nextIntentState({ attempts: 4 }, { ok: false, error: 'rpc_failed' }, max)
    expect(b.status).toBe(MUTATION_STATE.DEAD_LETTER)
    expect(b.attempts).toBe(5)
  })
  it('conflict error → CONFLICT (needs resolution)', () => {
    const n = nextIntentState({ attempts: 1 }, { ok: false, error: 'stale_version' }, max)
    expect(n.status).toBe(MUTATION_STATE.CONFLICT)
  })
})

describe('userSyncStatus', () => {
  it('collapses internal states to non-jargon UI status', () => {
    expect(userSyncStatus({ status: 'pending' })).toBe('pending')
    expect(userSyncStatus({ status: MUTATION_STATE.RETRYABLE_FAILURE })).toBe('pending')
    expect(userSyncStatus({ status: MUTATION_STATE.REJECTED })).toBe('failed')
    expect(userSyncStatus({ status: MUTATION_STATE.DEAD_LETTER })).toBe('failed')
    expect(userSyncStatus({ status: MUTATION_STATE.CONFLICT })).toBe('conflict')
    expect(userSyncStatus({ status: MUTATION_STATE.AUTH_BLOCKED })).toBe('blocked')
  })
})
