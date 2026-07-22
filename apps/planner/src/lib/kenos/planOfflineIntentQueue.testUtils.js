/**
 * Shared fixtures for Plan offline intent queue tests (not imported by production).
 */

export const OFFLINE_TEST_AUTH_USER_ID = '11111111-1111-4111-8111-111111111111'
export const OFFLINE_TEST_OWNER_EMAIL = 'owner@example.com'
export const OFFLINE_TEST_TASK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const OFFLINE_TEST_PROVISIONAL_ID = '22222222-2222-4222-8222-222222222222'
export const OFFLINE_TEST_SERVER_TASK_ID = '33333333-3333-4333-8333-333333333333'

export function createMemoryStorage(seed = {}) {
  /** @type {Record<string, string>} */
  const map = { ...seed }
  return {
    getItem: (key) => (key in map ? map[key] : null),
    setItem: (key, value) => {
      map[key] = String(value)
    },
    removeItem: (key) => {
      delete map[key]
    },
  }
}

/**
 * @param {object} [opts]
 */
export function makeQueueState(opts = {}) {
  return {
    schemaVersion: 1,
    userId: opts.userId ?? OFFLINE_TEST_AUTH_USER_ID,
    deviceId: opts.deviceId ?? null,
    intents: Array.isArray(opts.intents) ? opts.intents : [],
  }
}

/**
 * @param {Partial<{
 *   id: string,
 *   actionType: string,
 *   idempotencyKey: string,
 *   correlationId: string,
 *   taskId: string,
 *   provisionalTaskId: string | null,
 *   status: string,
 *   attempts: number,
 *   enqueuedAt: number,
 *   actionRequest: object,
 * }>} partial
 */
export function makeIntent(partial = {}) {
  const id = partial.id || OFFLINE_TEST_TASK_ID
  const actionType = partial.actionType || 'plan.create_task'
  const taskId = partial.taskId || partial.provisionalTaskId || id
  return {
    id,
    actionType,
    idempotencyKey: partial.idempotencyKey || `${actionType}:test`,
    correlationId: partial.correlationId || '44444444-4444-4444-8444-444444444444',
    taskId,
    provisionalTaskId: partial.provisionalTaskId ?? null,
    status: partial.status || 'pending',
    attempts: partial.attempts ?? 0,
    enqueuedAt: partial.enqueuedAt ?? 1,
    actionRequest:
      partial.actionRequest ||
      (actionType === 'plan.create_task'
        ? { id, actionType }
        : { actionType, payload: { taskId } }),
  }
}

/**
 * @param {import('vitest').VitestUtils} vi
 * @param {{
 *   mockGetSession: import('vitest').Mock,
 *   mockRpc: import('vitest').Mock,
 *   mockSave?: import('vitest').Mock,
 *   mockFlushSave?: import('vitest').Mock,
 *   ownerEmail?: string,
 *   authUserId?: string,
 *   env?: Record<string, string>,
 *   online?: boolean,
 * }} opts
 */
export function resetOfflineHostTest(vi, opts) {
  vi.resetModules()
  const env = {
    VITE_KENOS_PROD_WRITES: '1',
    VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE: '1',
    ...(opts.env || {}),
  }
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value)
  }
  const storage = createMemoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('navigator', { onLine: opts.online !== false })
  opts.mockRpc.mockReset()
  opts.mockGetSession.mockReset()
  opts.mockSave?.mockReset()
  opts.mockFlushSave?.mockReset()
  opts.mockGetSession.mockResolvedValue({
    data: {
      session: {
        user: {
          id: opts.authUserId || OFFLINE_TEST_AUTH_USER_ID,
          email: opts.ownerEmail || OFFLINE_TEST_OWNER_EMAIL,
        },
      },
    },
    error: null,
  })
  return storage
}

/**
 * @param {Storage} storage
 * @param {string} key
 * @param {object} state
 */
export function seedQueue(storage, key, state) {
  storage.setItem(key, JSON.stringify(state))
}
