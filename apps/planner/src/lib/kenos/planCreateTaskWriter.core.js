/**
 * Plan create-task Writer Canary — hosted Kenos command path.
 * Requires BOTH VITE_KENOS_PROD_WRITES=1 and VITE_KENOS_PLAN_CREATE_TASK_WRITER=1.
 * Compat / read canary builds always stay fail-closed.
 */

import { isPlannerCompatCanaryMode } from './prodWriteGuard.core.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEVICE_STORAGE_KEY = 'kenos.planCreateTask.deviceId'

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isPlanCreateTaskWriterEnabled(env = import.meta.env) {
  if (isPlannerCompatCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_PLAN_CREATE_TASK_WRITER === '1'
}

export function contractUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

export function resolvePlanCreateDeviceId(storage = globalThis.localStorage) {
  try {
    const existing = storage?.getItem?.(DEVICE_STORAGE_KEY)
    if (existing && UUID_PATTERN.test(existing)) return existing
    const next = contractUuid()
    storage?.setItem?.(DEVICE_STORAGE_KEY, next)
    return next
  } catch {
    return contractUuid()
  }
}

/**
 * Build hosted action_request for plan UI create (producer=plan, actor=user).
 * @param {object} input
 * @param {{ authUserId: string, now?: number, idempotencyKey?: string, correlationId?: string, actionId?: string, deviceId?: string }} opts
 */
export function buildPlanUiCreateTaskAction(input = {}, opts = {}) {
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildPlanUiCreateTaskAction requires authenticated authUserId UUID')
  }
  const title = String(input.title ?? '').trim()
  if (!title) throw new Error('Task title is required.')
  if (input.workSource) throw new Error('Work-sourced task payloads are excluded from KR-P1-001.')

  const now = opts.now ?? Date.now()
  const correlationId = opts.correlationId && UUID_PATTERN.test(opts.correlationId)
    ? opts.correlationId
    : contractUuid()
  const actionId = opts.actionId && UUID_PATTERN.test(opts.actionId) ? opts.actionId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId)
    ? opts.deviceId
    : resolvePlanCreateDeviceId()
  const idempotencyKey = String(opts.idempotencyKey || `plan_ui:${correlationId}`)

  return {
    schemaVersion: '1',
    id: actionId,
    actionType: 'plan.create_task',
    producer: 'plan',
    targetDomain: 'plan',
    actor: { type: 'user', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: {
      title,
      notes: String(input.notes ?? ''),
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
      ...(input.listId ? { listId: input.listId } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    },
    reason: 'Owner-limited Plan UI create-task writer canary',
    idempotencyKey,
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    correlationId,
  }
}

/**
 * Materialize Planner LWW task from hosted RPC success payload + local input extras.
 * Marks task so legacy sync skips the create upsert (lifecycle edits still sync).
 */
export function materializeHostedCreateTask(remote, input = {}, action) {
  const taskId = remote?.taskId || remote?.result?.taskId
  if (!taskId) throw new Error('Hosted create-task RPC returned no taskId')
  const now = Date.now()
  const createdAtMs = remote?.completedAt ? Date.parse(remote.completedAt) || now : now

  return {
    id: taskId,
    title: String(input.title || '').trim(),
    notes: String(input.notes ?? ''),
    listId: input.listId || 'inbox',
    priority: input.priority || 'P3',
    urgency: input.urgency || 'normal',
    size: input.size || 'medium',
    area: input.area || 'other',
    effortMin: input.effortMin ?? null,
    nextAction: input.nextAction ?? null,
    aiContext: input.aiContext ?? null,
    projectId: input.projectId ?? null,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    scheduledDate: input.scheduledDate ?? null,
    scheduledStart: input.scheduledStart ?? null,
    durationMinutes: input.durationMinutes ?? null,
    reminderMinutes: input.reminderMinutes ?? null,
    recurrence: input.recurrence ?? null,
    tags: Array.isArray(input.tags) ? [...input.tags] : [],
    subtasks: Array.isArray(input.subtasks) ? JSON.parse(JSON.stringify(input.subtasks)) : [],
    completed: false,
    completedAt: null,
    createdAt: createdAtMs,
    updatedAt: createdAtMs,
    deletedAt: null,
    sortOrder: createdAtMs,
    meta: {
      ...(input.meta || {}),
      kind: input.meta?.kind || 'standard',
      source: 'kenos_plan_create_task',
      kenosWriterCreate: true,
      legacyDirty: false,
      command: {
        schemaVersion: '1',
        actionRequestId: action?.id,
        actionType: 'plan.create_task',
        idempotencyKey: action?.idempotencyKey,
        correlationId: action?.correlationId,
        activityId: remote?.activityId ?? null,
        outboxId: remote?.outboxId ?? remote?.result?.outboxId ?? null,
        duplicate: Boolean(remote?.duplicate),
      },
    },
  }
}

/** @param {object | null | undefined} task */
export function shouldSkipLegacyCreateSync(task) {
  return Boolean(task?.meta?.kenosWriterCreate && task?.meta?.legacyDirty !== true)
}

/** @param {object[]} tasks */
export function filterTasksForLegacySync(tasks) {
  return (tasks || []).filter((task) => !shouldSkipLegacyCreateSync(task))
}

/**
 * Mark a Kenos-created task dirty so subsequent lifecycle edits use legacy upsert.
 * @param {object} task
 */
export function markKenosCreatedTaskLegacyDirty(task) {
  if (!task?.meta?.kenosWriterCreate) return task
  return {
    ...task,
    meta: {
      ...task.meta,
      legacyDirty: true,
    },
  }
}
