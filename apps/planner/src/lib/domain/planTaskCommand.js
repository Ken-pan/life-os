import { S, save, flushSave, uid } from '../state.svelte.js'
import { SYSTEM_LIST_INBOX, normalizeRecurrence } from '../types.js'

const ACTION_TYPE = 'plan.create_task'
const SUPPORTED_SOURCES = ['plan_ui', 'assistant']
const SENSITIVE_KEYS = ['token', 'secret', 'password', 'authorization', 'cookie', 'rawConversation', 'connectorPayload']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
let localActorId = null
let localDeviceId = null

function contractUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function localContractIdentity() {
  localActorId ||= contractUuid()
  localDeviceId ||= contractUuid()
  return { actorId: localActorId, deviceId: localDeviceId }
}

function ensureRuntimeLogs() {
  if (!Array.isArray(S.kenosActionOutbox)) S.kenosActionOutbox = []
  if (!Array.isArray(S.kenosActivity)) S.kenosActivity = []
}


function redactValue(value) {
  if (Array.isArray(value)) return value.map(redactValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))
        ? '[REDACTED]'
        : redactValue(nested),
    ]),
  )
}

function reject(reason, message, input) {
  const error = { code: reason, message, class: 'permanent', retryable: false }
  ensureRuntimeLogs()
  const now = new Date().toISOString()
  const identity = localContractIdentity()
  const correlationId = UUID_PATTERN.test(input.correlationId || '') ? input.correlationId : contractUuid()
  const actionRequestId = UUID_PATTERN.test(input.actionRequestId || '') ? input.actionRequestId : contractUuid()
  S.kenosActivity = [
    ...S.kenosActivity,
    {
      schemaVersion: '1',
      id: contractUuid(),
      eventType: 'plan.create_task_rejected',
      actionRequestId,
      correlationId,
      actor: { type: input.source === 'assistant' ? 'assistant' : 'user', id: identity.actorId },
      targetRefs: [],
      securityDomain: 'personal',
      policy: { requestId: actionRequestId, outcome: 'deny', evaluatedRisk: 'R1', policyVersion: 'kenos-phase1-v1', reasons: [reason], decidedAt: now },
      summary: message,
      reason,
      result: 'failed',
      redactedPayload: redactValue(input),
      occurredAt: now,
    },
  ]
  commitLocalCreateTaskProjection()
  return { ok: false, error }
}

/**
 * KR-P1-001 single writer for Plan task creation.
 * Planner UI and explicit user-requested Assistant actions enter here; Work/Connector/proactive payloads fail closed.
 * @param {Partial<import('../types.js').Task> & { source?: 'plan_ui'|'assistant'|string, idempotencyKey?: string, correlationId?: string, userRequested?: boolean, workSource?: unknown }} input
 * @returns {{ ok: true, task: import('../types.js').Task, outbox: object, activity: object, duplicate: boolean } | { ok: false, error: { code: string, message: string } }}
 */
export function executeCreateTaskCommand(input = {}) {
  ensureRuntimeLogs()
  if (!SUPPORTED_SOURCES.includes(input.source || 'plan_ui')) {
    return reject('source_not_allowed', 'Only direct Plan UI and explicit Assistant task creation are allowed in KR-P1-001.', input)
  }
  if (input.source === 'assistant' && input.userRequested !== true) {
    return reject('assistant_requires_explicit_user_request', 'Assistant task creation requires an explicit user request.', input)
  }
  if (input.workSource) {
    return reject('work_source_excluded', 'Work-sourced task payloads are excluded from KR-P1-001.', input)
  }
  const title = String(input.title || '').trim()
  if (!title) return reject('title_required', 'Task title is required.', input)

  if (input.correlationId && !UUID_PATTERN.test(input.correlationId)) {
    return reject('invalid_correlation_id', 'CreateTask correlationId must be a UUID.', input)
  }

  const idempotencyKey = String(input.idempotencyKey || input.correlationId || `${uid()}:${S.tasks.length}:${S.kenosActionOutbox.length}`)
  const existing = S.kenosActionOutbox.find((item) => item.topic === ACTION_TYPE && item.idempotencyKey === idempotencyKey)
  if (existing) {
    const task = S.tasks.find((item) => item.id === existing.aggregate?.id)
    if (task) {
      const activity = S.kenosActivity.find((item) => item.correlationId === existing.correlationId) || null
      const actionResult = activity ? {
        requestId: existing.actionRequestId,
        status: 'succeeded',
        result: { taskId: task.id, outboxId: existing.id, duplicate: true },
        affectedEntities: [existing.aggregate],
        activityId: activity.id,
        completedAt: activity.occurredAt,
      } : null
      return { ok: true, task, outbox: existing, activity, actionResult, duplicate: true }
    }
    return reject('idempotency_target_missing', 'Existing idempotency key no longer resolves to a task.', input)
  }

  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const maxOrder = S.tasks.reduce((m, task) => Math.max(m, task.sortOrder || 0), 0)
  const recurrence = normalizeRecurrence(input.recurrence)
  const correlationId = String(input.correlationId || contractUuid())
  const actionRequestId = UUID_PATTERN.test(input.actionRequestId || '') ? input.actionRequestId : contractUuid()
  const identity = localContractIdentity()
  const task = {
    id: contractUuid(),
    title,
    notes: input.notes || '',
    listId: input.listId || S.settings.defaultListId || SYSTEM_LIST_INBOX,
    priority: input.priority ?? 'P3',
    urgency: input.urgency ?? 'normal',
    size: input.size ?? 'medium',
    area: input.area ?? 'other',
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
    recurrence: recurrence ? { ...recurrence, seriesId: recurrence.seriesId || uid() } : null,
    tags: input.tags ? [...input.tags] : [],
    subtasks: input.subtasks ? JSON.parse(JSON.stringify(input.subtasks)) : [],
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    sortOrder: maxOrder + 1,
    meta: { kind: 'standard', ...(input.meta || {}), command: { schemaVersion: '1', actionRequestId, actionType: ACTION_TYPE, idempotencyKey, correlationId } },
  }
  const entityRef = { id: task.id, type: 'plan.task', ownerDomain: 'plan', ownerId: task.id, version: 1 }
  const outbox = {
    schemaVersion: '1',
    id: contractUuid(),
    topic: ACTION_TYPE,
    actionRequestId,
    status: 'pending',
    idempotencyKey,
    correlationId,
    aggregate: entityRef,
    payload: { title: task.title, dueDate: task.dueDate, listId: task.listId, projectId: task.projectId },
    attempts: 0,
    maxAttempts: 5,
    availableAt: nowIso,
    occurredAt: nowIso,
    updatedAt: nowIso,
  }
  const activity = {
    schemaVersion: '1',
    id: contractUuid(),
    eventType: 'plan.task_created',
    actionRequestId,
    correlationId,
    actor: { type: input.source === 'assistant' ? 'assistant' : 'user', id: identity.actorId },
    targetRefs: [entityRef],
    securityDomain: 'personal',
    policy: { requestId: actionRequestId, outcome: 'allow', evaluatedRisk: 'R1', policyVersion: 'kenos-phase1-v1', reasons: ['explicit create-task command'], decidedAt: nowIso },
    summary: `Created Plan task: ${task.title}`,
    reason: 'explicit create-task command',
    result: 'succeeded',
    redactedPayload: redactValue({ title: task.title, dueDate: task.dueDate, notes: task.notes ? '[REDACTED_NOTES]' : '' }),
    occurredAt: nowIso,
    undo: { supported: true, actionType: 'plan.delete_task' },
  }

  const before = { tasks: S.tasks, outbox: S.kenosActionOutbox, activity: S.kenosActivity }
  S.tasks = [...S.tasks, task]
  S.kenosActionOutbox = [...S.kenosActionOutbox, outbox]
  S.kenosActivity = [...S.kenosActivity, activity]
  const committed = commitLocalCreateTaskProjection()
  if (!committed.ok) {
    S.tasks = before.tasks
    S.kenosActionOutbox = before.outbox
    S.kenosActivity = before.activity
    return { ok: false, error: committed.error }
  }
  const actionResult = {
    requestId: actionRequestId,
    status: 'succeeded',
    result: { taskId: task.id, outboxId: outbox.id, duplicate: false },
    affectedEntities: [entityRef],
    activityId: activity.id,
    completedAt: nowIso,
  }
  return { ok: true, task, outbox, activity, actionResult, duplicate: false }
}

export function retryPendingCreateTaskOutbox() {
  ensureRuntimeLogs()
  const now = Date.now()
  S.kenosActionOutbox = S.kenosActionOutbox.map((item) =>
    item.topic === ACTION_TYPE && item.status === 'pending'
      ? { ...item, attempts: (item.attempts || 0) + 1, updatedAt: new Date(now).toISOString() }
      : item,
  )
  save()
  return S.kenosActionOutbox.filter((item) => item.topic === ACTION_TYPE)
}

function hasBrowserStorage() {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

function commitLocalCreateTaskProjection() {
  if (!hasBrowserStorage()) {
    save()
    return { ok: true }
  }
  const saved = flushSave()
  if (saved) return { ok: true }
  return {
    ok: false,
    error: {
      code: 'local_projection_commit_failed',
      message: 'Task, Outbox, and Activity were not durably saved; the in-memory mutation was rolled back.',
    },
  }
}
