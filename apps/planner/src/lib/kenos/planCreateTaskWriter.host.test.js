import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KENOS_OFFLINE_QUEUE_STORAGE_KEY } from './planOfflineIntentQueue.core.js'
import {
  OFFLINE_TEST_AUTH_USER_ID,
  OFFLINE_TEST_OWNER_EMAIL,
  OFFLINE_TEST_PROVISIONAL_ID,
  OFFLINE_TEST_SERVER_TASK_ID,
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

describe('planCreateTaskWriter.host offline queue', () => {
  /** @type {ReturnType<typeof resetOfflineHostTest>} */
  let storage

  beforeEach(() => {
    storage = resetOfflineHostTest(vi, {
      mockGetSession,
      mockRpc,
      mockSave,
      mockFlushSave,
      env: {
        VITE_KENOS_PLAN_CREATE_TASK_WRITER: '1',
        VITE_KENOS_PLAN_CREATE_TASK_WRITER_OWNER_EMAILS: OFFLINE_TEST_OWNER_EMAIL,
      },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('flush is blocked when flag is off', async () => {
    vi.stubEnv('VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE', '0')
    vi.resetModules()
    const { flushOfflineCreateTaskQueue } = await import('./planCreateTaskWriter.host.js')
    await expect(flushOfflineCreateTaskQueue()).resolves.toMatchObject({
      flushed: 0,
      remaining: 0,
      blocked: 'flag_off',
    })
  })

  it('enqueues create offline with optimistic task + pending meta', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { createTaskViaHostedKenosWriter } = await import('./planCreateTaskWriter.host.js')
    const { S } = await import('../state.svelte.js')
    const { markOffline } = await import('../syncStatus.svelte.js')

    const task = await createTaskViaHostedKenosWriter({ title: 'Offline task' })
    expect(task.meta?.offlineQueued).toBe(true)
    expect(S.tasks.some((row) => row.id === task.id)).toBe(true)
    expect(markOffline).toHaveBeenCalled()

    const parsed = JSON.parse(String(storage.getItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY)))
    expect(parsed.userId).toBe(OFFLINE_TEST_AUTH_USER_ID)
    expect(parsed.intents).toHaveLength(1)
    expect(parsed.intents[0].actionType).toBe('plan.create_task')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('does not flush while browser is still offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    seedQueue(
      storage,
      KENOS_OFFLINE_QUEUE_STORAGE_KEY,
      makeQueueState({
        intents: [makeIntent({ id: 'a1', actionType: 'plan.create_task', idempotencyKey: 'k1' })],
      }),
    )
    const { flushOfflineCreateTaskQueue } = await import('./planCreateTaskWriter.host.js')
    const result = await flushOfflineCreateTaskQueue()
    expect(result.blocked).toBe('still_offline')
    expect(result.remaining).toBe(1)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('flush remaps provisional id and drains create queue exactly once', async () => {
    seedQueue(
      storage,
      KENOS_OFFLINE_QUEUE_STORAGE_KEY,
      makeQueueState({
        intents: [
          makeIntent({
            id: OFFLINE_TEST_PROVISIONAL_ID,
            actionType: 'plan.create_task',
            provisionalTaskId: OFFLINE_TEST_PROVISIONAL_ID,
            idempotencyKey: 'plan_ui:test',
          }),
        ],
      }),
    )

    const { S } = await import('../state.svelte.js')
    S.tasks = [{ id: OFFLINE_TEST_PROVISIONAL_ID, title: 'Queued', meta: { offlineQueued: true } }]
    mockRpc.mockResolvedValue({
      data: { ok: true, taskId: OFFLINE_TEST_SERVER_TASK_ID, duplicate: false },
      error: null,
    })

    const { flushOfflineCreateTaskQueue } = await import('./planCreateTaskWriter.host.js')
    const first = await flushOfflineCreateTaskQueue()
    expect(first).toMatchObject({ flushed: 1, remaining: 0, blocked: null })
    expect(S.tasks[0].id).toBe(OFFLINE_TEST_SERVER_TASK_ID)
    expect(S.tasks[0].meta?.offlineQueued).toBe(false)
    expect(S.tasks[0].meta?.offlineRemappedFrom).toBe(OFFLINE_TEST_PROVISIONAL_ID)

    const second = await flushOfflineCreateTaskQueue()
    expect(second).toMatchObject({ flushed: 0, remaining: 0, blocked: null })
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })
})
