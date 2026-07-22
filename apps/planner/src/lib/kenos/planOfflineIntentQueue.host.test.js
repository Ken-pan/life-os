import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KENOS_OFFLINE_QUEUE_STORAGE_KEY } from './planOfflineIntentQueue.core.js'
import {
  OFFLINE_TEST_AUTH_USER_ID,
  OFFLINE_TEST_OWNER_EMAIL,
  OFFLINE_TEST_PROVISIONAL_ID,
  OFFLINE_TEST_SERVER_TASK_ID,
  OFFLINE_TEST_TASK_ID,
  makeIntent,
  makeQueueState,
  resetOfflineHostTest,
  seedQueue,
} from './planOfflineIntentQueue.testUtils.js'

const mockRpc = vi.fn()
const mockGetSession = vi.fn()
const mockSave = vi.fn()
const mockFlushSave = vi.fn()

vi.mock('../supabase.js', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    rpc: (...args) => mockRpc(...args),
  },
}))

vi.mock('../state.svelte.js', () => ({
  S: {
    tasks: [],
    settings: { defaultListId: 'inbox' },
  },
  save: (...args) => mockSave(...args),
  flushSave: (...args) => mockFlushSave(...args),
}))

vi.mock('../services/reminders.js', () => ({
  syncRemindersToServiceWorker: vi.fn(),
}))

vi.mock('../syncStatus.svelte.js', () => ({
  markOffline: vi.fn(),
}))

vi.mock('../services/attachmentService.js', () => ({
  softDeleteAttachmentsForOwner: vi.fn(),
}))

describe('planOfflineIntentQueue.host', () => {
  /** @type {ReturnType<typeof resetOfflineHostTest>} */
  let storage

  beforeEach(() => {
    storage = resetOfflineHostTest(vi, {
      mockGetSession,
      mockRpc,
      mockSave,
      mockFlushSave,
      env: {
        VITE_KENOS_PLAN_COMPLETE_TASK_WRITER: '1',
        VITE_KENOS_PLAN_COMPLETE_TASK_WRITER_OWNER_EMAILS: OFFLINE_TEST_OWNER_EMAIL,
        VITE_KENOS_PLAN_UPDATE_TASK_TITLE_WRITER: '1',
        VITE_KENOS_PLAN_UPDATE_TASK_TITLE_WRITER_OWNER_EMAILS: OFFLINE_TEST_OWNER_EMAIL,
        VITE_KENOS_PLAN_ARCHIVE_TASK_WRITER: '1',
        VITE_KENOS_PLAN_ARCHIVE_TASK_WRITER_OWNER_EMAILS: OFFLINE_TEST_OWNER_EMAIL,
      },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('enqueues complete / title / archive offline without RPC', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { S } = await import('../state.svelte.js')
    S.tasks = [{ id: OFFLINE_TEST_TASK_ID, title: 'T', completed: false, meta: {} }]

    const { completeTaskViaHostedKenosWriter } = await import('./planCompleteReopenTaskWriter.host.js')
    const completed = await completeTaskViaHostedKenosWriter(OFFLINE_TEST_TASK_ID)
    expect(completed.completed).toBe(true)
    expect(completed.meta?.offlineQueued).toBe(true)

    const { updateTaskTitleViaHostedKenosWriter } = await import('./planUpdateTaskTitleWriter.host.js')
    const titled = await updateTaskTitleViaHostedKenosWriter(OFFLINE_TEST_TASK_ID, 'Renamed')
    expect(titled.title).toBe('Renamed')
    expect(titled.meta?.offlineQueued).toBe(true)

    const { archiveTaskViaHostedKenosWriter } = await import('./planArchiveTaskWriter.host.js')
    const archived = await archiveTaskViaHostedKenosWriter(OFFLINE_TEST_TASK_ID)
    expect(archived.deletedAt).toBeTruthy()
    expect(archived.meta?.offlineQueued).toBe(true)

    expect(mockRpc).not.toHaveBeenCalled()
    const parsed = JSON.parse(String(storage.getItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY)))
    expect(parsed.userId).toBe(OFFLINE_TEST_AUTH_USER_ID)
    expect(parsed.intents.map((i) => i.actionType)).toEqual([
      'plan.complete_task',
      'plan.update_task_title',
      'plan.archive_task',
    ])
  })

  it('flushes create then remapped complete exactly once', async () => {
    seedQueue(
      storage,
      KENOS_OFFLINE_QUEUE_STORAGE_KEY,
      makeQueueState({
        intents: [
          makeIntent({
            id: OFFLINE_TEST_PROVISIONAL_ID,
            actionType: 'plan.create_task',
            provisionalTaskId: OFFLINE_TEST_PROVISIONAL_ID,
            idempotencyKey: 'plan_ui:create',
            enqueuedAt: 1,
          }),
          makeIntent({
            id: '55555555-5555-4555-8555-555555555555',
            actionType: 'plan.complete_task',
            taskId: OFFLINE_TEST_PROVISIONAL_ID,
            idempotencyKey: 'plan_ui_complete:c',
            correlationId: '66666666-6666-4666-8666-666666666666',
            enqueuedAt: 2,
          }),
        ],
      }),
    )

    const { S } = await import('../state.svelte.js')
    S.tasks = [
      {
        id: OFFLINE_TEST_PROVISIONAL_ID,
        title: 'Queued',
        completed: false,
        meta: { offlineQueued: true },
      },
    ]

    mockRpc.mockImplementation(async (name, args) => {
      if (name === 'kenos_create_plan_task_action') {
        return { data: { ok: true, taskId: OFFLINE_TEST_SERVER_TASK_ID, duplicate: false }, error: null }
      }
      if (name === 'kenos_complete_plan_task_action') {
        expect(args.action_request.payload.taskId).toBe(OFFLINE_TEST_SERVER_TASK_ID)
        return { data: { ok: true, duplicate: false }, error: null }
      }
      return { data: null, error: { message: `unexpected ${name}` } }
    })

    const { flushOfflinePlanIntentQueue } = await import('./planOfflineIntentQueue.host.js')
    const first = await flushOfflinePlanIntentQueue()
    expect(first).toMatchObject({ flushed: 2, remaining: 0, blocked: null })
    expect(S.tasks[0].id).toBe(OFFLINE_TEST_SERVER_TASK_ID)
    expect(mockRpc).toHaveBeenCalledTimes(2)

    const second = await flushOfflinePlanIntentQueue()
    expect(second).toMatchObject({ flushed: 0, remaining: 0 })
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('keeps mutation when create succeeds but mutation RPC fails', async () => {
    seedQueue(
      storage,
      KENOS_OFFLINE_QUEUE_STORAGE_KEY,
      makeQueueState({
        intents: [
          makeIntent({
            id: OFFLINE_TEST_PROVISIONAL_ID,
            actionType: 'plan.create_task',
            provisionalTaskId: OFFLINE_TEST_PROVISIONAL_ID,
            enqueuedAt: 1,
          }),
          makeIntent({
            id: '55555555-5555-4555-8555-555555555555',
            actionType: 'plan.complete_task',
            taskId: OFFLINE_TEST_PROVISIONAL_ID,
            idempotencyKey: 'plan_ui_complete:c',
            enqueuedAt: 2,
          }),
        ],
      }),
    )

    const { S } = await import('../state.svelte.js')
    S.tasks = [
      {
        id: OFFLINE_TEST_PROVISIONAL_ID,
        title: 'Queued',
        meta: { offlineQueued: true },
      },
    ]

    mockRpc.mockImplementation(async (name, args) => {
      if (name === 'kenos_create_plan_task_action') {
        return { data: { ok: true, taskId: OFFLINE_TEST_SERVER_TASK_ID, duplicate: false }, error: null }
      }
      if (name === 'kenos_complete_plan_task_action') {
        expect(args.action_request.payload.taskId).toBe(OFFLINE_TEST_SERVER_TASK_ID)
        return { data: null, error: { message: 'complete_failed' } }
      }
      return { data: null, error: { message: `unexpected ${name}` } }
    })

    const { flushOfflinePlanIntentQueue } = await import('./planOfflineIntentQueue.host.js')
    const result = await flushOfflinePlanIntentQueue()
    expect(result.flushed).toBe(1)
    expect(result.remaining).toBe(1)

    const parsed = JSON.parse(String(storage.getItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY)))
    expect(parsed.intents).toHaveLength(1)
    expect(parsed.intents[0].actionType).toBe('plan.complete_task')
    expect(parsed.intents[0].status).toBe('failed')
    expect(parsed.intents[0].actionRequest.payload.taskId).toBe(OFFLINE_TEST_SERVER_TASK_ID)
    // Sibling mutation still pending → keep offlineQueued on remapped task.
    expect(S.tasks[0].id).toBe(OFFLINE_TEST_SERVER_TASK_ID)
    expect(S.tasks[0].meta?.offlineQueued).toBe(true)
  })

  it('keeps offlineQueued when one mutation flushes and another remains', async () => {
    seedQueue(
      storage,
      KENOS_OFFLINE_QUEUE_STORAGE_KEY,
      makeQueueState({
        intents: [
          makeIntent({
            id: 'c1',
            actionType: 'plan.complete_task',
            taskId: OFFLINE_TEST_TASK_ID,
            enqueuedAt: 1,
          }),
          makeIntent({
            id: 't1',
            actionType: 'plan.update_task_title',
            taskId: OFFLINE_TEST_TASK_ID,
            idempotencyKey: 'title:1',
            enqueuedAt: 2,
            actionRequest: {
              actionType: 'plan.update_task_title',
              payload: { taskId: OFFLINE_TEST_TASK_ID, title: 'X' },
            },
          }),
        ],
      }),
    )
    const { S } = await import('../state.svelte.js')
    S.tasks = [{ id: OFFLINE_TEST_TASK_ID, title: 'T', meta: { offlineQueued: true } }]

    mockRpc.mockImplementation(async (name) => {
      if (name === 'kenos_complete_plan_task_action') {
        return { data: { ok: true, duplicate: false }, error: null }
      }
      if (name === 'kenos_update_plan_task_title_action') {
        return { data: null, error: { message: 'title_failed' } }
      }
      return { data: null, error: { message: `unexpected ${name}` } }
    })

    const { flushOfflinePlanIntentQueue } = await import('./planOfflineIntentQueue.host.js')
    const result = await flushOfflinePlanIntentQueue()
    expect(result.flushed).toBe(1)
    expect(result.remaining).toBe(1)
    expect(S.tasks[0].meta?.offlineQueued).toBe(true)
  })

  it('blocks flush when unsigned without wiping durable queue', async () => {
    seedQueue(
      storage,
      KENOS_OFFLINE_QUEUE_STORAGE_KEY,
      makeQueueState({
        intents: [makeIntent({ id: 'a1', actionType: 'plan.complete_task' })],
      }),
    )
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
    const { flushOfflinePlanIntentQueue } = await import('./planOfflineIntentQueue.host.js')
    const blocked = await flushOfflinePlanIntentQueue()
    expect(blocked.blocked).toBe('auth_required')
    expect(blocked.remaining).toBe(1)
    expect(mockRpc).not.toHaveBeenCalled()
    const preserved = JSON.parse(String(storage.getItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY)))
    expect(preserved.intents).toHaveLength(1)
    expect(preserved.userId).toBe(OFFLINE_TEST_AUTH_USER_ID)
  })

  it('skips unsupported action types as failed retryable intents', async () => {
    seedQueue(
      storage,
      KENOS_OFFLINE_QUEUE_STORAGE_KEY,
      makeQueueState({
        intents: [
          makeIntent({
            id: 'b1',
            actionType: 'plan.unknown_action',
            idempotencyKey: 'unknown:1',
            actionRequest: { actionType: 'plan.unknown_action', payload: {} },
          }),
        ],
      }),
    )
    const { flushOfflinePlanIntentQueue } = await import('./planOfflineIntentQueue.host.js')
    const unsupported = await flushOfflinePlanIntentQueue()
    expect(unsupported.flushed).toBe(0)
    expect(unsupported.remaining).toBe(1)
    const parsed = JSON.parse(String(storage.getItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY)))
    // Unknown/unsupported action is a permanent rejection — must NOT burn retries.
    expect(parsed.intents[0].status).toBe('rejected')
    expect(parsed.intents[0].lastError).toMatch(/unsupported_action/)
  })

  it('clears foreign-user queue on bind instead of replaying across accounts', async () => {
    seedQueue(
      storage,
      KENOS_OFFLINE_QUEUE_STORAGE_KEY,
      makeQueueState({
        userId: '99999999-9999-4999-8999-999999999999',
        intents: [makeIntent({ id: 'a1', actionType: 'plan.complete_task' })],
      }),
    )
    const { flushOfflinePlanIntentQueue } = await import('./planOfflineIntentQueue.host.js')
    const result = await flushOfflinePlanIntentQueue()
    expect(result.flushed).toBe(0)
    expect(result.remaining).toBe(0)
    expect(mockRpc).not.toHaveBeenCalled()
    const parsed = JSON.parse(String(storage.getItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY)))
    expect(parsed.userId).toBe(OFFLINE_TEST_AUTH_USER_ID)
    expect(parsed.intents).toEqual([])
  })

  it('preserves dead_letter intents across successful flush of other items', async () => {
    seedQueue(
      storage,
      KENOS_OFFLINE_QUEUE_STORAGE_KEY,
      makeQueueState({
        intents: [
          makeIntent({
            id: OFFLINE_TEST_TASK_ID,
            actionType: 'plan.complete_task',
            taskId: OFFLINE_TEST_TASK_ID,
            status: 'pending',
          }),
          makeIntent({
            id: 'deadletter-0000-4000-8000-000000000001',
            actionType: 'plan.update_task_title',
            idempotencyKey: 'title:dead',
            status: 'dead_letter',
            attempts: 5,
            taskId: OFFLINE_TEST_TASK_ID,
          }),
        ],
      }),
    )
    mockRpc.mockResolvedValue({ data: { ok: true, duplicate: false }, error: null })
    const { flushOfflinePlanIntentQueue } = await import('./planOfflineIntentQueue.host.js')
    const result = await flushOfflinePlanIntentQueue()
    expect(result.flushed).toBe(1)
    expect(result.remaining).toBe(1)
    const parsed = JSON.parse(String(storage.getItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY)))
    expect(parsed.intents[0].status).toBe('dead_letter')
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })
})
