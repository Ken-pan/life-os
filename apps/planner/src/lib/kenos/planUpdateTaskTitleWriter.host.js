/**
 * Hosted Plan update-task-title writer — browser UI path.
 * Fail closed: no Legacy title upsert fallback on RPC failure when enabled.
 */

import { S, save } from '../state.svelte.js'
import { supabase } from '../supabase.js'
import {
  buildPlanUiUpdateTaskTitleAction,
  isPlanUpdateTaskTitleWriterCohortMember,
  isPlanUpdateTaskTitleWriterEnabled,
} from './planUpdateTaskTitleWriter.core.js'
import { markKenosCreatedTaskLegacyDirty } from './planCreateTaskWriter.core.js'
import {
  enqueuePlanOfflineIntent,
  shouldEnqueuePlanOfflineMutation,
  withOfflineQueuedMeta,
} from './planOfflineIntentQueue.host.js'

/**
 * @param {string} taskId
 * @param {string} title
 * @param {{ idempotencyKey?: string, correlationId?: string }} [opts]
 */
export async function updateTaskTitleViaHostedKenosWriter(taskId, title, opts = {}) {
  if (!isPlanUpdateTaskTitleWriterEnabled()) {
    throw new Error('Plan update-task-title writer flags are off')
  }
  if (!supabase) throw new Error('Supabase is not configured for hosted Plan title writer')

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUserId = session?.user?.id
  if (!authUserId) throw new Error('Authentication required for Plan title writer')
  if (!isPlanUpdateTaskTitleWriterCohortMember(session?.user?.email)) {
    throw new Error('Plan title writer cohort does not include this account')
  }

  const trimmed = String(title).trim()
  const action = buildPlanUiUpdateTaskTitleAction(
    { taskId, title: trimmed },
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
        title: trimmed,
        updatedAt: Date.now(),
        meta: {
          ...(prev.meta || {}),
          kenosWriterTitleEdit: true,
          command: {
            ...(prev.meta?.command || {}),
            actionType: 'plan.update_task_title',
            idempotencyKey: action.idempotencyKey,
            correlationId: action.correlationId,
          },
        },
      })
      S.tasks = S.tasks.map((t) => (t.id === taskId ? next : t))
      save()
      return next
    }
    return withOfflineQueuedMeta({ id: taskId, title: trimmed, meta: { kenosWriterTitleEdit: true } })
  }

  const { data, error } = await supabase.rpc('kenos_update_plan_task_title_action', {
    action_request: action,
  })
  if (error) {
    const err = new Error(error.message || 'Hosted update-task-title RPC failed')
    err.code = error.code || 'remote_rpc_failed'
    throw err
  }
  const remote = data && typeof data === 'object' ? data : null
  if (!remote?.ok) {
    const err = new Error(remote?.error?.message || 'Hosted update-task-title RPC rejected')
    err.code = remote?.error?.code || 'remote_rpc_rejected'
    throw err
  }

  const idx = S.tasks.findIndex((t) => t.id === taskId)
  if (idx >= 0) {
    const prev = markKenosCreatedTaskLegacyDirty(S.tasks[idx])
    const next = {
      ...prev,
      title: String(title).trim(),
      updatedAt: Date.now(),
      meta: {
        ...(prev.meta || {}),
        legacyDirty: false,
        kenosWriterTitleEdit: true,
        command: {
          ...(prev.meta?.command || {}),
          actionType: 'plan.update_task_title',
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
  return { id: taskId, title: String(title).trim(), meta: { kenosWriterTitleEdit: true } }
}
