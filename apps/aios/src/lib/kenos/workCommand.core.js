/**
 * Kenos Phase 3 Work command/read boundary (local / disposable simulation).
 * Work owns Project/Deliverable/Meeting/Decision/ActionProposal.
 * Plan remains sole Task owner. Feature-flagged conversion defaults Off.
 * Contract Zod live under packages/contracts; this module mirrors fail-closed checks
 * without a runtime @life-os/contracts value import (boundary guard).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SENSITIVE = /\b(token|secret|password|authorization|cookie|bearer)\b/i
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/

export const WORK_FEATURE_FLAG = 'kenosPhase3Work'
export const WORK_CONVERSION_FLAG = 'kenosPhase3WorkTaskConversion'

export const KenosWorkActionProposalTransitions = Object.freeze({
  draft: ['proposed', 'cancelled'],
  proposed: ['accepted', 'rejected', 'expired', 'cancelled', 'converted'],
  accepted: ['converted', 'cancelled', 'expired'],
  rejected: [],
  expired: [],
  converted: [],
  cancelled: [],
})

export function isWorkFoundationEnabled(env = typeof import.meta !== 'undefined' ? import.meta.env : {}) {
  return env?.VITE_KENOS_PHASE3_WORK === '1'
}

export function isWorkTaskConversionEnabled(env = typeof import.meta !== 'undefined' ? import.meta.env : {}) {
  return env?.VITE_KENOS_PHASE3_WORK_TASK_CONVERSION === '1'
}

function nowIso() {
  return new Date().toISOString()
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0').slice(-12)
}

function fail(code, message, extras = {}) {
  return { ok: false, error: { code, message, class: 'permanent', retryable: false, ...extras } }
}

function isIso(value) {
  return typeof value === 'string' && ISO_RE.test(value) && Number.isFinite(Date.parse(value))
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

function entityRefOk(ref, { type, ownerDomain } = {}) {
  if (!ref || !isUuid(ref.id) || !isUuid(ref.ownerId) || typeof ref.type !== 'string' || !ref.ownerDomain) return false
  if (type && ref.type !== type) return false
  if (ownerDomain && ref.ownerDomain !== ownerDomain) return false
  return true
}

function redact(value) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redact)
  const out = {}
  for (const [key, nested] of Object.entries(value)) {
    if (/(token|secret|password|authorization|cookie|raw|transcript|body)/i.test(key)) out[key] = '[REDACTED]'
    else out[key] = redact(nested)
  }
  return out
}

function fingerprint(value) {
  const raw = JSON.stringify(redact(value))
  let hash = 2166136261
  for (const char of raw) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function validateProject(record) {
  if (record.version !== '1') return fail('work_version_not_supported', 'Unsupported Work version')
  if (!isUuid(record.id) || !isUuid(record.ownerId)) return fail('work_malformed_uuid', 'Malformed UUID')
  if (!record.title || !record.safeSummary) return fail('work_validation_failed', 'title and safeSummary required')
  if (SENSITIVE.test(record.safeSummary) || SENSITIVE.test(record.title)) return fail('work_sensitive_payload', 'Sensitive markers are not allowed')
  if (!['active', 'blocked', 'completed', 'archived'].includes(record.status)) return fail('work_invalid_status', 'Invalid project status')
  if (!['low', 'normal', 'high', 'urgent'].includes(record.priority)) return fail('work_invalid_status', 'Invalid priority')
  if (!isIso(record.createdAt) || !isIso(record.updatedAt)) return fail('work_invalid_timestamp', 'Invalid timestamp')
  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) return fail('work_invalid_timestamp', 'updatedAt before createdAt')
  if (record.status === 'completed' && !record.completedAt) return fail('work_validation_failed', 'completed requires completedAt')
  if (record.status !== 'completed' && record.completedAt) return fail('work_validation_failed', 'completedAt only for completed')
  for (const projection of record.planTaskRefs || []) {
    if (!entityRefOk(projection.taskRef, { type: 'plan.task', ownerDomain: 'plan' })) {
      return fail('work_plan_ref_invalid', 'planTaskRefs must reference plan.task')
    }
  }
  for (const projection of record.libraryRefs || []) {
    if (!entityRefOk(projection.libraryRef, { ownerDomain: 'library' }) || !String(projection.libraryRef.type).startsWith('library.')) {
      return fail('work_library_ref_invalid', 'libraryRefs must be library-owned')
    }
    if ('documentBody' in projection || 'body' in projection) return fail('library_body_not_allowed', 'Library body copy forbidden')
  }
  return { ok: true, value: record }
}

function validateDeliverable(record) {
  if (record.version !== '1') return fail('work_version_not_supported', 'Unsupported Work version')
  if (!entityRefOk(record.projectRef, { type: 'work.project', ownerDomain: 'work' })) return fail('work_validation_failed', 'invalid projectRef')
  if (record.projectRef.ownerId !== record.ownerId) return fail('work_owner_mismatch', 'Owner mismatch')
  if (!['planned', 'in_progress', 'blocked', 'accepted', 'cancelled'].includes(record.status)) return fail('work_invalid_status', 'Invalid deliverable status')
  if (SENSITIVE.test(record.safeSummary || '')) return fail('work_sensitive_payload', 'Sensitive markers are not allowed')
  if (record.status === 'accepted' && !record.acceptedAt) return fail('work_validation_failed', 'accepted requires acceptedAt')
  if (record.status !== 'accepted' && record.acceptedAt) return fail('work_validation_failed', 'acceptedAt only for accepted')
  return { ok: true, value: record }
}

function validateMeeting(record) {
  if (!entityRefOk(record.projectRef, { type: 'work.project', ownerDomain: 'work' })) return fail('work_validation_failed', 'invalid projectRef')
  if (record.projectRef.ownerId !== record.ownerId) return fail('work_owner_mismatch', 'Owner mismatch')
  if (!record.occurredAt && !record.scheduledAt) return fail('work_validation_failed', 'occurredAt or scheduledAt required')
  if (SENSITIVE.test(record.safeSummary || '')) return fail('work_sensitive_payload', 'Sensitive markers are not allowed')
  return { ok: true, value: record }
}

function validateDecision(record) {
  if (!entityRefOk(record.projectRef, { type: 'work.project', ownerDomain: 'work' })) return fail('work_validation_failed', 'invalid projectRef')
  if (record.projectRef.ownerId !== record.ownerId) return fail('work_owner_mismatch', 'Owner mismatch')
  if (!['proposed', 'decided', 'superseded', 'cancelled'].includes(record.status)) return fail('work_invalid_status', 'Invalid decision status')
  if (SENSITIVE.test(record.safeSummary || '')) return fail('work_sensitive_payload', 'Sensitive markers are not allowed')
  if (record.status === 'decided' && (!record.decidedAt || !record.decidedBy)) return fail('work_validation_failed', 'decided requires metadata')
  if (record.status === 'proposed' && (record.decidedAt || record.decidedBy)) return fail('work_validation_failed', 'proposed cannot have decision metadata')
  if (record.supersedesDecisionRef?.id === record.id) return fail('work_validation_failed', 'cannot supersede itself')
  return { ok: true, value: record }
}

function validateProposal(record) {
  if (record.version !== '1') return fail('work_version_not_supported', 'Unsupported Work version')
  if (!entityRefOk(record.workEntityRef) || record.workEntityRef.ownerDomain !== 'work' || !String(record.workEntityRef.type).startsWith('work.')) {
    return fail('work_must_not_own_task', 'workEntityRef must be Work-owned')
  }
  if (record.workEntityRef.ownerId !== record.ownerId) return fail('work_owner_mismatch', 'Owner mismatch')
  if (SENSITIVE.test(record.safeContext || '') || SENSITIVE.test(record.proposedTaskTitle || '')) {
    return fail('work_sensitive_payload', 'Sensitive markers are not allowed')
  }
  if (!['draft', 'proposed', 'accepted', 'rejected', 'expired', 'converted', 'cancelled'].includes(record.status)) {
    return fail('work_invalid_status', 'Invalid proposal status')
  }
  if (record.status === 'converted' && (!record.planTaskRef || !record.planActionId || !record.resolvedAt)) {
    return fail('converted_requires_task_ref', 'converted requires Plan Task ref')
  }
  if (['rejected', 'expired', 'cancelled'].includes(record.status) && !record.resolvedAt) {
    return fail('work_validation_failed', 'terminal proposal requires resolvedAt')
  }
  if (['draft', 'proposed', 'accepted'].includes(record.status) && record.planTaskRef) {
    return fail('task_embedded_before_conversion', 'non-converted proposals cannot embed Task refs')
  }
  if (record.planTaskRef && !entityRefOk(record.planTaskRef.taskRef, { type: 'plan.task', ownerDomain: 'plan' })) {
    return fail('work_plan_ref_invalid', 'planTaskRef must reference plan.task')
  }
  return { ok: true, value: record }
}

export function createWorkMemoryStore(seed = {}) {
  return {
    projects: new Map((seed.projects || []).map((row) => [row.id, structuredClone(row)])),
    deliverables: new Map((seed.deliverables || []).map((row) => [row.id, structuredClone(row)])),
    meetings: new Map((seed.meetings || []).map((row) => [row.id, structuredClone(row)])),
    decisions: new Map((seed.decisions || []).map((row) => [row.id, structuredClone(row)])),
    proposals: new Map((seed.proposals || []).map((row) => [row.id, structuredClone(row)])),
    activities: [...(seed.activities || [])],
    planTasks: new Map((seed.planTasks || []).map((row) => [row.id, structuredClone(row)])),
  }
}

function recordActivity(store, partial) {
  const activity = {
    schemaVersion: '1',
    id: uuid(),
    eventType: partial.eventType,
    actor: partial.actor,
    targetRefs: partial.targetRefs || [],
    securityDomain: 'work',
    summary: partial.summary,
    result: partial.result || 'succeeded',
    correlationId: partial.correlationId || uuid(),
    occurredAt: nowIso(),
    redactedPayload: redact(partial.redactedPayload || {}),
  }
  store.activities.push(activity)
  return activity
}

function assertOwner(actorId, ownerId) {
  return actorId && ownerId && actorId === ownerId
}

export function createWorkProject(store, input) {
  const ownerId = input.ownerId
  const actor = input.actor || { type: 'user', id: ownerId }
  if (!UUID_RE.test(ownerId || '')) return fail('work_auth_required', 'Authenticated owner is required')
  if (SENSITIVE.test(input.safeSummary || '') || SENSITIVE.test(input.title || '')) {
    return fail('work_sensitive_payload', 'Sensitive markers are not allowed in Work safe fields')
  }
  if (input.canonicalTask || input.task) return fail('work_must_not_embed_canonical_task', 'Work must not store canonical Plan Tasks')

  const record = {
    id: input.id || uuid(),
    version: '1',
    ownerId,
    title: String(input.title || '').trim(),
    safeSummary: String(input.safeSummary || '').trim(),
    status: input.status || 'active',
    priority: input.priority || 'normal',
    startAt: input.startAt ?? null,
    targetAt: input.targetAt ?? null,
    completedAt: input.completedAt ?? null,
    dataClassification: input.dataClassification || 'work_confidential',
    sourceRefs: input.sourceRefs || [],
    libraryRefs: input.libraryRefs || [],
    planTaskRefs: input.planTaskRefs || [],
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
  }
  const validated = validateProject(record)
  if (!validated.ok) return validated
  store.projects.set(validated.value.id, validated.value)
  const activity = recordActivity(store, {
    eventType: 'work.project_created',
    actor,
    targetRefs: [{ id: validated.value.id, type: 'work.project', ownerDomain: 'work', ownerId }],
    summary: `Created Work project ${validated.value.title}`,
    correlationId: input.correlationId,
  })
  return { ok: true, project: validated.value, activityId: activity.id }
}

export function updateWorkProjectMetadata(store, input) {
  const existing = store.projects.get(input.id)
  if (!existing) return fail('work_project_missing', 'Work project not found')
  if (!assertOwner(input.ownerId, existing.ownerId)) return fail('work_owner_mismatch', 'Owner mismatch')
  const next = {
    ...existing,
    title: input.title ?? existing.title,
    safeSummary: input.safeSummary ?? existing.safeSummary,
    status: input.status ?? existing.status,
    priority: input.priority ?? existing.priority,
    startAt: input.startAt !== undefined ? input.startAt : existing.startAt,
    targetAt: input.targetAt !== undefined ? input.targetAt : existing.targetAt,
    completedAt: input.completedAt !== undefined ? input.completedAt : existing.completedAt,
    sourceRefs: input.sourceRefs ?? existing.sourceRefs,
    libraryRefs: input.libraryRefs ?? existing.libraryRefs,
    planTaskRefs: input.planTaskRefs ?? existing.planTaskRefs,
    updatedAt: nowIso(),
  }
  if (next.status === 'completed' && !next.completedAt) next.completedAt = nowIso()
  if (next.status !== 'completed') next.completedAt = null
  const validated = validateProject(next)
  if (!validated.ok) return validated
  store.projects.set(validated.value.id, validated.value)
  recordActivity(store, {
    eventType: 'work.project_updated',
    actor: input.actor || { type: 'user', id: existing.ownerId },
    targetRefs: [{ id: existing.id, type: 'work.project', ownerDomain: 'work', ownerId: existing.ownerId }],
    summary: `Updated Work project ${validated.value.title}`,
  })
  return { ok: true, project: validated.value }
}

export function createWorkDeliverable(store, input) {
  const project = store.projects.get(input.projectId || input.projectRef?.id)
  if (!project) return fail('work_project_missing', 'Deliverable requires an existing Work project')
  if (!assertOwner(input.ownerId, project.ownerId)) return fail('work_owner_mismatch', 'Owner mismatch')
  const record = {
    id: input.id || uuid(),
    version: '1',
    projectRef: { id: project.id, type: 'work.project', ownerDomain: 'work', ownerId: project.ownerId },
    ownerId: project.ownerId,
    title: String(input.title || '').trim(),
    safeSummary: String(input.safeSummary || '').trim(),
    status: input.status || 'planned',
    targetAt: input.targetAt ?? null,
    acceptedAt: input.acceptedAt ?? null,
    dataClassification: input.dataClassification || 'work_confidential',
    sourceRefs: input.sourceRefs || [],
    planTaskRefs: input.planTaskRefs || [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  const validated = validateDeliverable(record)
  if (!validated.ok) return validated
  store.deliverables.set(validated.value.id, validated.value)
  recordActivity(store, {
    eventType: 'work.deliverable_created',
    actor: input.actor || { type: 'user', id: project.ownerId },
    targetRefs: [
      { id: validated.value.id, type: 'work.deliverable', ownerDomain: 'work', ownerId: project.ownerId },
      validated.value.projectRef,
    ],
    summary: `Created deliverable ${validated.value.title}`,
  })
  return { ok: true, deliverable: validated.value }
}

export function updateWorkDeliverableStatus(store, input) {
  const existing = store.deliverables.get(input.id)
  if (!existing) return fail('work_deliverable_missing', 'Deliverable not found')
  if (!assertOwner(input.ownerId, existing.ownerId)) return fail('work_owner_mismatch', 'Owner mismatch')
  const next = {
    ...existing,
    status: input.status,
    acceptedAt: input.status === 'accepted' ? (input.acceptedAt || nowIso()) : null,
    updatedAt: nowIso(),
  }
  const validated = validateDeliverable(next)
  if (!validated.ok) return validated
  store.deliverables.set(validated.value.id, validated.value)
  recordActivity(store, {
    eventType: 'work.deliverable_status_updated',
    actor: input.actor || { type: 'user', id: existing.ownerId },
    targetRefs: [{ id: existing.id, type: 'work.deliverable', ownerDomain: 'work', ownerId: existing.ownerId }],
    summary: `Deliverable status -> ${validated.value.status}`,
  })
  return { ok: true, deliverable: validated.value }
}

export function recordWorkMeeting(store, input) {
  const project = store.projects.get(input.projectId || input.projectRef?.id)
  if (!project) return fail('work_project_missing', 'Meeting requires an existing Work project')
  if (!assertOwner(input.ownerId, project.ownerId)) return fail('work_owner_mismatch', 'Owner mismatch')
  if (input.transcript || input.fullBody) return fail('work_sensitive_payload', 'Full meeting transcripts are not stored in Work safe records')
  const record = {
    id: input.id || uuid(),
    version: '1',
    projectRef: { id: project.id, type: 'work.project', ownerDomain: 'work', ownerId: project.ownerId },
    ownerId: project.ownerId,
    title: String(input.title || '').trim(),
    occurredAt: input.occurredAt ?? null,
    scheduledAt: input.scheduledAt ?? null,
    attendees: input.attendees || [],
    safeSummary: String(input.safeSummary || '').trim(),
    dataClassification: input.dataClassification || 'work_confidential',
    decisionRefs: input.decisionRefs || [],
    actionProposalRefs: input.actionProposalRefs || [],
    libraryRefs: input.libraryRefs || [],
    sourceRefs: input.sourceRefs || [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  const validated = validateMeeting(record)
  if (!validated.ok) return validated
  store.meetings.set(validated.value.id, validated.value)
  recordActivity(store, {
    eventType: 'work.meeting_recorded',
    actor: input.actor || { type: 'user', id: project.ownerId },
    targetRefs: [{ id: validated.value.id, type: 'work.meeting', ownerDomain: 'work', ownerId: project.ownerId }],
    summary: `Recorded meeting ${validated.value.title}`,
  })
  return { ok: true, meeting: validated.value }
}

export function recordWorkDecision(store, input) {
  const project = store.projects.get(input.projectId || input.projectRef?.id)
  if (!project) return fail('work_project_missing', 'Decision requires an existing Work project')
  if (!assertOwner(input.ownerId, project.ownerId)) return fail('work_owner_mismatch', 'Owner mismatch')
  const record = {
    id: input.id || uuid(),
    version: '1',
    projectRef: { id: project.id, type: 'work.project', ownerDomain: 'work', ownerId: project.ownerId },
    meetingRef: input.meetingRef ?? (input.meetingId
      ? { id: input.meetingId, type: 'work.meeting', ownerDomain: 'work', ownerId: project.ownerId }
      : null),
    ownerId: project.ownerId,
    title: String(input.title || '').trim(),
    safeSummary: String(input.safeSummary || '').trim(),
    status: input.status || 'proposed',
    decidedAt: input.decidedAt ?? null,
    decidedBy: input.decidedBy ?? null,
    supersedesDecisionRef: input.supersedesDecisionRef ?? null,
    dataClassification: input.dataClassification || 'work_confidential',
    entityRefs: input.entityRefs || [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  const validated = validateDecision(record)
  if (!validated.ok) return validated
  store.decisions.set(validated.value.id, validated.value)
  recordActivity(store, {
    eventType: 'work.decision_recorded',
    actor: input.actor || { type: 'user', id: project.ownerId },
    targetRefs: [{ id: validated.value.id, type: 'work.decision', ownerDomain: 'work', ownerId: project.ownerId }],
    summary: `Recorded decision ${validated.value.title}`,
  })
  return { ok: true, decision: validated.value }
}

export function createWorkActionProposal(store, input) {
  const ownerId = input.ownerId
  if (!UUID_RE.test(ownerId || '')) return fail('work_auth_required', 'Authenticated owner is required')
  if (input.canonicalTask || input.task) return fail('work_must_not_embed_canonical_task', 'WorkActionProposal is not a Task')
  const idempotencyKey = String(input.idempotencyKey || '').trim()
  if (!idempotencyKey) return fail('work_idempotency_required', 'idempotencyKey is required')

  for (const existing of store.proposals.values()) {
    if (existing.ownerId === ownerId && existing.idempotencyKey === idempotencyKey) {
      if (
        existing.proposedTaskTitle !== String(input.proposedTaskTitle || '').trim()
        || existing.safeContext !== String(input.safeContext || '').trim()
        || existing.workEntityRef.id !== input.workEntityRef?.id
      ) {
        return fail('work_idempotency_conflict', 'Conflicting WorkActionProposal idempotency replay')
      }
      return { ok: true, proposal: existing, replayed: true }
    }
  }

  const record = {
    id: input.id || uuid(),
    version: '1',
    ownerId,
    workEntityRef: input.workEntityRef,
    proposedTaskTitle: String(input.proposedTaskTitle || '').trim(),
    safeContext: String(input.safeContext || '').trim(),
    suggestedDueAt: input.suggestedDueAt ?? null,
    suggestedPriority: input.suggestedPriority,
    risk: input.risk || 'R2',
    status: input.status || 'draft',
    planActionId: null,
    planTaskRef: null,
    dataClassification: input.dataClassification || 'work_confidential',
    requestedAt: nowIso(),
    resolvedAt: null,
    correlationId: input.correlationId || uuid(),
    idempotencyKey,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  const validated = validateProposal(record)
  if (!validated.ok) return validated
  store.proposals.set(validated.value.id, validated.value)
  recordActivity(store, {
    eventType: 'work.action_proposal_created',
    actor: input.actor || { type: input.actorType || 'user', id: ownerId },
    targetRefs: [validated.value.workEntityRef, { id: validated.value.id, type: 'work.action_proposal', ownerDomain: 'work', ownerId }],
    summary: `Created WorkActionProposal ${validated.value.proposedTaskTitle}`,
    correlationId: validated.value.correlationId,
  })
  return { ok: true, proposal: validated.value, replayed: false }
}

export function cancelWorkActionProposal(store, input) {
  const existing = store.proposals.get(input.id)
  if (!existing) return fail('work_proposal_missing', 'WorkActionProposal not found')
  if (!assertOwner(input.ownerId, existing.ownerId)) return fail('work_owner_mismatch', 'Owner mismatch')
  const allowed = KenosWorkActionProposalTransitions[existing.status] || []
  if (!allowed.includes('cancelled')) return fail('work_illegal_transition', `Cannot cancel from ${existing.status}`)
  const next = { ...existing, status: 'cancelled', resolvedAt: nowIso(), updatedAt: nowIso() }
  const validated = validateProposal(next)
  if (!validated.ok) return validated
  store.proposals.set(validated.value.id, validated.value)
  recordActivity(store, {
    eventType: 'work.action_proposal_cancelled',
    actor: input.actor || { type: 'user', id: existing.ownerId },
    targetRefs: [{ id: existing.id, type: 'work.action_proposal', ownerDomain: 'work', ownerId: existing.ownerId }],
    summary: `Cancelled WorkActionProposal ${existing.proposedTaskTitle}`,
    result: 'cancelled',
  })
  return { ok: true, proposal: validated.value }
}

/**
 * Explicit user conversion path. Does not call a production executor.
 * When conversion is enabled, invokes optional planCreateTaskSimulator.
 */
export function convertWorkActionProposalToPlanTask(store, input, options = {}) {
  const existing = store.proposals.get(input.id)
  if (!existing) return fail('work_proposal_missing', 'WorkActionProposal not found')
  if (!assertOwner(input.ownerId, existing.ownerId)) return fail('work_owner_mismatch', 'Owner mismatch')
  if (!input.userRequested) return fail('work_explicit_user_required', 'Conversion requires explicit user Create task')
  if (!options.conversionEnabled) {
    return fail('work_conversion_flag_off', 'Work→Plan conversion is default Off outside local simulation')
  }
  const allowed = KenosWorkActionProposalTransitions[existing.status] || []
  if (!allowed.includes('converted') && existing.status !== 'converted') {
    return fail('work_illegal_transition', `Cannot convert from ${existing.status}`)
  }
  if (existing.status === 'converted') return { ok: true, proposal: existing, replayed: true }

  const planActionId = input.planActionId || uuid()
  const taskId = input.taskId || uuid()
  const createTaskAction = {
    schemaVersion: '1',
    id: planActionId,
    actionType: 'plan.create_task',
    producer: 'plan',
    targetDomain: 'plan',
    actor: { type: 'user', id: existing.ownerId },
    deviceId: input.deviceId || uuid(),
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: {
      title: existing.proposedTaskTitle,
      source: 'work_action_proposal',
      workProposalId: existing.id,
      evidenceRefs: [existing.workEntityRef],
    },
    reason: 'Explicit user conversion of WorkActionProposal',
    evidenceRefs: [existing.workEntityRef],
    idempotencyKey: `work-proposal-convert:${existing.idempotencyKey}`,
    requestedAt: nowIso(),
    correlationId: existing.correlationId,
  }

  let planTaskRef = input.planTaskRef
  if (!planTaskRef) {
    if (typeof options.planCreateTaskSimulator === 'function') {
      const simulated = options.planCreateTaskSimulator(createTaskAction)
      if (!simulated?.ok) return fail(simulated?.error?.code || 'plan_create_failed', simulated?.error?.message || 'Plan create_task simulation failed')
      planTaskRef = simulated.planTaskRef
    } else {
      const task = {
        id: taskId,
        title: existing.proposedTaskTitle,
        status: 'open',
        ownerId: existing.ownerId,
      }
      store.planTasks.set(task.id, task)
      planTaskRef = {
        taskRef: { id: task.id, type: 'plan.task', ownerDomain: 'plan', ownerId: existing.ownerId },
        correlationId: existing.correlationId,
        safeTitle: existing.proposedTaskTitle,
        completionProjection: 'open',
        freshness: nowIso(),
        deepLink: `https://planner.kenos.space/tasks/${task.id}`,
      }
    }
  }

  const next = {
    ...existing,
    status: 'converted',
    planActionId,
    planTaskRef,
    resolvedAt: nowIso(),
    updatedAt: nowIso(),
  }
  const validated = validateProposal(next)
  if (!validated.ok) return validated
  store.proposals.set(validated.value.id, validated.value)

  const project = [...store.projects.values()].find((row) => row.id === existing.workEntityRef.id)
  if (project) {
    const refs = [...(project.planTaskRefs || [])]
    if (!refs.some((ref) => ref.taskRef?.id === planTaskRef.taskRef.id)) {
      refs.push(planTaskRef)
      store.projects.set(project.id, { ...project, planTaskRefs: refs, updatedAt: nowIso() })
    }
  }

  recordActivity(store, {
    eventType: 'work.action_proposal_converted',
    actor: { type: 'user', id: existing.ownerId },
    targetRefs: [
      { id: existing.id, type: 'work.action_proposal', ownerDomain: 'work', ownerId: existing.ownerId },
      planTaskRef.taskRef,
    ],
    summary: `Converted WorkActionProposal to Plan Task ${planTaskRef.safeTitle || planTaskRef.taskRef.id}`,
    correlationId: existing.correlationId,
    redactedPayload: { planActionId, simulation: true },
  })

  return {
    ok: true,
    proposal: validated.value,
    createTaskAction,
    planTaskRef,
    simulation: true,
    productionWrite: false,
  }
}

export function reconcilePlanTaskRefs(store, ownerId) {
  const mismatches = []
  for (const project of store.projects.values()) {
    if (project.ownerId !== ownerId) continue
    for (const projection of project.planTaskRefs || []) {
      const task = store.planTasks.get(projection.taskRef?.id)
      const classes = []
      if (!task) classes.push('missing_task')
      else {
        if (task.ownerId && task.ownerId !== ownerId) classes.push('owner_mismatch')
        if (task.deleted) classes.push('deleted_task')
        const expected = task.status === 'done' ? 'done' : 'open'
        if (projection.completionProjection && projection.completionProjection !== 'unknown' && projection.completionProjection !== expected) {
          classes.push('status_mismatch')
        }
        if (projection.safeTitle && task.title && projection.safeTitle !== task.title) classes.push('stale_projection')
        if (projection.deepLink && task.id && !String(projection.deepLink).includes(task.id)) classes.push('deep_link_mismatch')
        if (projection.correlationId && task.correlationId && projection.correlationId !== task.correlationId) {
          classes.push('correlation_mismatch')
        }
      }
      if (classes.length) {
        mismatches.push({
          kind: 'plan_task_ref',
          projectId: project.id,
          taskId: projection.taskRef?.id,
          classes,
          fingerprint: fingerprint(projection),
        })
      }
    }
  }
  const seen = new Set()
  for (const project of store.projects.values()) {
    for (const projection of project.planTaskRefs || []) {
      const key = projection.taskRef?.id
      if (!key) continue
      if (seen.has(key)) {
        mismatches.push({ kind: 'plan_task_ref', projectId: project.id, taskId: key, classes: ['duplicate_ref'], fingerprint: fingerprint(projection) })
      }
      seen.add(key)
    }
  }
  return { ok: true, mismatches }
}

export function reconcileLibraryRefs(store, ownerId) {
  const mismatches = []
  for (const project of store.projects.values()) {
    if (project.ownerId !== ownerId) continue
    for (const projection of project.libraryRefs || []) {
      if (projection.sourceAvailable === false) {
        mismatches.push({
          kind: 'library_ref',
          projectId: project.id,
          libraryId: projection.libraryRef?.id,
          classes: ['source_unavailable'],
          fingerprint: fingerprint(projection),
        })
      }
      if (projection.libraryRef?.ownerDomain !== 'library') {
        mismatches.push({
          kind: 'library_ref',
          projectId: project.id,
          libraryId: projection.libraryRef?.id,
          classes: ['owner_mismatch'],
          fingerprint: fingerprint(projection),
        })
      }
    }
  }
  return { ok: true, mismatches }
}

export function buildWorkTodayProjection(store, ownerId, options = {}) {
  const now = Date.parse(options.now || nowIso())
  const projects = [...store.projects.values()].filter((row) => row.ownerId === ownerId && row.status === 'active')
  const deliverables = [...store.deliverables.values()].filter((row) => row.ownerId === ownerId)
  const meetings = [...store.meetings.values()].filter((row) => row.ownerId === ownerId)
  const decisions = [...store.decisions.values()].filter((row) => row.ownerId === ownerId)
  const proposals = [...store.proposals.values()].filter((row) => row.ownerId === ownerId)

  const dueSoon = deliverables.filter((row) => {
    if (!row.targetAt || ['accepted', 'cancelled'].includes(row.status)) return false
    const due = Date.parse(row.targetAt)
    return Number.isFinite(due) && due - now <= 7 * 24 * 60 * 60_000
  })
  const blocked = deliverables.filter((row) => row.status === 'blocked')
  const recentMeetings = meetings
    .slice()
    .sort((a, b) => Date.parse(b.occurredAt || b.scheduledAt || b.updatedAt) - Date.parse(a.occurredAt || a.scheduledAt || a.updatedAt))
    .slice(0, 5)
  const unresolvedDecisions = decisions.filter((row) => row.status === 'proposed')
  const pendingProposals = proposals.filter((row) => ['draft', 'proposed', 'accepted'].includes(row.status))
  const staleSources = projects.flatMap((project) =>
    (project.sourceRefs || [])
      .filter((ref) => ref.available === false)
      .map((ref) => ({
        projectId: project.id,
        safeLabel: ref.safeLabel,
        sourceType: ref.sourceType,
      })),
  )

  const cards = []
  for (const project of projects) {
    cards.push(workCard({
      id: `project:${project.id}`,
      kind: 'active_project',
      title: project.title,
      summary: project.safeSummary,
      entityRef: { id: project.id, type: 'work.project', ownerDomain: 'work', ownerId },
      updatedAt: project.updatedAt,
      classification: project.dataClassification,
      deepLink: `/work/projects/${project.id}`,
      actionCapability: 'open_work_project',
    }))
  }
  for (const row of dueSoon) {
    cards.push(workCard({
      id: `deliverable-due:${row.id}`,
      kind: 'deliverable_due_soon',
      title: row.title,
      summary: row.safeSummary,
      entityRef: { id: row.id, type: 'work.deliverable', ownerDomain: 'work', ownerId },
      updatedAt: row.updatedAt,
      classification: row.dataClassification,
      deepLink: `/work/deliverables/${row.id}`,
      actionCapability: 'open_work_deliverable',
    }))
  }
  for (const row of blocked) {
    cards.push(workCard({
      id: `deliverable-blocked:${row.id}`,
      kind: 'blocked_deliverable',
      title: row.title,
      summary: row.safeSummary,
      entityRef: { id: row.id, type: 'work.deliverable', ownerDomain: 'work', ownerId },
      updatedAt: row.updatedAt,
      classification: row.dataClassification,
      deepLink: `/work/deliverables/${row.id}`,
      actionCapability: 'open_work_deliverable',
    }))
  }
  for (const row of recentMeetings) {
    cards.push(workCard({
      id: `meeting:${row.id}`,
      kind: 'recent_meeting',
      title: row.title,
      summary: row.safeSummary,
      entityRef: { id: row.id, type: 'work.meeting', ownerDomain: 'work', ownerId },
      updatedAt: row.updatedAt,
      classification: row.dataClassification,
      deepLink: `/work/meetings/${row.id}`,
      actionCapability: 'open_work_meeting',
    }))
  }
  for (const row of unresolvedDecisions) {
    cards.push(workCard({
      id: `decision:${row.id}`,
      kind: 'unresolved_decision',
      title: row.title,
      summary: row.safeSummary,
      entityRef: { id: row.id, type: 'work.decision', ownerDomain: 'work', ownerId },
      updatedAt: row.updatedAt,
      classification: row.dataClassification,
      deepLink: `/work/decisions/${row.id}`,
      actionCapability: 'open_work_decision',
    }))
  }
  for (const row of pendingProposals) {
    cards.push(workCard({
      id: `proposal:${row.id}`,
      kind: 'pending_action_proposal',
      title: row.proposedTaskTitle,
      summary: row.safeContext,
      entityRef: { id: row.id, type: 'work.action_proposal', ownerDomain: 'work', ownerId },
      updatedAt: row.updatedAt,
      classification: row.dataClassification,
      deepLink: `/work/proposals/${row.id}`,
      actionCapability: 'review_work_action_proposal',
    }))
  }
  for (const stale of staleSources) {
    cards.push(workCard({
      id: `stale:${stale.projectId}:${stale.safeLabel}`,
      kind: 'stale_source_warning',
      title: stale.safeLabel,
      summary: `Source ${stale.sourceType} unavailable`,
      entityRef: { id: stale.projectId, type: 'work.project', ownerDomain: 'work', ownerId },
      updatedAt: nowIso(),
      classification: 'work_confidential',
      deepLink: `/work/projects/${stale.projectId}`,
      actionCapability: 'review_work_source',
      freshness: 'stale',
    }))
  }

  return {
    ownerDomain: 'work',
    source: 'kenos_work_local_projection',
    freshness: 'ready',
    lastUpdated: nowIso(),
    cards,
    counts: {
      activeProjects: projects.length,
      deliverablesDueSoon: dueSoon.length,
      blockedDeliverables: blocked.length,
      recentMeetings: recentMeetings.length,
      unresolvedDecisions: unresolvedDecisions.length,
      pendingProposals: pendingProposals.length,
      staleSources: staleSources.length,
    },
  }
}

function workCard(partial) {
  return {
    ownerDomain: 'work',
    source: 'kenos_work_local_projection',
    freshness: partial.freshness || 'ready',
    lastUpdated: partial.updatedAt,
    deepLink: partial.deepLink,
    dataClassification: partial.classification,
    futureActionCapability: partial.actionCapability,
    executorAvailable: false,
    ...partial,
  }
}

export function compareWorkShadow(legacySummary, nextProjection) {
  const mismatches = []
  const legacyCount = Number(legacySummary?.projectCount || 0)
  const nextCount = Number(nextProjection?.counts?.activeProjects || 0)
  if (legacyCount && nextCount && legacyCount !== nextCount) {
    mismatches.push({ class: 'project_count', severity: 'warning', fingerprint: fingerprint({ legacyCount, nextCount }) })
  }
  for (const id of legacySummary?.projectIds || []) {
    if (!(nextProjection?.cards || []).some((card) => card.entityRef?.id === id)) {
      mismatches.push({ class: 'missing_in_new', severity: 'blocking', fingerprint: fingerprint({ id }) })
    }
  }
  return { ok: true, mismatches }
}

export const CONNECTOR_REGISTRY_PROPOSAL = Object.freeze([
  {
    connectorId: 'jira-read-only',
    sourceType: 'jira',
    permissions: ['read_issue_metadata'],
    readWriteCapability: 'read_only',
    authenticationStatus: 'unknown',
    dataClassification: 'work_confidential',
    supportedCaptureTypes: ['issue_ref'],
    owner: 'integration',
    failureState: 'none',
  },
  {
    connectorId: 'figma-read-only',
    sourceType: 'figma',
    permissions: ['read_file_metadata'],
    readWriteCapability: 'read_only',
    authenticationStatus: 'unknown',
    dataClassification: 'work_confidential',
    supportedCaptureTypes: ['file_ref'],
    owner: 'integration',
    failureState: 'none',
  },
  {
    connectorId: 'browser-capture',
    sourceType: 'browser',
    permissions: ['capture_page_metadata'],
    readWriteCapability: 'read_only',
    authenticationStatus: 'unknown',
    dataClassification: 'work_confidential',
    supportedCaptureTypes: ['page_ref'],
    owner: 'integration',
    failureState: 'none',
  },
])
