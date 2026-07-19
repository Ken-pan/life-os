import { S, save, flushSave, uid } from '../state.svelte.js'
import { SYSTEM_LIST_INBOX, normalizeRecurrence } from '../types.js'

const ACTION_TYPE = 'plan.create_task'
const SUPPORTED_SOURCES = ['plan_ui', 'assistant']
const SENSITIVE_KEYS = ['token', 'secret', 'password', 'authorization', 'cookie', 'rawConversation', 'connectorPayload']

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
  const error = { code: reason, message }
  ensureRuntimeLogs()
  S.kenosActivity = [
    ...S.kenosActivity,
    {
      id: uid(),
      type: 'activity.action_rejected',
      actionType: ACTION_TYPE,
      correlationId: input.correlationId || uid(),
      actor: input.source === 'assistant' ? 'assistant' : 'user',
      source: input.source || 'unknown',
      policy: { risk: 'R1', decision: 'rejected', reason },
      summary: message,
      redactedPayload: redactValue(input),
      createdAt: Date.now(),
      error,
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

  const idempotencyKey = String(input.idempotencyKey || input.correlationId || `${uid()}:${S.tasks.length}:${S.kenosActionOutbox.length}`)
  const existing = S.kenosActionOutbox.find((item) => item.actionType === ACTION_TYPE && item.idempotencyKey === idempotencyKey)
  if (existing) {
    const task = S.tasks.find((item) => item.id === existing.entityRef?.id)
    if (task) {
      return { ok: true, task, outbox: existing, activity: S.kenosActivity.find((item) => item.correlationId === existing.correlationId) || null, duplicate: true }
    }
    return reject('idempotency_target_missing', 'Existing idempotency key no longer resolves to a task.', input)
  }

  const now = Date.now()
  const maxOrder = S.tasks.reduce((m, task) => Math.max(m, task.sortOrder || 0), 0)
  const recurrence = normalizeRecurrence(input.recurrence)
  const correlationId = String(input.correlationId || uid())
  const task = {
    id: uid(),
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
    meta: { kind: 'standard', ...(input.meta || {}), command: { actionType: ACTION_TYPE, idempotencyKey, correlationId } },
  }
  const entityRef = { domain: 'plan', type: 'task', id: task.id }
  const outbox = {
    id: uid(),
    status: 'pending',
    actionType: ACTION_TYPE,
    idempotencyKey,
    correlationId,
    entityRef,
    payload: { title: task.title, dueDate: task.dueDate, listId: task.listId, projectId: task.projectId },
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  }
  const activity = {
    id: uid(),
    type: 'activity.action_completed',
    actionType: ACTION_TYPE,
    correlationId,
    actor: input.source === 'assistant' ? 'assistant' : 'user',
    source: input.source || 'plan_ui',
    policy: { risk: 'R1', decision: 'allowed', approval: 'not_required' },
    entityRef,
    summary: `Created Plan task: ${task.title}`,
    redactedPayload: redactValue({ title: task.title, dueDate: task.dueDate, notes: task.notes ? '[REDACTED_NOTES]' : '' }),
    createdAt: now,
    undo: { supported: true, action: 'delete_task', taskId: task.id },
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
  return { ok: true, task, outbox, activity, duplicate: false }
}

export function retryPendingCreateTaskOutbox() {
  ensureRuntimeLogs()
  const now = Date.now()
  S.kenosActionOutbox = S.kenosActionOutbox.map((item) =>
    item.actionType === ACTION_TYPE && item.status === 'pending'
      ? { ...item, attempts: (item.attempts || 0) + 1, updatedAt: now }
      : item,
  )
  save()
  return S.kenosActionOutbox.filter((item) => item.actionType === ACTION_TYPE)
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
