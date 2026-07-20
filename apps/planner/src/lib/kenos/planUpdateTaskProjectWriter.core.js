/**
 * Plan update-task-project Writer — hosted Kenos command path.
 */

import { isPlannerCompatCanaryMode } from './prodWriteGuard.core.js'
import { contractUuid, resolvePlanCreateDeviceId } from './planCreateTaskWriter.core.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPlanUpdateTaskProjectWriterEnabled(env = import.meta.env) {
  if (isPlannerCompatCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_PLAN_UPDATE_TASK_PROJECT_WRITER === '1'
}

export function isPlanUpdateTaskProjectWriterCohortMember(email, env = import.meta.env) {
  const raw = String(
    env?.VITE_KENOS_PLAN_UPDATE_TASK_PROJECT_WRITER_OWNER_EMAILS ||
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

export function normalizePlanProjectId(projectId) {
  if (projectId == null || projectId === '') return null
  return String(projectId).trim() || null
}

export function buildPlanUiUpdateTaskProjectAction(input = {}, opts = {}) {
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildPlanUiUpdateTaskProjectAction requires authenticated authUserId UUID')
  }
  const taskId = String(input.taskId || '').trim()
  if (!taskId) throw new Error('Task id is required.')
  const projectId = normalizePlanProjectId(input.projectId)
  const now = opts.now ?? Date.now()
  const correlationId = opts.correlationId && UUID_PATTERN.test(opts.correlationId) ? opts.correlationId : contractUuid()
  const actionId = opts.actionId && UUID_PATTERN.test(opts.actionId) ? opts.actionId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId) ? opts.deviceId : resolvePlanCreateDeviceId()
  return {
    schemaVersion: '1',
    id: actionId,
    actionType: 'plan.update_task_project',
    producer: 'plan',
    targetDomain: 'plan',
    actor: { type: 'user', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: { taskId, projectId },
    reason: 'Owner-limited Plan UI update-task-project writer',
    idempotencyKey: String(opts.idempotencyKey || `plan_ui_project:${correlationId}`),
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    correlationId,
  }
}
