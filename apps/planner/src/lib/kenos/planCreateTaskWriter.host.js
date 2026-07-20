/**
 * Hosted Plan create-task writer — browser UI path.
 * Fail closed: no Legacy create fallback on RPC failure.
 */

import { S, save, flushSave } from '../state.svelte.js'
import { SYSTEM_LIST_INBOX } from '../types.js'
import { supabase } from '../supabase.js'
import { syncRemindersToServiceWorker } from '../services/reminders.js'
import {
  buildPlanUiCreateTaskAction,
  isPlanCreateTaskWriterCohortMember,
  isPlanCreateTaskWriterEnabled,
  materializeHostedCreateTask,
} from './planCreateTaskWriter.core.js'
import {
  enqueueOfflineIntent,
  isPlanOfflineWriterQueueEnabled,
  loadOfflineQueue,
  persistOfflineQueue,
  bindOfflineQueueToUser,
} from './planOfflineIntentQueue.core.js'

let reminderTimer = null

function afterHostedCreate() {
  flushSave()
  save()
  clearTimeout(reminderTimer)
  reminderTimer = setTimeout(() => {
    syncRemindersToServiceWorker()
  }, 400)
}

function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * @param {Partial<import('../types.js').Task> & { idempotencyKey?: string, correlationId?: string }} input
 * @returns {Promise<import('../types.js').Task>}
 */
export async function createTaskViaHostedKenosWriter(input = {}) {
  if (!isPlanCreateTaskWriterEnabled()) {
    throw new Error('Plan create-task writer flags are off')
  }
  if (!supabase) {
    throw new Error('Supabase is not configured for hosted Plan create-task writer')
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUserId = session?.user?.id
  if (!authUserId) {
    throw new Error('Authentication required for Plan create-task writer')
  }
  if (!isPlanCreateTaskWriterCohortMember(session?.user?.email)) {
    throw new Error('Plan create-task writer cohort does not include this account')
  }

  const title = String(input.title || '').trim()
  if (!title) throw new Error('Task title is required.')
  if (input.workSource) {
    throw new Error('Work-sourced task payloads are excluded from KR-P1-001.')
  }

  const action = buildPlanUiCreateTaskAction(
    {
      title,
      notes: input.notes,
      dueDate: input.dueDate,
      listId: input.listId || S.settings?.defaultListId || SYSTEM_LIST_INBOX,
      priority: input.priority,
    },
    {
      authUserId,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
    },
  )

  // Track C: when offline queue flag is ON and browser is offline, enqueue only.
  // Never Legacy dual-write. Optimistic local materialize for UX.
  if (isPlanOfflineWriterQueueEnabled() && isBrowserOffline()) {
    let queue = bindOfflineQueueToUser(loadOfflineQueue(localStorage), authUserId)
    const provisionalTaskId = action.id
    const enqueued = enqueueOfflineIntent(queue, {
      id: action.id,
      actionType: action.actionType,
      idempotencyKey: action.idempotencyKey,
      correlationId: action.correlationId,
      actionRequest: action,
      enqueuedAt: Date.now(),
    })
    persistOfflineQueue(localStorage, enqueued.state)
    const task = materializeHostedCreateTask(
      {
        ok: true,
        taskId: provisionalTaskId,
        duplicate: enqueued.duplicate,
        activityId: null,
        outboxId: null,
      },
      {
        ...input,
        title,
        listId: input.listId || S.settings?.defaultListId || SYSTEM_LIST_INBOX,
      },
      action,
    )
    task.meta = {
      ...(task.meta || {}),
      offlineQueued: true,
      legacyDirty: false,
    }
    S.tasks = [task, ...S.tasks.filter((t) => t.id !== task.id)]
    afterHostedCreate()
    return task
  }

  const { data, error } = await supabase.rpc('kenos_create_plan_task_action', {
    action_request: action,
  })

  if (error) {
    const err = new Error(error.message || 'Hosted create-task RPC failed')
    err.code = error.code || 'remote_rpc_failed'
    err.retryable = true
    // Explicit: no Legacy create fallback.
    throw err
  }

  const remote = data && typeof data === 'object' ? data : null
  if (!remote?.ok) {
    const err = new Error(remote?.error?.message || 'Hosted create-task RPC rejected')
    err.code = remote?.error?.code || 'remote_rpc_rejected'
    err.retryable = false
    throw err
  }

  const task = materializeHostedCreateTask(
    remote,
    {
      ...input,
      title,
      listId: input.listId || S.settings?.defaultListId || SYSTEM_LIST_INBOX,
    },
    action,
  )

  // Prefer hosted row over any local duplicate id.
  S.tasks = [...S.tasks.filter((item) => item.id !== task.id), task]
  afterHostedCreate()
  return task
}
