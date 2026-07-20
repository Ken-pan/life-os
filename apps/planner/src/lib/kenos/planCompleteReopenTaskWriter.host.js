/**
 * Hosted Plan complete / reopen writers — browser UI path.
 * Fail closed: no Legacy complete/reopen fallback on RPC failure when enabled.
 */

import { S, save } from '../state.svelte.js'
import { supabase } from '../supabase.js'
import {
  buildPlanUiCompleteTaskAction,
  buildPlanUiReopenTaskAction,
  isPlanCompleteReopenWriterCohortMember,
  isPlanCompleteTaskWriterEnabled,
  isPlanReopenTaskWriterEnabled,
} from './planCompleteReopenTaskWriter.core.js'
import { markKenosCreatedTaskLegacyDirty } from './planCreateTaskWriter.core.js'

async function runLifecycle(rpcName, actionBuilder, taskId, patch, opts = {}) {
  if (!supabase) throw new Error('Supabase is not configured for hosted Plan lifecycle writer')
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUserId = session?.user?.id
  if (!authUserId) throw new Error('Authentication required for Plan lifecycle writer')
  if (!isPlanCompleteReopenWriterCohortMember(session?.user?.email)) {
    throw new Error('Plan lifecycle writer cohort does not include this account')
  }

  const action = actionBuilder({ taskId }, { authUserId, ...opts })
  const { data, error } = await supabase.rpc(rpcName, { action_request: action })
  if (error) {
    const err = new Error(error.message || `${rpcName} failed`)
    err.code = error.code || 'remote_rpc_failed'
    throw err
  }
  const remote = data && typeof data === 'object' ? data : null
  if (!remote?.ok) {
    const err = new Error(remote?.error?.message || `${rpcName} rejected`)
    err.code = remote?.error?.code || 'remote_rpc_rejected'
    throw err
  }

  const idx = S.tasks.findIndex((t) => t.id === taskId)
  if (idx >= 0) {
    const prev = markKenosCreatedTaskLegacyDirty(S.tasks[idx])
    const next = {
      ...prev,
      ...patch,
      updatedAt: Date.now(),
      meta: {
        ...(prev.meta || {}),
        legacyDirty: false,
        kenosWriterLifecycle: true,
        command: {
          ...(prev.meta?.command || {}),
          actionType: action.actionType,
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
  return { id: taskId, ...patch, meta: { kenosWriterLifecycle: true } }
}

export async function completeTaskViaHostedKenosWriter(taskId, opts = {}) {
  if (!isPlanCompleteTaskWriterEnabled()) throw new Error('Plan complete-task writer flags are off')
  return runLifecycle(
    'kenos_complete_plan_task_action',
    buildPlanUiCompleteTaskAction,
    taskId,
    { completed: true, completedAt: Date.now() },
    opts,
  )
}

export async function reopenTaskViaHostedKenosWriter(taskId, opts = {}) {
  if (!isPlanReopenTaskWriterEnabled()) throw new Error('Plan reopen-task writer flags are off')
  return runLifecycle(
    'kenos_reopen_plan_task_action',
    buildPlanUiReopenTaskAction,
    taskId,
    { completed: false, completedAt: null },
    opts,
  )
}
