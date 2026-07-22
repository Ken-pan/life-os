import { describe, expect, it } from 'vitest'
import {
  KENOS_OFFLINE_QUEUE_STORAGE_KEY,
  OFFLINE_INTENT_MAX_ATTEMPTS,
  bindOfflineQueueToUser,
  clearOfflineQueue,
  countPendingOfflineIntents,
  createEmptyOfflineQueueState,
  discardOfflineIntent,
  enqueueOfflineIntent,
  flushOfflineIntentQueue,
  isPlanOfflineWriterQueueEnabled,
  listDeadLetterOfflineIntents,
  loadOfflineQueue,
  persistOfflineQueue,
  rebindOfflineQueueForSession,
  remapOfflineIntentTaskIds,
  retryDeadLetterOfflineIntent,
} from './planOfflineIntentQueue.core.js'
import {
  createMemoryStorage,
  makeIntent,
  makeQueueState,
} from './planOfflineIntentQueue.testUtils.js'

describe('planOfflineIntentQueue.core', () => {
  it('stays disabled unless dual flags set', () => {
    expect(isPlanOfflineWriterQueueEnabled({})).toBe(false)
    expect(isPlanOfflineWriterQueueEnabled({ VITE_KENOS_PROD_WRITES: '1' })).toBe(false)
    expect(
      isPlanOfflineWriterQueueEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE: '1',
      }),
    ).toBe(true)
  })

  it('clears intents on account switch and keeps same-user state', () => {
    const state = makeQueueState({
      userId: 'u1',
      intents: [makeIntent({ id: '1', idempotencyKey: 'k' })],
    })
    expect(bindOfflineQueueToUser(state, 'u2').intents).toEqual([])
    expect(bindOfflineQueueToUser(state, 'u1').intents).toHaveLength(1)
  })

  it('rebindOfflineQueueForSession persists cleared queue on switch', () => {
    const storage = createMemoryStorage()
    persistOfflineQueue(
      storage,
      makeQueueState({
        userId: 'u1',
        intents: [makeIntent({ id: '1', idempotencyKey: 'k' })],
      }),
    )
    rebindOfflineQueueForSession(storage, 'u2')
    const loaded = loadOfflineQueue(storage)
    expect(loaded.userId).toBe('u2')
    expect(loaded.intents).toEqual([])
  })

  it('persists, loads, clears, and tolerates corrupt JSON', () => {
    const storage = createMemoryStorage()
    persistOfflineQueue(storage, createEmptyOfflineQueueState({ userId: 'u1', deviceId: 'd1' }))
    expect(loadOfflineQueue(storage).userId).toBe('u1')
    clearOfflineQueue(storage)
    expect(storage.getItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY)).toBeNull()

    storage.setItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY, '{not-json')
    expect(loadOfflineQueue(storage)).toEqual(createEmptyOfflineQueueState())
    expect(loadOfflineQueue(undefined)).toEqual(createEmptyOfflineQueueState())
  })

  it('dedupes by actionType+idempotencyKey and flushes exactly-once', async () => {
    let state = makeQueueState({ userId: 'u1', intents: [] })
    const intent = makeIntent({
      id: 'a1',
      actionType: 'plan.create_task',
      idempotencyKey: 'idem-1',
      correlationId: 'c1',
    })
    let r = enqueueOfflineIntent(state, intent)
    state = r.state
    r = enqueueOfflineIntent(state, intent)
    expect(r.duplicate).toBe(true)
    expect(state.intents).toHaveLength(1)
    expect(countPendingOfflineIntents(state)).toBe(1)

    const flush = await flushOfflineIntentQueue(state, async () => ({ ok: true }), {
      authUserId: 'u1',
    })
    expect(flush.flushed).toBe(1)
    expect(flush.state.intents).toHaveLength(0)

    const blocked = await flushOfflineIntentQueue(state, async () => ({ ok: true }), {
      authUserId: null,
    })
    expect(blocked.blocked).toBe('auth_mismatch_or_missing')
  })

  it('rejects enqueue without required fields', () => {
    const state = makeQueueState({ userId: 'u1', intents: [] })
    expect(() => enqueueOfflineIntent(state, { id: 'x' })).toThrow(/idempotencyKey/)
  })

  it('retains failed intents for retry and counts them as pending', async () => {
    const state = makeQueueState({
      userId: 'u1',
      intents: [makeIntent({ id: 'a1', status: 'pending', attempts: 0 })],
    })
    const flush = await flushOfflineIntentQueue(state, async () => ({ ok: false, error: 'rpc_failed' }), {
      authUserId: 'u1',
    })
    expect(flush.flushed).toBe(0)
    expect(flush.remaining).toBe(1)
    expect(flush.state.intents[0].status).toBe('failed')
    expect(flush.state.intents[0].attempts).toBe(1)
    expect(countPendingOfflineIntents(flush.state)).toBe(1)
  })

  it('skips dead_letter on auto flush and supports retry/discard', async () => {
    const state = makeQueueState({
      userId: 'u1',
      intents: [
        makeIntent({
          id: 'a1',
          actionType: 'plan.complete_task',
          status: 'failed',
          attempts: OFFLINE_INTENT_MAX_ATTEMPTS - 1,
        }),
        makeIntent({
          id: 'dead',
          actionType: 'plan.update_task_title',
          idempotencyKey: 'title:dead',
          status: 'dead_letter',
          attempts: OFFLINE_INTENT_MAX_ATTEMPTS,
        }),
      ],
    })
    let calls = 0
    const flush = await flushOfflineIntentQueue(
      state,
      async () => {
        calls += 1
        return { ok: false, error: 'still_bad' }
      },
      { authUserId: 'u1' },
    )
    expect(calls).toBe(1)
    expect(flush.deadLettered).toBe(1)
    expect(listDeadLetterOfflineIntents(flush.state)).toHaveLength(2)

    const retried = retryDeadLetterOfflineIntent(flush.state, 'a1')
    expect(retried.intents.find((i) => i.id === 'a1')?.status).toBe('pending')
    expect(discardOfflineIntent(flush.state, 'dead').intents.map((i) => i.id)).toEqual(['a1'])
  })

  it('remaps mutation task ids (Map + plain object) and no-ops unknown ids', () => {
    const provisional = 'p1'
    const server = 's1'
    const intent = makeIntent({
      id: 'm1',
      actionType: 'plan.complete_task',
      taskId: provisional,
      actionRequest: { payload: { taskId: provisional } },
    })
    const viaMap = remapOfflineIntentTaskIds(intent, new Map([[provisional, server]]))
    expect(viaMap.taskId).toBe(server)
    expect(viaMap.actionRequest.payload.taskId).toBe(server)

    const viaObj = remapOfflineIntentTaskIds(intent, { [provisional]: server })
    expect(viaObj.taskId).toBe(server)

    expect(remapOfflineIntentTaskIds(intent, new Map([['other', server]]))).toBe(intent)
    expect(remapOfflineIntentTaskIds(null, new Map())).toBe(null)
  })
})
