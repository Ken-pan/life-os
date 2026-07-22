/**
 * Hosted Plan offline intent queue — shared enqueue + unified reconnect flush.
 * Creates flush first, then remaps mutation taskIds, then drains mutations.
 * Never Legacy dual-write. Flag-gated.
 */

import { S, save, flushSave } from '../state.svelte.js'
import { markOffline } from '../syncStatus.svelte.js'
import { supabase } from '../supabase.js'
import { syncRemindersToServiceWorker } from '../services/reminders.js'
import {
  bindOfflineQueueToUser,
  enqueueOfflineIntent,
  flushOfflineIntentQueue,
  isPlanOfflineWriterQueueEnabled,
  loadOfflineQueue,
  persistOfflineQueue,
  remapOfflineIntentTaskIds,
} from './planOfflineIntentQueue.core.js'

/** @type {Record<string, string>} */
export const PLAN_OFFLINE_RPC_BY_ACTION = Object.freeze({
  'plan.create_task': 'kenos_create_plan_task_action',
  'plan.complete_task': 'kenos_complete_plan_task_action',
  'plan.reopen_task': 'kenos_reopen_plan_task_action',
  'plan.update_task_title': 'kenos_update_plan_task_title_action',
  'plan.update_task_due_date': 'kenos_update_plan_task_due_date_action',
  'plan.update_task_schedule': 'kenos_update_plan_task_schedule_action',
  'plan.update_task_project': 'kenos_update_plan_task_project_action',
  'plan.archive_task': 'kenos_archive_plan_task_action',
})

let reminderTimer = null

export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function afterHostedMutation() {
  flushSave()
  save()
  clearTimeout(reminderTimer)
  reminderTimer = setTimeout(() => {
    syncRemindersToServiceWorker()
  }, 400)
}

/**
 * @param {object} task
 * @param {object} [extraMeta]
 */
export function withOfflineQueuedMeta(task, extraMeta = {}) {
  return {
    ...task,
    meta: {
      ...(task.meta || {}),
      ...extraMeta,
      offlineQueued: true,
      legacyDirty: false,
    },
  }
}

/**
 * @param {{
 *   authUserId: string,
 *   action: object,
 *   taskId?: string | null,
 *   provisionalTaskId?: string | null,
 *   storage?: Storage,
 * }} opts
 */
export function enqueuePlanOfflineIntent(opts) {
  const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!storage) throw new Error('localStorage required for offline intent enqueue')
  markOffline()
  let queue = bindOfflineQueueToUser(loadOfflineQueue(storage), opts.authUserId)
  const enqueued = enqueueOfflineIntent(queue, {
    id: opts.action.id,
    actionType: opts.action.actionType,
    idempotencyKey: opts.action.idempotencyKey,
    correlationId: opts.action.correlationId,
    actionRequest: opts.action,
    taskId: opts.taskId || opts.action?.payload?.taskId || null,
    provisionalTaskId: opts.provisionalTaskId || null,
    enqueuedAt: Date.now(),
  })
  persistOfflineQueue(storage, enqueued.state)
  return enqueued
}

/**
 * @returns {boolean}
 */
export function shouldEnqueuePlanOfflineMutation() {
  return isPlanOfflineWriterQueueEnabled() && isBrowserOffline()
}

/**
 * @param {object | null | undefined} intent
 */
export function intentTaskId(intent) {
  return intent?.taskId || intent?.provisionalTaskId || intent?.actionRequest?.payload?.taskId || null
}

/**
 * Keep `meta.offlineQueued` true only while a non-dead-letter intent still references the task.
 * @param {object[]} intents
 */
export function syncOfflineQueuedMetaFromIntents(intents) {
  /** @type {Set<string>} */
  const pendingTaskIds = new Set()
  for (const intent of intents || []) {
    if (intent?.status === 'dead_letter') continue
    const taskId = intentTaskId(intent)
    if (taskId) pendingTaskIds.add(taskId)
  }
  S.tasks = S.tasks.map((task) => {
    const shouldQueue = pendingTaskIds.has(task.id)
    if (Boolean(task.meta?.offlineQueued) === shouldQueue) return task
    return {
      ...task,
      meta: {
        ...(task.meta || {}),
        offlineQueued: shouldQueue,
      },
    }
  })
}

/**
 * @param {object[]} intents
 */
function sortIntentsByEnqueueOrder(intents) {
  return [...(intents || [])].sort((a, b) => (a.enqueuedAt || 0) - (b.enqueuedAt || 0))
}

/**
 * @param {object} intent
 * @param {Map<string, string>} idMap
 */
async function flushCreateIntent(intent, idMap) {
  try {
    const { data, error } = await supabase.rpc('kenos_create_plan_task_action', {
      action_request: intent.actionRequest,
    })
    if (error) return { ok: false, error: error.message || 'rpc_failed' }
    if (!data?.ok) return { ok: false, error: data?.error?.message || 'rpc_rejected' }

    const serverTaskId = data.taskId || data.result?.taskId
    const provisionalId = intent.provisionalTaskId || intent.id
    if (serverTaskId && provisionalId && serverTaskId !== provisionalId) {
      idMap.set(provisionalId, serverTaskId)
    }
    if (serverTaskId) {
      const fromId = provisionalId && provisionalId !== serverTaskId ? provisionalId : serverTaskId
      S.tasks = S.tasks.map((task) => {
        if (task.id !== fromId && task.id !== serverTaskId) return task
        return {
          ...task,
          id: serverTaskId,
          meta: {
            ...(task.meta || {}),
            offlineQueued: false,
            ...(fromId !== serverTaskId ? { offlineRemappedFrom: fromId } : {}),
            kenosWriterCreate: true,
            legacyDirty: false,
          },
        }
      })
    }
    return { ok: true, duplicate: !!data.duplicate }
  } catch (error) {
    return { ok: false, error: error?.message || 'flush_exception' }
  }
}

/**
 * @param {object} intent
 */
async function flushMutationIntent(intent) {
  const rpc = PLAN_OFFLINE_RPC_BY_ACTION[intent.actionType]
  if (!rpc) return { ok: false, error: `unsupported_action:${intent.actionType}` }
  try {
    const { data, error } = await supabase.rpc(rpc, {
      action_request: intent.actionRequest,
    })
    if (error) return { ok: false, error: error.message || 'rpc_failed' }
    if (!data?.ok) return { ok: false, error: data?.error?.message || 'rpc_rejected' }
    // offlineQueued cleared in syncOfflineQueuedMetaFromIntents after full drain
    return { ok: true, duplicate: !!data.duplicate }
  } catch (error) {
    return { ok: false, error: error?.message || 'flush_exception' }
  }
}

/**
 * Unified reconnect flush: creates → remap → mutations. Exactly-once via server idempotency.
 * @returns {Promise<{ flushed: number, remaining: number, deadLettered: number, blocked: string | null }>}
 */
export async function flushOfflinePlanIntentQueue() {
  if (!isPlanOfflineWriterQueueEnabled()) {
    return { flushed: 0, remaining: 0, deadLettered: 0, blocked: 'flag_off' }
  }
  if (!supabase) {
    return { flushed: 0, remaining: 0, deadLettered: 0, blocked: 'supabase_missing' }
  }
  if (isBrowserOffline()) {
    const remaining = loadOfflineQueue(localStorage).intents?.length || 0
    return { flushed: 0, remaining, deadLettered: 0, blocked: 'still_offline' }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const authUserId = session?.user?.id || null
  const loaded = loadOfflineQueue(localStorage)
  // Never bind(null) — that would wipe a durable queue on a transient missing session.
  if (!authUserId) {
    return {
      flushed: 0,
      remaining: loaded.intents?.length || 0,
      deadLettered: 0,
      blocked: 'auth_required',
    }
  }

  const queue = bindOfflineQueueToUser(loaded, authUserId)
  const intents = sortIntentsByEnqueueOrder(queue.intents || [])
  const deadLetters = intents.filter((i) => i.status === 'dead_letter')
  const creates = intents.filter(
    (i) => i.actionType === 'plan.create_task' && i.status !== 'dead_letter',
  )
  const mutations = intents.filter(
    (i) => i.actionType !== 'plan.create_task' && i.status !== 'dead_letter',
  )

  /** @type {Map<string, string>} */
  const idMap = new Map()
  const createResult = await flushOfflineIntentQueue(
    { ...queue, intents: creates },
    (intent) => flushCreateIntent(intent, idMap),
    { authUserId },
  )

  const remappedMutations = mutations.map((intent) => remapOfflineIntentTaskIds(intent, idMap))
  const mutationResult = await flushOfflineIntentQueue(
    { ...queue, intents: remappedMutations },
    flushMutationIntent,
    { authUserId },
  )

  const nextState = {
    ...queue,
    userId: authUserId,
    intents: sortIntentsByEnqueueOrder([
      ...(createResult.state.intents || []),
      ...(mutationResult.state.intents || []),
      ...deadLetters,
    ]),
  }
  persistOfflineQueue(localStorage, nextState)
  syncOfflineQueuedMetaFromIntents(nextState.intents)
  const flushed = (createResult.flushed || 0) + (mutationResult.flushed || 0)
  const deadLettered = (createResult.deadLettered || 0) + (mutationResult.deadLettered || 0)
  if (flushed > 0) afterHostedMutation()
  return {
    flushed,
    remaining: nextState.intents.length,
    deadLettered,
    blocked: createResult.blocked || mutationResult.blocked || null,
  }
}

/** @deprecated Prefer flushOfflinePlanIntentQueue — kept for sync.js / tests. */
export async function flushOfflineCreateTaskQueue() {
  return flushOfflinePlanIntentQueue()
}
