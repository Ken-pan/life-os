import { randomUUID } from 'node:crypto'

const ACTION_TYPE = 'plan.create_task'
const MAX_ATTEMPTS = 5
const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 5 * 60 * 1000
const SENSITIVE_KEYS = ['token', 'secret', 'password', 'authorization', 'cookie', 'rawConversation', 'connectorPayload', 'notes']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/
const RISK_VALUES = ['R0', 'R1', 'R2', 'R3', 'R4']

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
  return { ok: false, error: { code, message, class: 'permanent', retryable: false } }
}

function actionResult(action, task, outbox, activity, duplicate, now) {
  return {
    requestId: action.id,
    status: 'succeeded',
    result: { taskId: task.id, outboxId: outbox.id, duplicate },
    affectedEntities: [outbox.aggregate],
    activityId: activity.id,
    completedAt: iso(now),
  }
}

function validateAction(action, { authUserId, now = Date.now() } = {}) {
  if (!action || typeof action !== 'object') return permanent('bad_request', 'Action request is required.')
  if (action.schemaVersion !== '1') return permanent('schema_version_not_supported', 'Only Kenos Action schema version 1 is supported.')
  if (!action.id) return permanent('action_id_required', 'CreateTaskAction requires an action request id.')
  if (action.actionType !== ACTION_TYPE) return permanent('unsupported_action', 'Only plan.create_task is supported by this server command boundary.')
  if (action.targetDomain !== 'plan') return permanent('wrong_owner', 'Plan is the only canonical owner for Task creation.')
  if (!action.deviceId) return permanent('device_id_required', 'CreateTaskAction requires a device id.')
  if (!action.idempotencyKey) return permanent('idempotency_key_required', 'CreateTaskAction requires an idempotency key.')
  if (!action.correlationId) return permanent('correlation_id_required', 'CreateTaskAction requires a correlation id.')
  if (![action.id, action.actor?.id, action.deviceId, action.correlationId].every((value) => UUID_PATTERN.test(value || ''))) {
    return permanent('invalid_action_contract', 'Action, actor, device, and correlation identifiers must be UUIDs.')
  }
  if (!action.requestedAt || !ISO_TIMESTAMP_PATTERN.test(action.requestedAt) || !Number.isFinite(Date.parse(action.requestedAt))) return permanent('invalid_action_contract', 'CreateTaskAction requires a valid ISO-8601 UTC requestedAt timestamp.')
  if (action.producer === 'work' || action.payload?.workSource) return permanent('work_source_excluded', 'Work-sourced task creation is excluded from Phase 1.')
  if (!['assistant', 'plan'].includes(action.producer)) return permanent('producer_not_allowed', 'KR-P1-001A accepts only Assistant or Plan producers.')
  if (action.producer === 'assistant' && action.actor?.type !== 'assistant') return permanent('assistant_actor_required', 'Assistant producer must use assistant actor metadata.')
  if (action.producer === 'plan' && action.actor?.type !== 'user') return permanent('plan_actor_required', 'Plan producer must use user actor metadata.')
  if (!action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) return permanent('invalid_action_contract', 'Action payload must be an object.')
  if (authUserId && action.actor?.id && action.actor.id !== authUserId) return permanent('actor_user_mismatch', 'Action actor must match the authenticated user.')
  if (action.securityDomain !== 'personal' || action.dataClassification !== 'personal') return permanent('security_domain_not_allowed', 'KR-P1-001A accepts personal Plan actions only.')
  if (!RISK_VALUES.includes(action.requestedRisk)) return permanent('invalid_action_contract', 'CreateTaskAction requestedRisk is not a Kenos v1 risk value.')
  if (action.requestedRisk !== 'R1') return permanent('risk_not_allowed', 'Only explicit R1 create-task actions are executable in KR-P1-001A.')
  if (action.expectedVersion != null) return permanent('version_conflict', 'Create-task actions must not carry an existing entity version.')
  if (action.expiresAt && (!ISO_TIMESTAMP_PATTERN.test(action.expiresAt) || !Number.isFinite(Date.parse(action.expiresAt)) || Date.parse(action.expiresAt) <= Date.parse(action.requestedAt))) {
    return permanent('invalid_action_contract', 'Action expiry must be a valid timestamp after requestedAt.')
  }
  if (action.expiresAt && Date.parse(action.expiresAt) <= now) return permanent('action_expired', 'Action request has expired.')
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
  const now = options.now || Date.now()
  const validation = validateAction(action, { authUserId: options.authUserId, now })
  if (!validation.ok) return validation

  return db.transaction((tx) => {
    const existingAction = tx.outbox.find((item) => item.actionRequestId === action.id)
    if (existingAction && existingAction.idempotencyKey !== action.idempotencyKey) {
      return permanent('action_id_reused', 'Action request id is already bound to a different idempotency key.')
    }
    const existingTaskId = tx.idempotency.get(action.idempotencyKey)
    if (existingTaskId) {
      const task = tx.tasks.find((item) => item.id === existingTaskId)
      const outbox = tx.outbox.find((item) => item.idempotencyKey === action.idempotencyKey)
      const activity = tx.activity.find((item) => item.correlationId === outbox?.correlationId)
      if (!task || !outbox || !activity) return permanent('idempotency_record_corrupt', 'Durable idempotency record no longer resolves atomically.')
      return { ok: true, task, outbox, activity, actionResult: actionResult(action, task, outbox, activity, true, now), duplicate: true }
    }

    const task = {
      id: randomUUID(),
      userId: action.actor?.id || 'local-user',
      title: validation.title,
      notes: action.payload?.notes || '',
      completed: false,
      createdAt: iso(now),
      updatedAt: iso(now),
    }
    const entityRef = {
      id: task.id,
      type: 'plan.task',
      ownerDomain: 'plan',
      ownerId: task.id,
      version: 1,
    }
    const outbox = {
      schemaVersion: '1',
      id: randomUUID(),
      topic: ACTION_TYPE,
      actionRequestId: action.id,
      idempotencyKey: action.idempotencyKey,
      correlationId: action.correlationId,
      aggregate: entityRef,
      status: 'pending',
      payload: { taskId: task.id, title: task.title },
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      availableAt: iso(now),
      occurredAt: iso(now),
      updatedAt: iso(now),
    }
    const activity = {
      schemaVersion: '1',
      id: randomUUID(),
      eventType: 'plan.task_created',
      actionRequestId: action.id,
      correlationId: action.correlationId,
      actor: action.actor,
      targetRefs: [entityRef],
      securityDomain: action.securityDomain,
      summary: `Created Plan task: ${task.title}`,
      reason: action.reason || 'explicit create-task command',
      result: 'succeeded',
      policy: {
        requestId: action.id,
        outcome: 'allow',
        evaluatedRisk: 'R1',
        policyVersion: 'kenos-phase1-2026-07-19',
        reasons: ['explicit create-task command'],
        decidedAt: iso(now),
      },
      redactedPayload: redactValue(action.payload || {}),
      undo: { supported: true, actionType: 'plan.delete_task' },
      occurredAt: iso(now),
    }

    tx.tasks.push(task)
    if (options.injectFailure === 'afterTaskBeforeOutbox') {
      throw new Error('injected transaction failure after task insert')
    }
    tx.idempotency.set(action.idempotencyKey, task.id)
    tx.outbox.push(outbox)
    tx.activity.push(activity)
    return { ok: true, task, outbox, activity, actionResult: actionResult(action, task, outbox, activity, false, now), duplicate: false }
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
  return Math.min(MAX_BACKOFF_MS, exp + jitter)
}

export function applyOutboxDeliveryFailure(record, error, now = Date.now()) {
  const errorClass = classifyDeliveryError(error)
  const attempts = (record.attempts || 0) + 1
  if (errorClass === 'permanent' || attempts >= (record.maxAttempts || MAX_ATTEMPTS)) {
    return {
      ...record,
      attempts,
      lastErrorClass: errorClass,
      status: 'dead_letter',
      failureReason: error?.message || error?.code || 'delivery failed',
      updatedAt: iso(now),
    }
  }
  return {
    ...record,
    status: 'retry',
    attempts,
    lastErrorClass: errorClass,
    availableAt: iso(now + nextBackoffMs(attempts, now)),
    updatedAt: iso(now),
  }
}

export function markOutboxProcessing(record, now = Date.now()) {
  return { ...record, status: 'processing', updatedAt: iso(now) }
}

export function markOutboxPublished(record, now = Date.now()) {
  return { ...record, status: 'published', updatedAt: iso(now) }
}
