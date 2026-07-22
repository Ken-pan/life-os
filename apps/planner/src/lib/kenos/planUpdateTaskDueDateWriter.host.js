/**
 * Hosted Plan update-task-due-date writer — browser UI path.
 * Fail closed: no Legacy due-date upsert fallback on RPC failure when enabled.
 */

import { S, save } from '../state.svelte.js'
import { supabase } from '../supabase.js'
import {
  buildPlanUiUpdateTaskDueDateAction,
  isPlanUpdateTaskDueDateWriterCohortMember,
  isPlanUpdateTaskDueDateWriterEnabled,
  normalizePlanDueDatePayload,
} from './planUpdateTaskDueDateWriter.core.js'
import { markKenosCreatedTaskLegacyDirty } from './planCreateTaskWriter.core.js'
import {
  enqueuePlanOfflineIntent,
  shouldEnqueuePlanOfflineMutation,
  withOfflineQueuedMeta,
} from './planOfflineIntentQueue.host.js'

/**
 * @param {string} taskId
 * @param {string | null | undefined} dueDate
 * @param {{ idempotencyKey?: string, correlationId?: string }} [opts]
 */
export async function updateTaskDueDateViaHostedKenosWriter(taskId, dueDate, opts = {}) {
  if (!isPlanUpdateTaskDueDateWriterEnabled()) {
    throw new Error('Plan update-task-due-date writer flags are off')
  }
  if (!supabase) throw new Error('Supabase is not configured for hosted Plan due-date writer')

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUserId = session?.user?.id
  if (!authUserId) throw new Error('Authentication required for Plan due-date writer')
  if (!isPlanUpdateTaskDueDateWriterCohortMember(session?.user?.email)) {
    throw new Error('Plan due-date writer cohort does not include this account')
  }

  const normalizedDue = normalizePlanDueDatePayload(dueDate)
  const action = buildPlanUiUpdateTaskDueDateAction(
    { taskId, dueDate: normalizedDue },
    {
      authUserId,
      idempotencyKey: opts.idempotencyKey,
      correlationId: opts.correlationId,
    },
  )

  if (shouldEnqueuePlanOfflineMutation()) {
    enqueuePlanOfflineIntent({ authUserId, action, taskId })
    const idx = S.tasks.findIndex((t) => t.id === taskId)
    if (idx >= 0) {
      const prev = markKenosCreatedTaskLegacyDirty(S.tasks[idx])
      const next = withOfflineQueuedMeta({
        ...prev,
        dueDate: normalizedDue,
        updatedAt: Date.now(),
        meta: {
          ...(prev.meta || {}),
          kenosWriterDueDateEdit: true,
          command: {
            ...(prev.meta?.command || {}),
            actionType: 'plan.update_task_due_date',
            idempotencyKey: action.idempotencyKey,
            correlationId: action.correlationId,
          },
        },
      })
      S.tasks = S.tasks.map((t) => (t.id === taskId ? next : t))
      save()
      return next
    }
    return withOfflineQueuedMeta({
      id: taskId,
      dueDate: normalizedDue,
      meta: { kenosWriterDueDateEdit: true },
    })
  }

  const { data, error } = await supabase.rpc('kenos_update_plan_task_due_date_action', {
    action_request: action,
  })
  if (error) {
    const err = new Error(error.message || 'Hosted update-task-due-date RPC failed')
    err.code = error.code || 'remote_rpc_failed'
    throw err
  }
  const remote = data && typeof data === 'object' ? data : null
  if (!remote?.ok) {
    const err = new Error(remote?.error?.message || 'Hosted update-task-due-date RPC rejected')
    err.code = remote?.error?.code || 'remote_rpc_rejected'
    throw err
  }

  const idx = S.tasks.findIndex((t) => t.id === taskId)
  if (idx >= 0) {
    const prev = markKenosCreatedTaskLegacyDirty(S.tasks[idx])
    const next = {
      ...prev,
      dueDate: normalizedDue,
      updatedAt: Date.now(),
      meta: {
        ...(prev.meta || {}),
        legacyDirty: false,
        kenosWriterDueDateEdit: true,
        command: {
          ...(prev.meta?.command || {}),
          actionType: 'plan.update_task_due_date',
          idempotencyKey: action.idempotencyKey,
          correlationId: action.correlationId,
          activityId: remote.activityId ?? null,
          outboxId: remote.outboxId ?? null,
          duplicate: Boolean(remote.duplicate),
        },
      },
    }
    S.tasks = S.tasks.map((t) => (t.id === taskId ? next : t))
    save()
    return next
  }
  return { id: taskId, dueDate: normalizedDue, meta: { kenosWriterDueDateEdit: true } }
}
