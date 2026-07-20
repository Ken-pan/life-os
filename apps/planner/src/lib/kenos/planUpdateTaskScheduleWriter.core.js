/**
 * Plan update-task-schedule Writer — hosted Kenos command path.
 */

import { isPlannerCompatCanaryMode } from './prodWriteGuard.core.js'
import { contractUuid, resolvePlanCreateDeviceId } from './planCreateTaskWriter.core.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isPlanUpdateTaskScheduleWriterEnabled(env = import.meta.env) {
  if (isPlannerCompatCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_PLAN_UPDATE_TASK_SCHEDULE_WRITER === '1'
}

/**
 * @param {string | null | undefined} email
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isPlanUpdateTaskScheduleWriterCohortMember(email, env = import.meta.env) {
  const raw = String(
    env?.VITE_KENOS_PLAN_UPDATE_TASK_SCHEDULE_WRITER_OWNER_EMAILS ||
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

export function normalizePlanSchedulePayload(input = {}) {
  const scheduledDate =
    input.scheduledDate == null || input.scheduledDate === ''
      ? null
      : String(input.scheduledDate).trim()
  const scheduledStart =
    input.scheduledStart == null || input.scheduledStart === ''
      ? null
      : String(input.scheduledStart).trim()
  let durationMinutes = input.durationMinutes
  if (durationMinutes === '' || durationMinutes == null) durationMinutes = null
  else durationMinutes = Number(durationMinutes)

  if (scheduledDate != null && !DATE_PATTERN.test(scheduledDate)) {
    throw new Error('scheduledDate must be YYYY-MM-DD or null')
  }
  if (scheduledStart != null && !TIME_PATTERN.test(scheduledStart)) {
    throw new Error('scheduledStart must be HH:MM or null')
  }
  if (durationMinutes != null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)) {
    throw new Error('durationMinutes must be 1–1440 or null')
  }
  if (scheduledDate == null && (scheduledStart != null || durationMinutes != null)) {
    throw new Error('schedule requires scheduledDate when start/duration set')
  }
  return { scheduledDate, scheduledStart, durationMinutes }
}

export function buildPlanUiUpdateTaskScheduleAction(input = {}, opts = {}) {
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildPlanUiUpdateTaskScheduleAction requires authenticated authUserId UUID')
  }
  const taskId = String(input.taskId || '').trim()
  if (!taskId) throw new Error('Task id is required.')
  const schedule = normalizePlanSchedulePayload(input)

  const now = opts.now ?? Date.now()
  const correlationId = opts.correlationId && UUID_PATTERN.test(opts.correlationId) ? opts.correlationId : contractUuid()
  const actionId = opts.actionId && UUID_PATTERN.test(opts.actionId) ? opts.actionId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId) ? opts.deviceId : resolvePlanCreateDeviceId()
  const idempotencyKey = String(opts.idempotencyKey || `plan_ui_schedule:${correlationId}`)

  return {
    schemaVersion: '1',
    id: actionId,
    actionType: 'plan.update_task_schedule',
    producer: 'plan',
    targetDomain: 'plan',
    actor: { type: 'user', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: { taskId, ...schedule },
    reason: 'Owner-limited Plan UI update-task-schedule writer',
    idempotencyKey,
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    correlationId,
  }
}
