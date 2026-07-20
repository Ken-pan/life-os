/**
 * Plan update-task-due-date Writer — hosted Kenos command path.
 */

import { isPlannerCompatCanaryMode } from './prodWriteGuard.core.js'
import { contractUuid, resolvePlanCreateDeviceId } from './planCreateTaskWriter.core.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isPlanUpdateTaskDueDateWriterEnabled(env = import.meta.env) {
  if (isPlannerCompatCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_PLAN_UPDATE_TASK_DUE_DATE_WRITER === '1'
}

/**
 * @param {string | null | undefined} email
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isPlanUpdateTaskDueDateWriterCohortMember(email, env = import.meta.env) {
  const raw = String(
    env?.VITE_KENOS_PLAN_UPDATE_TASK_DUE_DATE_WRITER_OWNER_EMAILS ||
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

/**
 * @param {string | null | undefined} dueDate
 */
export function normalizePlanDueDatePayload(dueDate) {
  if (dueDate == null || dueDate === '') return null
  const value = String(dueDate).trim()
  if (!DUE_DATE_PATTERN.test(value)) {
    throw new Error('dueDate must be YYYY-MM-DD or null')
  }
  return value
}

export function buildPlanUiUpdateTaskDueDateAction(input = {}, opts = {}) {
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildPlanUiUpdateTaskDueDateAction requires authenticated authUserId UUID')
  }
  const taskId = String(input.taskId || '').trim()
  if (!taskId) throw new Error('Task id is required.')
  const dueDate = normalizePlanDueDatePayload(input.dueDate)

  const now = opts.now ?? Date.now()
  const correlationId = opts.correlationId && UUID_PATTERN.test(opts.correlationId) ? opts.correlationId : contractUuid()
  const actionId = opts.actionId && UUID_PATTERN.test(opts.actionId) ? opts.actionId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId) ? opts.deviceId : resolvePlanCreateDeviceId()
  const idempotencyKey = String(opts.idempotencyKey || `plan_ui_due:${correlationId}`)

  return {
    schemaVersion: '1',
    id: actionId,
    actionType: 'plan.update_task_due_date',
    producer: 'plan',
    targetDomain: 'plan',
    actor: { type: 'user', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: { taskId, dueDate },
    reason: 'Owner-limited Plan UI update-task-due-date writer',
    idempotencyKey,
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    correlationId,
  }
}
