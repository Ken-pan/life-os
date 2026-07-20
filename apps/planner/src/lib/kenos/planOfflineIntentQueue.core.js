/**
 * Kenos Plan offline intent queue — Track C foundation.
 * Default OFF. When enabled, durable local intents bind to user+device+idempotency.
 * Must NOT fallback to Legacy dual-write. Must NOT flush when auth expired.
 */

export const KENOS_OFFLINE_QUEUE_STORAGE_KEY = 'kenos.plan.offlineIntentQueue.v1'

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isPlanOfflineWriterQueueEnabled(env = import.meta.env) {
  return env?.VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE === '1' && env?.VITE_KENOS_PROD_WRITES === '1'
}

/**
 * @param {{ userId?: string | null, deviceId?: string | null, intents?: object[] }} state
 */
export function createEmptyOfflineQueueState(state = {}) {
  return {
    schemaVersion: 1,
    userId: state.userId ?? null,
    deviceId: state.deviceId ?? null,
    intents: Array.isArray(state.intents) ? state.intents : [],
  }
}

/**
 * Drop queue on account switch / logout.
 * @param {object} state
 * @param {string | null | undefined} nextUserId
 */
export function bindOfflineQueueToUser(state, nextUserId) {
  const userId = nextUserId || null
  if (!state || state.userId !== userId) {
    return createEmptyOfflineQueueState({ userId, deviceId: state?.deviceId ?? null })
  }
  return state
}

/**
 * @param {object} state
 * @param {{ id: string, actionType: string, idempotencyKey: string, correlationId: string, actionRequest: object, enqueuedAt: number }} intent
 */
export function enqueueOfflineIntent(state, intent) {
  if (!intent?.id || !intent?.idempotencyKey || !intent?.actionType) {
    throw new Error('offline intent requires id, actionType, idempotencyKey')
  }
  const intents = [...(state.intents || [])]
  const dup = intents.find(
    (i) => i.actionType === intent.actionType && i.idempotencyKey === intent.idempotencyKey,
  )
  if (dup) {
    return { state, duplicate: true, intent: dup }
  }
  intents.push({
    ...intent,
    status: 'pending',
    attempts: 0,
  })
  return { state: { ...state, intents }, duplicate: false, intent }
}

/**
 * Exactly-once drain: mark succeeded intents removed; leave failed for retry.
 * @param {object} state
 * @param {(intent: object) => Promise<{ ok: boolean, duplicate?: boolean, error?: string }>} flushOne
 * @param {{ authUserId?: string | null }} opts
 */
export async function flushOfflineIntentQueue(state, flushOne, opts = {}) {
  if (!opts.authUserId || opts.authUserId !== state.userId) {
    return { state, flushed: 0, blocked: 'auth_mismatch_or_missing', remaining: state.intents?.length || 0 }
  }
  const remaining = []
  let flushed = 0
  for (const intent of state.intents || []) {
    const result = await flushOne(intent)
    if (result?.ok) {
      flushed += 1
      continue
    }
    remaining.push({
      ...intent,
      status: 'failed',
      attempts: (intent.attempts || 0) + 1,
      lastError: result?.error || 'flush_failed',
    })
  }
  return {
    state: { ...state, intents: remaining },
    flushed,
    blocked: null,
    remaining: remaining.length,
  }
}

/**
 * @param {Storage | undefined} storage
 * @param {object} state
 */
export function persistOfflineQueue(storage, state) {
  if (!storage) return
  storage.setItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(state))
}

/**
 * @param {Storage | undefined} storage
 */
export function loadOfflineQueue(storage) {
  if (!storage) return createEmptyOfflineQueueState()
  try {
    const raw = storage.getItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY)
    if (!raw) return createEmptyOfflineQueueState()
    const parsed = JSON.parse(raw)
    return createEmptyOfflineQueueState(parsed)
  } catch {
    return createEmptyOfflineQueueState()
  }
}

export function clearOfflineQueue(storage) {
  if (!storage) return
  storage.removeItem(KENOS_OFFLINE_QUEUE_STORAGE_KEY)
}
