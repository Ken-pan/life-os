/**
 * Plan complete / reopen Writers — hosted Kenos command path.
 */

import { isPlannerCompatCanaryMode } from './prodWriteGuard.core.js'
import { contractUuid, resolvePlanCreateDeviceId } from './planCreateTaskWriter.core.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPlanCompleteTaskWriterEnabled(env = import.meta.env) {
  if (isPlannerCompatCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_PLAN_COMPLETE_TASK_WRITER === '1'
}

export function isPlanReopenTaskWriterEnabled(env = import.meta.env) {
  if (isPlannerCompatCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_PLAN_REOPEN_TASK_WRITER === '1'
}

export function isPlanCompleteReopenWriterCohortMember(email, env = import.meta.env) {
  const raw = String(
    env?.VITE_KENOS_PLAN_COMPLETE_TASK_WRITER_OWNER_EMAILS ||
      env?.VITE_KENOS_PLAN_REOPEN_TASK_WRITER_OWNER_EMAILS ||
      env?.VITE_KENOS_PLAN_CREATE_TASK_WRITER_OWNER_EMAILS ||
      '',
  ).trim()
  if (!raw) return true
  if (!email) return false
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(email).trim().toLowerCase())
}

function buildLifecycleAction(actionType, taskId, authUserId, opts = {}) {
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error(`${actionType} requires authenticated authUserId UUID`)
  }
  const id = String(taskId || '').trim()
  if (!id) throw new Error('Task id is required.')
  const now = opts.now ?? Date.now()
  const correlationId = opts.correlationId && UUID_PATTERN.test(opts.correlationId) ? opts.correlationId : contractUuid()
  const actionId = opts.actionId && UUID_PATTERN.test(opts.actionId) ? opts.actionId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId) ? opts.deviceId : resolvePlanCreateDeviceId()
  const prefix = actionType === 'plan.complete_task' ? 'plan_ui_complete' : 'plan_ui_reopen'
  return {
    schemaVersion: '1',
    id: actionId,
    actionType,
    producer: 'plan',
    targetDomain: 'plan',
    actor: { type: 'user', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: { taskId: id },
    reason: `Owner-limited Plan UI ${actionType}`,
    idempotencyKey: String(opts.idempotencyKey || `${prefix}:${correlationId}`),
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    correlationId,
  }
}

export function buildPlanUiCompleteTaskAction(input = {}, opts = {}) {
  return buildLifecycleAction('plan.complete_task', input.taskId, opts.authUserId, opts)
}

export function buildPlanUiReopenTaskAction(input = {}, opts = {}) {
  return buildLifecycleAction('plan.reopen_task', input.taskId, opts.authUserId, opts)
}
