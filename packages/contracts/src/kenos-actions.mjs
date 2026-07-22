// Kenos Action Registry — code-level, version-controlled source of truth for
// every action the Kenos layer can execute. Every executor (assistant tools,
// Kenos writers, outbox worker) must resolve actions here before executing.
//
// Risk levels:
//   R0 = read / navigation
//   R1 = private reversible write        → auto-execute + activity + undo path
//   R2 = externally visible / broad      → show normalized diff, batch confirm
//   R3 = destructive / financial / auth  → per-item, parameter-bound, short-TTL approval
//
// The model may never lower a risk level: effective risk is the max of the
// registry's declared risk and any requested risk (see resolveEffectiveRisk).

export const RISK_LEVELS = Object.freeze(['R0', 'R1', 'R2', 'R3'])

export const RETRY_SCHEDULE_MS = Object.freeze([
  30_000,        // 30s
  120_000,       // 2m
  600_000,       // 10m
  3_600_000,     // 1h
  21_600_000,    // 6h
])

export const OUTBOX_MAX_ATTEMPTS = 5
export const OUTBOX_BATCH_SIZE = 10
export const OUTBOX_POLL_INTERVAL_MS = 20_000
export const OUTBOX_LEASE_SECONDS = 300

/**
 * Quarantine epoch: outbox rows created before this instant are historical
 * (pre-worker) and are never claimed by the worker. They were classified in
 * docs/productivity/OUTBOX_SEMANTICS.md — business state already committed,
 * delivery consumer did not exist yet.
 */
export const OUTBOX_WORKER_EPOCH = '2026-07-22T17:00:00Z'

const APPROVAL = Object.freeze({
  AUTO: 'auto',                       // R0/R1
  CONFIRM_DIFF: 'confirm_diff',       // R2: normalized diff + batch confirm
  PER_ITEM_APPROVAL: 'per_item_approval', // R3: parameter-bound, short-TTL
})

function action(def) {
  const required = [
    'actionType', 'canonicalOwner', 'executor', 'riskLevel', 'reversible',
    'idempotencyStrategy', 'approvalPolicy', 'activityType',
    'outboxRequirement', 'timeoutMs', 'retryPolicy',
  ]
  for (const key of required) {
    if (def[key] === undefined) throw new Error(`action ${def.actionType || '?'} missing ${key}`)
  }
  return Object.freeze(def)
}

const rpc = (name) => `rpc:${name}`

const PLAN_TASK_DEFAULTS = {
  canonicalOwner: 'planner_tasks',
  riskLevel: 'R1',
  reversible: true,
  idempotencyStrategy: 'unique(user_id, action_type, idempotency_key) + action_id reuse guard',
  approvalPolicy: APPROVAL.AUTO,
  outboxRequirement: 'required',
  timeoutMs: 15_000,
  retryPolicy: 'outbox-backoff-30s-2m-10m-1h-6h',
}

export const ACTION_REGISTRY = Object.freeze({
  // ---- plan.* — canonical task commands (existing production RPCs) --------
  'plan.create_task': action({ ...PLAN_TASK_DEFAULTS, actionType: 'plan.create_task', executor: rpc('kenos_create_plan_task_action'), activityType: 'plan.create_task', undoActionType: 'plan.archive_task' }),
  'plan.update_task_title': action({ ...PLAN_TASK_DEFAULTS, actionType: 'plan.update_task_title', executor: rpc('kenos_update_plan_task_title_action'), activityType: 'plan.update_task_title' }),
  'plan.update_task_due_date': action({ ...PLAN_TASK_DEFAULTS, actionType: 'plan.update_task_due_date', executor: rpc('kenos_update_plan_task_due_date_action'), activityType: 'plan.update_task_due_date' }),
  'plan.update_task_schedule': action({ ...PLAN_TASK_DEFAULTS, actionType: 'plan.update_task_schedule', executor: rpc('kenos_update_plan_task_schedule_action'), activityType: 'plan.update_task_schedule' }),
  'plan.update_task_project': action({ ...PLAN_TASK_DEFAULTS, actionType: 'plan.update_task_project', executor: rpc('kenos_update_plan_task_project_action'), activityType: 'plan.update_task_project' }),
  'plan.complete_task': action({ ...PLAN_TASK_DEFAULTS, actionType: 'plan.complete_task', executor: rpc('kenos_complete_plan_task_action'), activityType: 'plan.complete_task', undoActionType: 'plan.reopen_task' }),
  'plan.reopen_task': action({ ...PLAN_TASK_DEFAULTS, actionType: 'plan.reopen_task', executor: rpc('kenos_reopen_plan_task_action'), activityType: 'plan.reopen_task', undoActionType: 'plan.complete_task' }),
  'plan.archive_task': action({ ...PLAN_TASK_DEFAULTS, actionType: 'plan.archive_task', executor: rpc('kenos_archive_plan_task_action'), activityType: 'plan.archive_task' }),

  // ---- project.* — Project Spine commands (planner_projects stays owner) --
  'project.set_context': action({ ...PLAN_TASK_DEFAULTS, canonicalOwner: 'kenos_project_context', actionType: 'project.set_context', executor: rpc('kenos_project_spine_action'), activityType: 'project.set_context' }),
  'project.set_next_action': action({ ...PLAN_TASK_DEFAULTS, canonicalOwner: 'kenos_project_context', actionType: 'project.set_next_action', executor: rpc('kenos_project_spine_action'), activityType: 'project.set_next_action' }),
  'project.link_object': action({ ...PLAN_TASK_DEFAULTS, canonicalOwner: 'kenos_project_links', actionType: 'project.link_object', executor: rpc('kenos_project_spine_action'), activityType: 'project.link_object' }),
  'project.unlink_object': action({ ...PLAN_TASK_DEFAULTS, canonicalOwner: 'kenos_project_links', actionType: 'project.unlink_object', executor: rpc('kenos_project_spine_action'), activityType: 'project.unlink_object' }),

  // ---- capture.* ----------------------------------------------------------
  'capture.ingest_envelope': action({ ...PLAN_TASK_DEFAULTS, canonicalOwner: 'kenos_capture_envelopes', actionType: 'capture.ingest_envelope', executor: rpc('kenos_ingest_capture_envelope_action'), activityType: 'capture.ingest_envelope' }),
  'capture.convert_to_plan_task': action({ ...PLAN_TASK_DEFAULTS, canonicalOwner: 'kenos_capture_envelopes', actionType: 'capture.convert_to_plan_task', executor: rpc('kenos_convert_capture_to_plan_task_action'), activityType: 'capture.convert_to_plan_task' }),

  // ---- approval.* ---------------------------------------------------------
  'approval.request': action({
    actionType: 'approval.request', canonicalOwner: 'kenos_action_approvals',
    executor: rpc('kenos_request_action_approval_action'), riskLevel: 'R1', reversible: true,
    idempotencyStrategy: 'unique(user_id, action_type, idempotency_key)',
    approvalPolicy: APPROVAL.AUTO, activityType: 'approval.request',
    outboxRequirement: 'none', timeoutMs: 15_000, retryPolicy: 'none',
  }),
  'approval.decide': action({
    actionType: 'approval.decide', canonicalOwner: 'kenos_action_approvals',
    executor: rpc('kenos_decide_action_approval_action'), riskLevel: 'R1', reversible: false,
    idempotencyStrategy: 'unique(user_id, action_type, idempotency_key) + CAS pending→decided',
    approvalPolicy: APPROVAL.AUTO, activityType: 'approval.decide',
    outboxRequirement: 'required', timeoutMs: 15_000, retryPolicy: 'outbox-backoff-30s-2m-10m-1h-6h',
  }),

  // ---- focus.* (device-local sessions + cloud context) --------------------
  'focus.start_context': action({ ...PLAN_TASK_DEFAULTS, canonicalOwner: 'kenos_focus_contexts', actionType: 'focus.start_context', executor: rpc('kenos_start_focus_context_action'), activityType: 'focus.start_context' }),
  'focus.end_context': action({ ...PLAN_TASK_DEFAULTS, canonicalOwner: 'kenos_focus_contexts', actionType: 'focus.end_context', executor: rpc('kenos_end_focus_context_action'), activityType: 'focus.end_context' }),

  // ---- outbox ops ---------------------------------------------------------
  'outbox.dead_letter': action({
    actionType: 'outbox.dead_letter', canonicalOwner: 'kenos_plan_outbox',
    executor: rpc('kenos_dead_letter_plan_outbox_action'), riskLevel: 'R2', reversible: true,
    idempotencyStrategy: 'CAS on outbox status', approvalPolicy: APPROVAL.CONFIRM_DIFF,
    activityType: 'outbox.dead_letter', outboxRequirement: 'none', timeoutMs: 15_000, retryPolicy: 'none',
  }),

  // ---- assistant-local writes --------------------------------------------
  'assistant.save_memory': action({
    actionType: 'assistant.save_memory', canonicalOwner: 'aios.memories',
    executor: 'local:memoryStore', riskLevel: 'R1', reversible: true,
    idempotencyStrategy: 'semantic-dedupe-0.92', approvalPolicy: APPROVAL.AUTO,
    activityType: 'assistant.save_memory', outboxRequirement: 'none', timeoutMs: 10_000, retryPolicy: 'none',
  }),

  // ---- work.* — frozen; registered so nothing routes around the boundary --
  'work.create_project': action({
    actionType: 'work.create_project', canonicalOwner: 'FROZEN(no second project source of truth — use planner_projects)',
    executor: rpc('kenos_create_work_project_action'), riskLevel: 'R3', reversible: true,
    idempotencyStrategy: 'unique(user_id, action_type, idempotency_key)',
    approvalPolicy: APPROVAL.PER_ITEM_APPROVAL, activityType: 'work.create_project',
    outboxRequirement: 'required', timeoutMs: 15_000, retryPolicy: 'none', frozen: true,
  }),
  'work.archive_project': action({
    actionType: 'work.archive_project', canonicalOwner: 'FROZEN(no second project source of truth — use planner_projects)',
    executor: rpc('kenos_archive_work_project_action'), riskLevel: 'R3', reversible: false,
    idempotencyStrategy: 'unique(user_id, action_type, idempotency_key)',
    approvalPolicy: APPROVAL.PER_ITEM_APPROVAL, activityType: 'work.archive_project',
    outboxRequirement: 'required', timeoutMs: 15_000, retryPolicy: 'none', frozen: true,
  }),
})

/**
 * Canary set: the ONLY action types the outbox worker may claim and deliver.
 * Every entry has been verified replay-safe: the producing RPC commits the
 * business state in the same transaction, so delivery is a pure idempotent
 * projection onto life_events (deduped by outbox_id).
 */
export const CANARY_ACTION_TYPES = Object.freeze([
  'plan.create_task', 'plan.update_task_title', 'plan.update_task_due_date',
  'plan.update_task_schedule', 'plan.update_task_project', 'plan.complete_task',
  'plan.reopen_task', 'plan.archive_task',
  'project.set_context', 'project.set_next_action', 'project.link_object', 'project.unlink_object',
  'capture.ingest_envelope', 'capture.convert_to_plan_task',
  'approval.decide',
])

/** Outbox action_type → life_events type projected by the worker. */
export const LIFE_EVENT_TYPE_BY_ACTION = Object.freeze({
  'plan.create_task': 'plan.task_created',
  'plan.complete_task': 'plan.task_completed',
  'plan.reopen_task': 'plan.task_reopened',
  'plan.archive_task': 'plan.task_archived',
  'plan.update_task_title': 'plan.task_updated',
  'plan.update_task_due_date': 'plan.task_updated',
  'plan.update_task_schedule': 'plan.task_updated',
  'plan.update_task_project': 'plan.task_updated',
  'project.set_context': 'project.context_updated',
  'project.set_next_action': 'project.next_action_set',
  'project.link_object': 'project.link_added',
  'project.unlink_object': 'project.link_removed',
  'capture.ingest_envelope': 'capture.envelope_ingested',
  'capture.convert_to_plan_task': 'capture.converted_to_task',
  'approval.decide': 'approval.decided',
})

export function getAction(actionType) {
  return ACTION_REGISTRY[actionType] || null
}

/**
 * The model / caller may request a risk level, but can only raise it.
 * Unknown actions resolve to null (caller must fail closed).
 */
export function resolveEffectiveRisk(actionType, requestedRisk = null) {
  const def = getAction(actionType)
  if (!def) return null
  const declared = RISK_LEVELS.indexOf(def.riskLevel)
  const requested = RISK_LEVELS.indexOf(requestedRisk)
  return RISK_LEVELS[Math.max(declared, requested)]
}

/**
 * Policy decision for one action instance. Fail-closed: unknown action or
 * frozen action → deny.
 * @returns {{ mode: 'auto'|'confirm_diff'|'approval_required'|'deny', risk: string|null, reason: string }}
 */
export function policyDecision(actionType, { requestedRisk = null } = {}) {
  const def = getAction(actionType)
  if (!def) return { mode: 'deny', risk: null, reason: 'unknown_action_type' }
  if (def.frozen) return { mode: 'deny', risk: def.riskLevel, reason: 'action_frozen' }
  const risk = resolveEffectiveRisk(actionType, requestedRisk)
  if (risk === 'R0' || risk === 'R1') return { mode: 'auto', risk, reason: `${risk} auto with activity` }
  if (risk === 'R2') return { mode: 'confirm_diff', risk, reason: 'R2 requires normalized diff confirmation' }
  return { mode: 'approval_required', risk, reason: 'R3 requires parameter-bound short-TTL approval' }
}

/**
 * Canonical JSON for parameter binding: recursively sorted object keys,
 * stable across producers. Hash this (sha256 hex) into
 * kenos_action_approvals.normalized_parameters_hash; executors recompute and
 * refuse on mismatch, so changed parameters invalidate old approvals.
 */
export function canonicalParametersJson(params) {
  return JSON.stringify(sortValue(params ?? null))
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key])
    return out
  }
  return value
}

/** Backoff delay (ms) for a given attempt count (1-based). Clamps to last step. */
export function retryDelayMs(attempts) {
  const idx = Math.min(Math.max(attempts, 1), RETRY_SCHEDULE_MS.length) - 1
  return RETRY_SCHEDULE_MS[idx]
}
