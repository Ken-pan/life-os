/**
 * Kenos Plan offline intent queue — Track C foundation.
 * Default OFF. When enabled, durable local intents bind to user+device+idempotency.
 * Must NOT fallback to Legacy dual-write. Must NOT flush when auth expired.
 */

import { MUTATION_STATE, NON_RETRYABLE_STATUSES, nextIntentState } from './mutationLifecycle.core.js'

export const KENOS_OFFLINE_QUEUE_STORAGE_KEY = 'kenos.plan.offlineIntentQueue.v1'

/** Failed flushes beyond this become dead_letter (skipped until explicit retry). */
export const OFFLINE_INTENT_MAX_ATTEMPTS = 5

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
/**
 * Stable, order-independent fingerprint of the mutation payload — used to detect
 * an idempotency-key reused with a DIFFERENT payload (F5-05.4: must not silently
 * accept changed data under the same key).
 * @param {object | undefined} actionRequest
 */
export function offlineIntentPayloadFingerprint(actionRequest) {
  const payload = actionRequest?.payload ?? {}
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable)
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .sort()
        .reduce((acc, k) => {
          acc[k] = stable(v[k])
          return acc
        }, {})
    }
    return v
  }
  return JSON.stringify(stable(payload))
}

export function enqueueOfflineIntent(state, intent) {
  if (!intent?.id || !intent?.idempotencyKey || !intent?.actionType) {
    throw new Error('offline intent requires id, actionType, idempotencyKey')
  }
  const intents = [...(state.intents || [])]
  const dup = intents.find(
    (i) => i.actionType === intent.actionType && i.idempotencyKey === intent.idempotencyKey,
  )
  if (dup) {
    // Same key, same payload → idempotent re-enqueue (safe no-op).
    // Same key, DIFFERENT payload → a client bug that would otherwise silently
    // drop the new data server-side. Fail loudly instead.
    const dupFp = offlineIntentPayloadFingerprint(dup.actionRequest)
    const newFp = offlineIntentPayloadFingerprint(intent.actionRequest)
    if (dupFp !== newFp) {
      throw new Error('idempotency_key_payload_mismatch')
    }
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
 * Exactly-once drain: succeeded intents removed; failed retry; dead_letter after max attempts.
 * @param {object} state
 * @param {(intent: object) => Promise<{ ok: boolean, duplicate?: boolean, error?: string }>} flushOne
 * @param {{ authUserId?: string | null, maxAttempts?: number }} opts
 */
export async function flushOfflineIntentQueue(state, flushOne, opts = {}) {
  if (!opts.authUserId || opts.authUserId !== state.userId) {
    return { state, flushed: 0, blocked: 'auth_mismatch_or_missing', remaining: state.intents?.length || 0 }
  }
  const maxAttempts = opts.maxAttempts ?? OFFLINE_INTENT_MAX_ATTEMPTS
  const remaining = []
  let flushed = 0
  let deadLettered = 0
  let rejected = 0
  for (const intent of state.intents || []) {
    // Terminal / hold states are never re-attempted automatically.
    if (NON_RETRYABLE_STATUSES.has(intent.status)) {
      remaining.push(intent)
      continue
    }
    const result = await flushOne(intent)
    const next = nextIntentState(intent, result, maxAttempts)
    if (next.removed) {
      flushed += 1
      continue
    }
    if (next.status === MUTATION_STATE.DEAD_LETTER) deadLettered += 1
    if (next.status === MUTATION_STATE.REJECTED) rejected += 1
    remaining.push({ ...intent, status: next.status, attempts: next.attempts, lastError: next.lastError })
  }
  return {
    state: { ...state, intents: remaining },
    flushed,
    deadLettered,
    rejected,
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

/**
 * Bind queue to the active session user; clears intents on account switch.
 * @param {Storage | undefined} storage
 * @param {string | null | undefined} userId
 */
export function rebindOfflineQueueForSession(storage, userId) {
  const next = bindOfflineQueueToUser(loadOfflineQueue(storage), userId || null)
  persistOfflineQueue(storage, next)
  return next
}

/**
 * @param {object} state
 */
export function countPendingOfflineIntents(state) {
  // Work still trying to sync: queued, retrying, or held for reauth.
  return (state?.intents || []).filter(
    (intent) =>
      intent.status === MUTATION_STATE.QUEUED ||
      intent.status === MUTATION_STATE.RETRYABLE_FAILURE ||
      intent.status === MUTATION_STATE.AUTH_BLOCKED ||
      !intent.status,
  ).length
}

/**
 * Intents that need explicit user action (permanent rejection or conflict).
 * @param {object} state
 */
export function listActionableOfflineIntents(state) {
  return (state?.intents || []).filter(
    (intent) => intent.status === MUTATION_STATE.REJECTED || intent.status === MUTATION_STATE.CONFLICT,
  )
}

/**
 * @param {object} state
 */
export function listDeadLetterOfflineIntents(state) {
  return (state?.intents || []).filter((intent) => intent.status === 'dead_letter')
}

/**
 * @param {object} state
 * @param {string} intentId
 */
export function discardOfflineIntent(state, intentId) {
  const id = String(intentId || '')
  return {
    ...state,
    intents: (state?.intents || []).filter((intent) => intent.id !== id),
  }
}

/**
 * Move a dead_letter intent back to pending for another flush cycle.
 * @param {object} state
 * @param {string} intentId
 */
export function retryDeadLetterOfflineIntent(state, intentId) {
  const id = String(intentId || '')
  return {
    ...state,
    intents: (state?.intents || []).map((intent) => {
      if (intent.id !== id || intent.status !== 'dead_letter') return intent
      return { ...intent, status: 'pending', lastError: undefined }
    }),
  }
}

/**
 * Remap task ids inside a queued mutation after create flush (provisional → server).
 * @param {object} intent
 * @param {Map<string, string> | Record<string, string>} idMap
 */
export function remapOfflineIntentTaskIds(intent, idMap) {
  if (!intent || !idMap) return intent
  const lookup = (key) => {
    if (!key) return null
    if (idMap instanceof Map) return idMap.get(key) || null
    return idMap[key] || null
  }
  const current =
    intent.taskId || intent.provisionalTaskId || intent.actionRequest?.payload?.taskId || null
  const mapped = lookup(current)
  if (!mapped) return intent
  const actionRequest = intent.actionRequest
    ? {
        ...intent.actionRequest,
        payload: {
          ...(intent.actionRequest.payload || {}),
          taskId: mapped,
        },
      }
    : intent.actionRequest
  return {
    ...intent,
    taskId: mapped,
    actionRequest,
  }
}
