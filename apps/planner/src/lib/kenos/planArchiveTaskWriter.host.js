/**
 * Hosted Plan archive-task writer — soft delete / tombstone.
 * Fail closed: no Legacy delete fallback on RPC failure when enabled.
 */

import { S, save } from '../state.svelte.js'
import { supabase } from '../supabase.js'
import { softDeleteAttachmentsForOwner } from '../services/attachmentService.js'
import {
  buildPlanUiArchiveTaskAction,
  isPlanArchiveTaskWriterCohortMember,
  isPlanArchiveTaskWriterEnabled,
} from './planArchiveTaskWriter.core.js'
import { markKenosCreatedTaskLegacyDirty } from './planCreateTaskWriter.core.js'
import {
  enqueuePlanOfflineIntent,
  shouldEnqueuePlanOfflineMutation,
  withOfflineQueuedMeta,
} from './planOfflineIntentQueue.host.js'

export async function archiveTaskViaHostedKenosWriter(taskId, opts = {}) {
  if (!isPlanArchiveTaskWriterEnabled()) {
    throw new Error('Plan archive-task writer flags are off')
  }
  if (!supabase) throw new Error('Supabase is not configured for hosted Plan archive writer')

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUserId = session?.user?.id
  if (!authUserId) throw new Error('Authentication required for Plan archive writer')
  if (!isPlanArchiveTaskWriterCohortMember(session?.user?.email)) {
    throw new Error('Plan archive writer cohort does not include this account')
  }

  const action = buildPlanUiArchiveTaskAction(
    { taskId },
    { authUserId, idempotencyKey: opts.idempotencyKey, correlationId: opts.correlationId },
  )

  if (shouldEnqueuePlanOfflineMutation()) {
    enqueuePlanOfflineIntent({ authUserId, action, taskId })
    const now = Date.now()
    S.tasks = S.tasks.map((t) => {
      if (t.id !== taskId) return t
      const base = markKenosCreatedTaskLegacyDirty(t)
      return withOfflineQueuedMeta({
        ...base,
        deletedAt: now,
        updatedAt: now,
        meta: {
          ...(base.meta || {}),
          kenosWriterArchive: true,
          command: {
            ...(base.meta?.command || {}),
            actionType: 'plan.archive_task',
            idempotencyKey: action.idempotencyKey,
            correlationId: action.correlationId,
          },
        },
      })
    })
    softDeleteAttachmentsForOwner('task', taskId)
    save()
    return S.tasks.find((t) => t.id === taskId) || { id: taskId, deletedAt: now }
  }

  const { data, error } = await supabase.rpc('kenos_archive_plan_task_action', {
    action_request: action,
  })
  if (error) {
    const err = new Error(error.message || 'Hosted archive-task RPC failed')
    err.code = error.code || 'remote_rpc_failed'
    throw err
  }
  const remote = data && typeof data === 'object' ? data : null
  if (!remote?.ok) {
    const err = new Error(remote?.error?.message || 'Hosted archive-task RPC rejected')
    err.code = remote?.error?.code || 'remote_rpc_rejected'
    throw err
  }

  const now = Date.now()
  S.tasks = S.tasks.map((t) => {
    if (t.id !== taskId) return t
    const base = markKenosCreatedTaskLegacyDirty(t)
    return {
      ...base,
      deletedAt: now,
      updatedAt: now,
      meta: {
        ...(base.meta || {}),
        legacyDirty: false,
        kenosWriterArchive: true,
        command: {
          ...(base.meta?.command || {}),
          actionType: 'plan.archive_task',
          idempotencyKey: action.idempotencyKey,
          correlationId: action.correlationId,
          activityId: remote.activityId ?? null,
          outboxId: remote.outboxId ?? null,
          duplicate: Boolean(remote.duplicate),
        },
      },
    }
  })
  softDeleteAttachmentsForOwner('task', taskId)
  save()
  return S.tasks.find((t) => t.id === taskId) || { id: taskId, deletedAt: now }
}
