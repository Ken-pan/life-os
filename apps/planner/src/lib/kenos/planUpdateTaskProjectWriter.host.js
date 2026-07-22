/**
 * Hosted Plan update-task-project writer — browser UI path.
 * Fail closed: no Legacy project upsert fallback on RPC failure when enabled.
 */

import { S, save } from '../state.svelte.js'
import { supabase } from '../supabase.js'
import {
  buildPlanUiUpdateTaskProjectAction,
  isPlanUpdateTaskProjectWriterCohortMember,
  isPlanUpdateTaskProjectWriterEnabled,
  normalizePlanProjectId,
} from './planUpdateTaskProjectWriter.core.js'
import { markKenosCreatedTaskLegacyDirty } from './planCreateTaskWriter.core.js'
import {
  enqueuePlanOfflineIntent,
  shouldEnqueuePlanOfflineMutation,
  withOfflineQueuedMeta,
} from './planOfflineIntentQueue.host.js'

export async function updateTaskProjectViaHostedKenosWriter(taskId, projectId, opts = {}) {
  if (!isPlanUpdateTaskProjectWriterEnabled()) {
    throw new Error('Plan update-task-project writer flags are off')
  }
  if (!supabase) throw new Error('Supabase is not configured for hosted Plan project writer')

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUserId = session?.user?.id
  if (!authUserId) throw new Error('Authentication required for Plan project writer')
  if (!isPlanUpdateTaskProjectWriterCohortMember(session?.user?.email)) {
    throw new Error('Plan project writer cohort does not include this account')
  }

  const normalized = normalizePlanProjectId(projectId)
  const action = buildPlanUiUpdateTaskProjectAction(
    { taskId, projectId: normalized },
    { authUserId, idempotencyKey: opts.idempotencyKey, correlationId: opts.correlationId },
  )

  if (shouldEnqueuePlanOfflineMutation()) {
    enqueuePlanOfflineIntent({ authUserId, action, taskId })
    const idx = S.tasks.findIndex((t) => t.id === taskId)
    if (idx >= 0) {
      const prev = markKenosCreatedTaskLegacyDirty(S.tasks[idx])
      const next = withOfflineQueuedMeta({
        ...prev,
        projectId: normalized,
        updatedAt: Date.now(),
        meta: {
          ...(prev.meta || {}),
          kenosWriterProjectEdit: true,
          command: {
            ...(prev.meta?.command || {}),
            actionType: 'plan.update_task_project',
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
      projectId: normalized,
      meta: { kenosWriterProjectEdit: true },
    })
  }

  const { data, error } = await supabase.rpc('kenos_update_plan_task_project_action', {
    action_request: action,
  })
  if (error) {
    const err = new Error(error.message || 'Hosted update-task-project RPC failed')
    err.code = error.code || 'remote_rpc_failed'
    throw err
  }
  const remote = data && typeof data === 'object' ? data : null
  if (!remote?.ok) {
    const err = new Error(remote?.error?.message || 'Hosted update-task-project RPC rejected')
    err.code = remote?.error?.code || 'remote_rpc_rejected'
    throw err
  }

  const idx = S.tasks.findIndex((t) => t.id === taskId)
  if (idx >= 0) {
    const prev = markKenosCreatedTaskLegacyDirty(S.tasks[idx])
    const next = {
      ...prev,
      projectId: normalized,
      updatedAt: Date.now(),
      meta: {
        ...(prev.meta || {}),
        legacyDirty: false,
        kenosWriterProjectEdit: true,
        command: {
          ...(prev.meta?.command || {}),
          actionType: 'plan.update_task_project',
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
  return { id: taskId, projectId: normalized, meta: { kenosWriterProjectEdit: true } }
}
