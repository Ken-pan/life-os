import { describe, expect, it } from 'vitest'
import {
  bindOfflineQueueToUser,
  createEmptyOfflineQueueState,
  enqueueOfflineIntent,
  flushOfflineIntentQueue,
  isPlanOfflineWriterQueueEnabled,
} from './planOfflineIntentQueue.core.js'

describe('planOfflineIntentQueue.core', () => {
  it('stays disabled unless dual flags set', () => {
    expect(isPlanOfflineWriterQueueEnabled({})).toBe(false)
    expect(
      isPlanOfflineWriterQueueEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE: '1',
      }),
    ).toBe(true)
  })

  it('clears intents on account switch', () => {
    const state = createEmptyOfflineQueueState({
      userId: 'u1',
      intents: [{ id: '1', actionType: 'plan.create_task', idempotencyKey: 'k' }],
    })
    const next = bindOfflineQueueToUser(state, 'u2')
    expect(next.userId).toBe('u2')
    expect(next.intents).toEqual([])
  })

  it('dedupes by actionType+idempotencyKey and flushes exactly-once', async () => {
    let state = createEmptyOfflineQueueState({ userId: 'u1' })
    const intent = {
      id: 'a1',
      actionType: 'plan.create_task',
      idempotencyKey: 'idem-1',
      correlationId: 'c1',
      actionRequest: {},
      enqueuedAt: 1,
    }
    let r = enqueueOfflineIntent(state, intent)
    state = r.state
    r = enqueueOfflineIntent(state, intent)
    expect(r.duplicate).toBe(true)
    expect(state.intents).toHaveLength(1)

    const flush = await flushOfflineIntentQueue(
      state,
      async () => ({ ok: true }),
      { authUserId: 'u1' },
    )
    expect(flush.flushed).toBe(1)
    expect(flush.state.intents).toHaveLength(0)

    const blocked = await flushOfflineIntentQueue(state, async () => ({ ok: true }), {
      authUserId: null,
    })
    expect(blocked.blocked).toBe('auth_mismatch_or_missing')
  })
})
