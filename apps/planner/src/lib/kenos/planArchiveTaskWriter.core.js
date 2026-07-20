/**
 * Plan archive-task (soft delete) Writer — hosted Kenos command path.
 */

import { isPlannerCompatCanaryMode } from './prodWriteGuard.core.js'
import { contractUuid, resolvePlanCreateDeviceId } from './planCreateTaskWriter.core.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPlanArchiveTaskWriterEnabled(env = import.meta.env) {
  if (isPlannerCompatCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_PLAN_ARCHIVE_TASK_WRITER === '1'
}

export function isPlanArchiveTaskWriterCohortMember(email, env = import.meta.env) {
  const raw = String(
    env?.VITE_KENOS_PLAN_ARCHIVE_TASK_WRITER_OWNER_EMAILS ||
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

export function buildPlanUiArchiveTaskAction(input = {}, opts = {}) {
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildPlanUiArchiveTaskAction requires authenticated authUserId UUID')
  }
  const taskId = String(input.taskId || '').trim()
  if (!taskId) throw new Error('Task id is required.')
  const now = opts.now ?? Date.now()
  const correlationId = opts.correlationId && UUID_PATTERN.test(opts.correlationId) ? opts.correlationId : contractUuid()
  const actionId = opts.actionId && UUID_PATTERN.test(opts.actionId) ? opts.actionId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId) ? opts.deviceId : resolvePlanCreateDeviceId()
  return {
    schemaVersion: '1',
    id: actionId,
    actionType: 'plan.archive_task',
    producer: 'plan',
    targetDomain: 'plan',
    actor: { type: 'user', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: { taskId },
    reason: 'Owner-limited Plan UI archive-task writer',
    idempotencyKey: String(opts.idempotencyKey || `plan_ui_archive:${correlationId}`),
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    correlationId,
  }
}
