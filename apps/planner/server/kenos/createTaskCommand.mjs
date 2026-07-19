const ACTION_TYPE = 'plan.create_task'
const MAX_ATTEMPTS = 5
const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 5 * 60 * 1000
const SENSITIVE_KEYS = ['token', 'secret', 'password', 'authorization', 'cookie', 'rawConversation', 'connectorPayload', 'notes']

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
}

function iso(now = Date.now()) {
  return new Date(now).toISOString()
}

function redactValue(value) {
  if (Array.isArray(value)) return value.map(redactValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase())) ? '[REDACTED]' : redactValue(nested),
  ]))
}

function permanent(code, message) {
  return { ok: false, error: { code, message, class: 'permanent' } }
}

function validateAction(action) {
  if (!action || typeof action !== 'object') return permanent('bad_request', 'Action request is required.')
  if (action.actionType !== ACTION_TYPE) return permanent('unsupported_action', 'Only plan.create_task is supported by this server command boundary.')
  if (action.targetDomain !== 'plan') return permanent('wrong_owner', 'Plan is the only canonical owner for Task creation.')
  if (!action.idempotencyKey) return permanent('idempotency_key_required', 'CreateTaskAction requires an idempotency key.')
  if (!action.correlationId) return permanent('correlation_id_required', 'CreateTaskAction requires a correlation id.')
  if (action.producer === 'work' || action.payload?.workSource) return permanent('work_source_excluded', 'Work-sourced task creation is excluded from Phase 1.')
  if (action.producer === 'assistant' && action.actor?.type !== 'assistant') return permanent('assistant_actor_required', 'Assistant producer must use assistant actor metadata.')
  if (action.risk !== 'R1') return permanent('risk_not_allowed', 'Only explicit R1 create-task actions are executable in KR-P1-001A.')
  if (action.approval?.state !== 'not_required') return permanent('approval_state_not_allowed', 'KR-P1-001A executes only R1 actions with no explicit approval requirement.')
  const title = String(action.payload?.title || '').trim()
  if (!title) return permanent('title_required', 'Task title is required.')
  return { ok: true, title }
}

export function createMemoryCreateTaskDatabase() {
  const state = {
    tasks: [],
    idempotency: new Map(),
    outbox: [],
    activity: [],
  }
  return {
    state,
    transaction(callback) {
      const draft = {
        tasks: [...state.tasks],
        idempotency: new Map(state.idempotency),
        outbox: [...state.outbox],
        activity: [...state.activity],
      }
      const result = callback(draft)
      state.tasks = draft.tasks
      state.idempotency = draft.idempotency
      state.outbox = draft.outbox
      state.activity = draft.activity
      return result
    },
  }
}

export function executeServerCreateTaskAction(db, action, options = {}) {
  const validation = validateAction(action)
  if (!validation.ok) return validation

  return db.transaction((tx) => {
    const existingTaskId = tx.idempotency.get(action.idempotencyKey)
    if (existingTaskId) {
      const task = tx.tasks.find((item) => item.id === existingTaskId)
      const outbox = tx.outbox.find((item) => item.idempotencyKey === action.idempotencyKey)
      const activity = tx.activity.find((item) => item.correlationId === action.correlationId)
      if (!task || !outbox || !activity) return permanent('idempotency_record_corrupt', 'Durable idempotency record no longer resolves atomically.')
      return { ok: true, task, outbox, activity, duplicate: true }
    }

    if (options.injectFailure === 'afterTaskBeforeOutbox') {
      throw new Error('injected transaction failure after task insert')
    }

    const now = options.now || Date.now()
    const task = {
      id: id('task'),
      userId: action.actor?.userId || 'local-user',
      title: validation.title,
      notes: action.payload?.notes || '',
      completed: false,
      createdAt: iso(now),
      updatedAt: iso(now),
    }
    const entityRef = {
      domain: 'plan',
      type: 'task',
      id: task.id,
      ownerDomain: 'plan',
      version: 1,
      securityDomain: action.securityDomain || 'personal',
      classification: action.classification || 'personal',
    }
    const outbox = {
      schemaVersion: 1,
      id: id('outbox'),
      actionId: action.actionId,
      actionType: ACTION_TYPE,
      idempotencyKey: action.idempotencyKey,
      correlationId: action.correlationId,
      entityRef,
      status: 'pending',
      payload: { taskId: task.id, title: task.title },
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      nextAttemptAt: iso(now),
      createdAt: iso(now),
      updatedAt: iso(now),
    }
    const activity = {
      schemaVersion: 1,
      id: id('activity'),
      actionId: action.actionId,
      actionType: ACTION_TYPE,
      correlationId: action.correlationId,
      actorType: action.actor?.type || 'user',
      source: action.producer,
      policy: { allowed: true, risk: 'R1', approvalState: 'not_required', reason: 'explicit create-task command', decidedAt: iso(now) },
      entityRef,
      summary: `Created Plan task: ${task.title}`,
      redactedPayload: redactValue(action.payload || {}),
      undo: { supported: true, actionType: 'plan.delete_task' },
      createdAt: iso(now),
    }

    tx.tasks.push(task)
    tx.idempotency.set(action.idempotencyKey, task.id)
    tx.outbox.push(outbox)
    tx.activity.push(activity)
    return { ok: true, task, outbox, activity, duplicate: false }
  })
}

export function classifyDeliveryError(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  if (['validation_failed', 'permission_denied', 'not_found', 'schema_mismatch'].includes(code)) return 'permanent'
  return 'transient'
}

export function nextBackoffMs(attempts, jitterSeed = 0) {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1))
  const jitter = Math.floor(exp * 0.2 * Math.abs(Math.sin(jitterSeed || attempts)))
  return exp + jitter
}

export function applyOutboxDeliveryFailure(record, error, now = Date.now()) {
  const errorClass = classifyDeliveryError(error)
  const attempts = (record.attempts || 0) + 1
  if (errorClass === 'permanent' || attempts >= (record.maxAttempts || MAX_ATTEMPTS)) {
    return {
      ...record,
      status: 'terminal',
      attempts,
      lastErrorClass: errorClass,
      terminalReason: error?.message || error?.code || 'delivery failed',
      updatedAt: iso(now),
    }
  }
  return {
    ...record,
    status: 'retry',
    attempts,
    lastErrorClass: errorClass,
    nextAttemptAt: iso(now + nextBackoffMs(attempts, now)),
    updatedAt: iso(now),
  }
}

export function markOutboxProcessing(record, now = Date.now()) {
  return { ...record, status: 'processing', updatedAt: iso(now) }
}

export function markOutboxDelivered(record, now = Date.now()) {
  return { ...record, status: 'delivered', updatedAt: iso(now) }
}
