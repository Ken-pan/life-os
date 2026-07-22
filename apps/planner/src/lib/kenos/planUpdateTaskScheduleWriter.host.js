/**
 * Hosted Plan update-task-schedule writer — browser UI path.
 * Fail closed: no Legacy schedule upsert fallback on RPC failure when enabled.
 */

import { S, save } from '../state.svelte.js'
import { supabase } from '../supabase.js'
import {
  buildPlanUiUpdateTaskScheduleAction,
  isPlanUpdateTaskScheduleWriterCohortMember,
  isPlanUpdateTaskScheduleWriterEnabled,
  normalizePlanSchedulePayload,
} from './planUpdateTaskScheduleWriter.core.js'
import { markKenosCreatedTaskLegacyDirty } from './planCreateTaskWriter.core.js'
import {
  enqueuePlanOfflineIntent,
  shouldEnqueuePlanOfflineMutation,
  withOfflineQueuedMeta,
} from './planOfflineIntentQueue.host.js'

/**
 * @param {string} taskId
 * @param {{ scheduledDate?: string | null, scheduledStart?: string | null, durationMinutes?: number | null }} schedule
 * @param {{ idempotencyKey?: string, correlationId?: string }} [opts]
 */
export async function updateTaskScheduleViaHostedKenosWriter(taskId, schedule, opts = {}) {
  if (!isPlanUpdateTaskScheduleWriterEnabled()) {
    throw new Error('Plan update-task-schedule writer flags are off')
  }
  if (!supabase) throw new Error('Supabase is not configured for hosted Plan schedule writer')

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUserId = session?.user?.id
  if (!authUserId) throw new Error('Authentication required for Plan schedule writer')
  if (!isPlanUpdateTaskScheduleWriterCohortMember(session?.user?.email)) {
    throw new Error('Plan schedule writer cohort does not include this account')
  }

  const normalized = normalizePlanSchedulePayload(schedule)
  const action = buildPlanUiUpdateTaskScheduleAction(
    { taskId, ...normalized },
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
        ...normalized,
        updatedAt: Date.now(),
        meta: {
          ...(prev.meta || {}),
          kenosWriterScheduleEdit: true,
          command: {
            ...(prev.meta?.command || {}),
            actionType: 'plan.update_task_schedule',
            idempotencyKey: action.idempotencyKey,
            correlationId: action.correlationId,
          },
        },
      })
      S.tasks = S.tasks.map((t) => (t.id === taskId ? next : t))
      save()
      return next
    }
    return withOfflineQueuedMeta({ id: taskId, ...normalized, meta: { kenosWriterScheduleEdit: true } })
  }

  const { data, error } = await supabase.rpc('kenos_update_plan_task_schedule_action', {
    action_request: action,
  })
  if (error) {
    const err = new Error(error.message || 'Hosted update-task-schedule RPC failed')
    err.code = error.code || 'remote_rpc_failed'
    throw err
  }
  const remote = data && typeof data === 'object' ? data : null
  if (!remote?.ok) {
    const err = new Error(remote?.error?.message || 'Hosted update-task-schedule RPC rejected')
    err.code = remote?.error?.code || 'remote_rpc_rejected'
    throw err
  }

  const idx = S.tasks.findIndex((t) => t.id === taskId)
  if (idx >= 0) {
    const prev = markKenosCreatedTaskLegacyDirty(S.tasks[idx])
    const next = {
      ...prev,
      ...normalized,
      updatedAt: Date.now(),
      meta: {
        ...(prev.meta || {}),
        legacyDirty: false,
        kenosWriterScheduleEdit: true,
        command: {
          ...(prev.meta?.command || {}),
          actionType: 'plan.update_task_schedule',
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
  return { id: taskId, ...normalized, meta: { kenosWriterScheduleEdit: true } }
}
