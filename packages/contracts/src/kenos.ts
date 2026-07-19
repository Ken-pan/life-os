import { z } from 'zod'

export const KenosSchemaVersionSchema = z.literal('1')
export type KenosSchemaVersion = z.infer<typeof KenosSchemaVersionSchema>

export const KenosUuidSchema = z.string().uuid()
export const KenosIsoDateTimeSchema = z.string().datetime()

export const KenosDomainValues = [
  'core',
  'assistant',
  'work',
  'plan',
  'library',
  'memory',
  'training',
  'money',
  'health',
  'home',
  'music',
  'paper',
  'system',
  'automation',
  'notifications',
  'integration',
] as const
export const KenosDomainSchema = z.enum(KenosDomainValues)
export type KenosDomain = z.infer<typeof KenosDomainSchema>

export const KenosSecurityDomainValues = ['personal', 'work', 'household', 'system'] as const
export const KenosSecurityDomainSchema = z.enum(KenosSecurityDomainValues)
export type KenosSecurityDomain = z.infer<typeof KenosSecurityDomainSchema>

export const KenosClassificationValues = [
  'public',
  'personal',
  'sensitive',
  'work_confidential',
  'restricted_local_only',
  'ephemeral',
] as const
export const KenosClassificationSchema = z.enum(KenosClassificationValues)
export type KenosClassification = z.infer<typeof KenosClassificationSchema>

export const KenosRiskLevelValues = ['R0', 'R1', 'R2', 'R3', 'R4'] as const
export const KenosRiskLevelSchema = z.enum(KenosRiskLevelValues)
export type KenosRiskLevel = z.infer<typeof KenosRiskLevelSchema>

export const KenosApprovalStateSchema = z.enum(['not_required', 'preview_required', 'approved', 'rejected', 'expired'])
export type KenosApprovalState = z.infer<typeof KenosApprovalStateSchema>

export const KenosApprovalStatusValues = ['pending', 'approved', 'rejected', 'expired', 'cancelled', 'superseded'] as const
export const KenosApprovalStatusSchema = z.enum(KenosApprovalStatusValues)
export type KenosApprovalStatus = z.infer<typeof KenosApprovalStatusSchema>

export const KenosOutboxStatusValues = ['pending', 'processing', 'published', 'retry', 'dead_letter'] as const
export const KenosOutboxStatusSchema = z.enum(KenosOutboxStatusValues)
export type KenosOutboxStatus = z.infer<typeof KenosOutboxStatusSchema>

export const KenosErrorClassValues = ['transient', 'permanent'] as const
export const KenosErrorClassSchema = z.enum(KenosErrorClassValues)
export type KenosErrorClass = z.infer<typeof KenosErrorClassSchema>

export const KenosCommandErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  class: KenosErrorClassSchema,
  retryable: z.boolean(),
  userAction: z.string().min(1).optional(),
})
export type KenosCommandError = z.infer<typeof KenosCommandErrorSchema>

export const KenosCommandFailureSchema = z.object({
  ok: z.literal(false),
  error: KenosCommandErrorSchema,
})
export type KenosCommandFailure = z.infer<typeof KenosCommandFailureSchema>

export const KenosActorTypeValues = ['user', 'assistant', 'automation', 'connector', 'system'] as const
export const KenosActorSchema = z.object({
  type: z.enum(KenosActorTypeValues),
  id: KenosUuidSchema,
})
export type KenosActor = z.infer<typeof KenosActorSchema>

export const KenosEntityRefSchema = z.object({
  id: KenosUuidSchema,
  type: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
  ownerDomain: KenosDomainSchema,
  ownerId: KenosUuidSchema,
  version: z.number().int().nonnegative().optional(),
})
export type KenosEntityRef = z.infer<typeof KenosEntityRefSchema>

export const KenosEntityMetadataSchema = KenosEntityRefSchema.extend({
  securityDomain: KenosSecurityDomainSchema,
  dataClassification: KenosClassificationSchema,
  createdAt: KenosIsoDateTimeSchema,
  updatedAt: KenosIsoDateTimeSchema,
  archivedAt: KenosIsoDateTimeSchema.nullable().optional(),
})
export type KenosEntityMetadata = z.infer<typeof KenosEntityMetadataSchema>

export const KenosPhase1ActionTypeValues = ['plan.create_task'] as const

export const KenosActionRequestSchema = z.object({
  schemaVersion: KenosSchemaVersionSchema,
  id: KenosUuidSchema,
  actionType: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
  producer: KenosDomainSchema,
  targetDomain: KenosDomainSchema,
  target: KenosEntityRefSchema.optional(),
  actor: KenosActorSchema,
  deviceId: KenosUuidSchema,
  securityDomain: KenosSecurityDomainSchema,
  dataClassification: KenosClassificationSchema,
  requestedRisk: KenosRiskLevelSchema.optional(),
  payload: z.record(z.unknown()),
  reason: z.string().min(1).optional(),
  evidenceRefs: z.array(KenosEntityRefSchema).optional(),
  idempotencyKey: z.string().min(1),
  expectedVersion: z.number().int().nonnegative().optional(),
  requestedAt: KenosIsoDateTimeSchema,
  expiresAt: KenosIsoDateTimeSchema.optional(),
  correlationId: KenosUuidSchema,
  causationId: KenosUuidSchema.optional(),
}).superRefine((request, ctx) => {
  if (request.target && request.target.ownerDomain !== request.targetDomain) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target'], message: 'target ownerDomain must match targetDomain' })
  }
  if (request.expiresAt && Date.parse(request.expiresAt) <= Date.parse(request.requestedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'expiresAt must be later than requestedAt' })
  }
})
export type KenosActionRequest = z.infer<typeof KenosActionRequestSchema>

export const KenosActionDecisionOutcomeValues = ['allow', 'require_approval', 'deny', 'expired'] as const
export const KenosActionDecisionSchema = z.object({
  requestId: KenosUuidSchema,
  outcome: z.enum(KenosActionDecisionOutcomeValues),
  evaluatedRisk: KenosRiskLevelSchema,
  policyVersion: z.string().min(1),
  reasons: z.array(z.string().min(1)).min(1),
  requiredApproval: z.object({
    level: z.enum(['confirm', 'strong_confirm']),
    expiresAt: KenosIsoDateTimeSchema,
  }).optional(),
  decidedAt: KenosIsoDateTimeSchema,
}).superRefine((decision, ctx) => {
  if (decision.outcome === 'require_approval' && !decision.requiredApproval) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredApproval'], message: 'requiredApproval is required for require_approval' })
  }
  if (decision.outcome !== 'require_approval' && decision.requiredApproval) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredApproval'], message: 'requiredApproval is only valid for require_approval' })
  }
})
export type KenosActionDecision = z.infer<typeof KenosActionDecisionSchema>

export const KenosActionResultStatusValues = ['succeeded', 'failed', 'queued', 'conflict', 'cancelled'] as const
export const KenosActionResultSchema = z.object({
  requestId: KenosUuidSchema,
  status: z.enum(KenosActionResultStatusValues),
  result: z.unknown().optional(),
  affectedEntities: z.array(KenosEntityRefSchema),
  activityId: KenosUuidSchema,
  undoAction: z.lazy(() => KenosActionRequestSchema).optional(),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
    userAction: z.string().min(1).optional(),
  }).optional(),
  completedAt: KenosIsoDateTimeSchema.optional(),
}).superRefine((result, ctx) => {
  if (['failed', 'conflict'].includes(result.status) && !result.error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['error'], message: 'error is required for failed or conflict results' })
  }
  if (result.status === 'succeeded' && result.error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['error'], message: 'succeeded results cannot include an error' })
  }
})
export type KenosActionResult = z.infer<typeof KenosActionResultSchema>

export const KenosApprovalRequestSchema = z.object({
  id: KenosUuidSchema,
  actionRequestId: KenosUuidSchema,
  risk: KenosRiskLevelSchema,
  summary: z.string().min(1),
  impact: z.array(z.string().min(1)).min(1),
  sensitiveFieldsRedacted: z.boolean(),
  reversible: z.boolean(),
  expiresAt: KenosIsoDateTimeSchema,
  createdAt: KenosIsoDateTimeSchema,
})
export type KenosApprovalRequest = z.infer<typeof KenosApprovalRequestSchema>

export const KenosApprovalDecisionSchema = z.object({
  approvalId: KenosUuidSchema,
  decision: z.enum(['approved', 'rejected', 'expired']),
  decidedBy: KenosUuidSchema,
  authStrength: z.enum(['session', 'reauthenticated', 'biometric_or_device']),
  constraints: z.record(z.unknown()).optional(),
  decidedAt: KenosIsoDateTimeSchema,
})
export type KenosApprovalDecision = z.infer<typeof KenosApprovalDecisionSchema>

const KENOS_SENSITIVE_SUMMARY_PATTERN = /\b(token|secret|password|authorization|cookie|bearer)\b/i

export const KenosApprovalRecordSchema = z.object({
  id: KenosUuidSchema,
  version: KenosSchemaVersionSchema,
  ownerId: KenosUuidSchema,
  actionId: KenosUuidSchema,
  correlationId: KenosUuidSchema,
  requestingActor: KenosActorSchema,
  requestingDomain: KenosDomainSchema,
  actionType: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
  risk: KenosRiskLevelSchema,
  status: KenosApprovalStatusSchema,
  reasonCode: z.string().regex(/^[a-z][a-z0-9_]*$/),
  safeSummary: z.string().min(1).max(500),
  dataClassification: KenosClassificationSchema,
  requestedAt: KenosIsoDateTimeSchema,
  expiresAt: KenosIsoDateTimeSchema,
  decidedAt: KenosIsoDateTimeSchema.nullable().optional(),
  decidedBy: KenosUuidSchema.nullable().optional(),
  decisionReason: z.string().min(1).max(500).nullable().optional(),
  supersedesApprovalId: KenosUuidSchema.nullable().optional(),
  entityRefs: z.array(KenosEntityRefSchema),
  createdAt: KenosIsoDateTimeSchema,
  updatedAt: KenosIsoDateTimeSchema,
}).superRefine((record, ctx) => {
  if (Date.parse(record.expiresAt) <= Date.parse(record.requestedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'expiresAt must be later than requestedAt' })
  }
  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['updatedAt'], message: 'updatedAt must not be earlier than createdAt' })
  }
  const hasDecisionMetadata = Boolean(record.decidedAt || record.decidedBy || record.decisionReason)
  const hasCompleteDecisionMetadata = Boolean(record.decidedAt && record.decidedBy && record.decisionReason)
  if (record.status === 'pending' && hasDecisionMetadata) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'pending approvals cannot contain decision metadata' })
  }
  if (record.status !== 'pending' && !hasCompleteDecisionMetadata) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'terminal approvals require complete decision metadata' })
  }
  if (record.supersedesApprovalId === record.id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['supersedesApprovalId'], message: 'approval cannot supersede itself' })
  }
  if (KENOS_SENSITIVE_SUMMARY_PATTERN.test(record.safeSummary)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['safeSummary'], message: 'safeSummary contains a sensitive credential marker' })
  }
})
export type KenosApprovalRecord = z.infer<typeof KenosApprovalRecordSchema>

export const KenosApprovalTransitions: Readonly<Record<KenosApprovalStatus, readonly KenosApprovalStatus[]>> = {
  pending: ['approved', 'rejected', 'expired', 'cancelled', 'superseded'],
  approved: [],
  rejected: [],
  expired: [],
  cancelled: [],
  superseded: [],
}

export const KenosApprovalTransitionSchema = z.object({
  from: KenosApprovalStatusSchema,
  to: KenosApprovalStatusSchema,
}).superRefine((transition, ctx) => {
  if (!KenosApprovalTransitions[transition.from].includes(transition.to)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: `Invalid Approval transition: ${transition.from} -> ${transition.to}` })
  }
})
export type KenosApprovalTransition = z.infer<typeof KenosApprovalTransitionSchema>

const KENOS_SENSITIVE_ACTIVITY_KEYS = ['token', 'secret', 'password', 'authorization', 'cookie', 'rawConversation', 'connectorPayload']

function hasUnredactedSensitiveActivityValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUnredactedSensitiveActivityValue)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    const sensitive = KENOS_SENSITIVE_ACTIVITY_KEYS.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase()))
    if (sensitive && nested !== '[REDACTED]' && nested !== '[REDACTED_NOTES]') return true
    return hasUnredactedSensitiveActivityValue(nested)
  })
}

export const KenosActivityResultValues = ['succeeded', 'failed', 'queued', 'undone', 'cancelled'] as const
export const KenosActivityRecordSchema = z.object({
  schemaVersion: KenosSchemaVersionSchema,
  id: KenosUuidSchema,
  eventType: z.string().min(1),
  actor: KenosActorSchema,
  actionRequestId: KenosUuidSchema.optional(),
  approvalId: KenosUuidSchema.optional(),
  targetRefs: z.array(KenosEntityRefSchema),
  securityDomain: KenosSecurityDomainSchema,
  summary: z.string().min(1),
  reason: z.string().min(1).optional(),
  result: z.enum(KenosActivityResultValues),
  policy: KenosActionDecisionSchema.optional(),
  changes: z.array(z.object({
    path: z.string().min(1),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    redacted: z.boolean().optional(),
  })).optional(),
  redactedPayload: z.record(z.unknown()).optional(),
  undo: z.object({ supported: z.boolean(), actionType: z.string().min(1).optional() }).optional(),
  undoUntil: KenosIsoDateTimeSchema.optional(),
  correlationId: KenosUuidSchema,
  causationId: KenosUuidSchema.optional(),
  occurredAt: KenosIsoDateTimeSchema,
}).superRefine((activity, ctx) => {
  if (hasUnredactedSensitiveActivityValue(activity.redactedPayload)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['redactedPayload'], message: 'Activity contains an unredacted sensitive payload value' })
  }
})
export type KenosActivityRecord = z.infer<typeof KenosActivityRecordSchema>

export const KenosMutationEnvelopeSchema = z.object({
  schemaVersion: KenosSchemaVersionSchema,
  mutationId: KenosUuidSchema,
  idempotencyKey: z.string().min(1),
  entity: KenosEntityRefSchema,
  actorId: KenosUuidSchema,
  deviceId: KenosUuidSchema,
  baseVersion: z.number().int().nonnegative().optional(),
  operation: z.string().min(1),
  payload: z.record(z.unknown()),
  occurredAt: KenosIsoDateTimeSchema,
})
export type KenosMutationEnvelope = z.infer<typeof KenosMutationEnvelopeSchema>

export const KenosOutboxRecordSchema = z.object({
  id: KenosUuidSchema,
  topic: z.string().min(1),
  aggregate: KenosEntityRefSchema,
  payload: z.record(z.unknown()),
  schemaVersion: KenosSchemaVersionSchema,
  actionRequestId: KenosUuidSchema.optional(),
  idempotencyKey: z.string().min(1),
  correlationId: KenosUuidSchema,
  causationId: KenosUuidSchema.optional(),
  occurredAt: KenosIsoDateTimeSchema,
  availableAt: KenosIsoDateTimeSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive().optional(),
  status: KenosOutboxStatusSchema,
  lastErrorClass: KenosErrorClassSchema.optional(),
  failureReason: z.string().min(1).optional(),
  updatedAt: KenosIsoDateTimeSchema.optional(),
}).superRefine((record, ctx) => {
  if (record.status === 'dead_letter' && !record.failureReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['failureReason'], message: 'dead-letter records require a visible failure reason' })
  }
})
export type KenosOutboxRecord = z.infer<typeof KenosOutboxRecordSchema>

export const KenosOutboxTransitions: Readonly<Record<KenosOutboxStatus, readonly KenosOutboxStatus[]>> = {
  pending: ['processing', 'dead_letter'],
  processing: ['published', 'retry', 'dead_letter'],
  retry: ['processing', 'dead_letter'],
  published: [],
  dead_letter: [],
}

export const KenosOutboxTransitionSchema = z.object({
  from: KenosOutboxStatusSchema,
  to: KenosOutboxStatusSchema,
}).superRefine((transition, ctx) => {
  if (!KenosOutboxTransitions[transition.from].includes(transition.to)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: `Invalid Outbox transition: ${transition.from} -> ${transition.to}` })
  }
})
export type KenosOutboxTransition = z.infer<typeof KenosOutboxTransitionSchema>

export const KenosCaptureEnvelopeSchema = z.object({
  schemaVersion: KenosSchemaVersionSchema,
  id: KenosUuidSchema,
  kind: z.string().min(1),
  payload: z.record(z.unknown()),
  source: z.object({
    client: z.string().min(1),
    deviceId: KenosUuidSchema,
    connectorId: KenosUuidSchema.optional(),
    externalUrl: z.string().url().optional(),
    externalId: z.string().min(1).optional(),
  }),
  actorId: KenosUuidSchema,
  securityDomain: KenosSecurityDomainSchema,
  dataClassification: KenosClassificationSchema,
  suggestedDomains: z.array(KenosDomainSchema).optional(),
  contextRefs: z.array(KenosEntityRefSchema).optional(),
  contentHash: z.string().min(1).optional(),
  capturedAt: KenosIsoDateTimeSchema,
  expiresAt: KenosIsoDateTimeSchema.optional(),
  idempotencyKey: z.string().min(1),
}).superRefine((capture, ctx) => {
  if (capture.expiresAt && Date.parse(capture.expiresAt) <= Date.parse(capture.capturedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'expiresAt must be later than capturedAt' })
  }
})
export type KenosCaptureEnvelope = z.infer<typeof KenosCaptureEnvelopeSchema>

/** Additive Phase 3 Work domain contracts. Major schemaVersion remains `"1"`. */

export const KenosWorkProjectStatusValues = ['active', 'blocked', 'completed', 'archived'] as const
export const KenosWorkProjectStatusSchema = z.enum(KenosWorkProjectStatusValues)
export type KenosWorkProjectStatus = z.infer<typeof KenosWorkProjectStatusSchema>

export const KenosWorkDeliverableStatusValues = ['planned', 'in_progress', 'blocked', 'accepted', 'cancelled'] as const
export const KenosWorkDeliverableStatusSchema = z.enum(KenosWorkDeliverableStatusValues)
export type KenosWorkDeliverableStatus = z.infer<typeof KenosWorkDeliverableStatusSchema>

export const KenosWorkDecisionStatusValues = ['proposed', 'decided', 'superseded', 'cancelled'] as const
export const KenosWorkDecisionStatusSchema = z.enum(KenosWorkDecisionStatusValues)
export type KenosWorkDecisionStatus = z.infer<typeof KenosWorkDecisionStatusSchema>

export const KenosWorkActionProposalStatusValues = [
  'draft',
  'proposed',
  'accepted',
  'rejected',
  'expired',
  'converted',
  'cancelled',
] as const
export const KenosWorkActionProposalStatusSchema = z.enum(KenosWorkActionProposalStatusValues)
export type KenosWorkActionProposalStatus = z.infer<typeof KenosWorkActionProposalStatusSchema>

export const KenosWorkPriorityValues = ['low', 'normal', 'high', 'urgent'] as const
export const KenosWorkPrioritySchema = z.enum(KenosWorkPriorityValues)
export type KenosWorkPriority = z.infer<typeof KenosWorkPrioritySchema>

export const KenosWorkSourceRefSchema = z.object({
  sourceType: z.string().min(1).max(64),
  connectorId: z.string().min(1).max(64).optional(),
  externalId: z.string().min(1).max(200).optional(),
  deepLink: z.string().url().optional(),
  safeLabel: z.string().min(1).max(200),
  dataClassification: KenosClassificationSchema,
  freshness: KenosIsoDateTimeSchema.optional(),
  available: z.boolean().optional(),
}).superRefine((ref, ctx) => {
  if (KENOS_SENSITIVE_SUMMARY_PATTERN.test(ref.safeLabel)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['safeLabel'], message: 'safeLabel contains a sensitive credential marker' })
  }
})
export type KenosWorkSourceRef = z.infer<typeof KenosWorkSourceRefSchema>

export const KenosWorkPlanTaskProjectionSchema = z.object({
  taskRef: KenosEntityRefSchema,
  correlationId: KenosUuidSchema.optional(),
  safeTitle: z.string().min(1).max(200).optional(),
  completionProjection: z.enum(['open', 'done', 'unknown']).optional(),
  freshness: KenosIsoDateTimeSchema.optional(),
  deepLink: z.string().url().optional(),
}).strict().superRefine((projection, ctx) => {
  if (projection.taskRef.type !== 'plan.task' || projection.taskRef.ownerDomain !== 'plan') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['taskRef'], message: 'planTaskRefs must reference plan.task owned by plan' })
  }
  if (projection.safeTitle && KENOS_SENSITIVE_SUMMARY_PATTERN.test(projection.safeTitle)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['safeTitle'], message: 'safeTitle contains a sensitive credential marker' })
  }
})
export type KenosWorkPlanTaskProjection = z.infer<typeof KenosWorkPlanTaskProjectionSchema>

export const KenosWorkLibraryProjectionSchema = z.object({
  libraryRef: KenosEntityRefSchema,
  safeTitle: z.string().min(1).max(200).optional(),
  dataClassification: KenosClassificationSchema.optional(),
  freshness: KenosIsoDateTimeSchema.optional(),
  deepLink: z.string().url().optional(),
  sourceAvailable: z.boolean().optional(),
}).strict().superRefine((projection, ctx) => {
  if (projection.libraryRef.ownerDomain !== 'library') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['libraryRef'], message: 'libraryRefs must be owned by library' })
  }
  if (!projection.libraryRef.type.startsWith('library.')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['libraryRef'], message: 'libraryRefs type must start with library.' })
  }
  if (projection.safeTitle && KENOS_SENSITIVE_SUMMARY_PATTERN.test(projection.safeTitle)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['safeTitle'], message: 'safeTitle contains a sensitive credential marker' })
  }
})
export type KenosWorkLibraryProjection = z.infer<typeof KenosWorkLibraryProjectionSchema>

function refineWorkTimestamps(record: { createdAt: string, updatedAt: string }, ctx: z.RefinementCtx) {
  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['updatedAt'], message: 'updatedAt must not be earlier than createdAt' })
  }
}

function rejectSensitiveSummary(safeSummary: string, ctx: z.RefinementCtx) {
  if (KENOS_SENSITIVE_SUMMARY_PATTERN.test(safeSummary)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['safeSummary'], message: 'safeSummary contains a sensitive credential marker' })
  }
}

export const KenosWorkProjectSchema = z.object({
  id: KenosUuidSchema,
  version: KenosSchemaVersionSchema,
  ownerId: KenosUuidSchema,
  title: z.string().min(1).max(200),
  safeSummary: z.string().min(1).max(500),
  status: KenosWorkProjectStatusSchema,
  priority: KenosWorkPrioritySchema,
  startAt: KenosIsoDateTimeSchema.nullable().optional(),
  targetAt: KenosIsoDateTimeSchema.nullable().optional(),
  completedAt: KenosIsoDateTimeSchema.nullable().optional(),
  dataClassification: KenosClassificationSchema,
  sourceRefs: z.array(KenosWorkSourceRefSchema).default([]),
  libraryRefs: z.array(KenosWorkLibraryProjectionSchema).default([]),
  planTaskRefs: z.array(KenosWorkPlanTaskProjectionSchema).default([]),
  createdAt: KenosIsoDateTimeSchema,
  updatedAt: KenosIsoDateTimeSchema,
}).superRefine((record, ctx) => {
  refineWorkTimestamps(record, ctx)
  rejectSensitiveSummary(record.safeSummary, ctx)
  if (record.status === 'completed' && !record.completedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'completed projects require completedAt' })
  }
  if (record.status !== 'completed' && record.completedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'completedAt is only valid for completed projects' })
  }
})
export type KenosWorkProject = z.infer<typeof KenosWorkProjectSchema>

export const KenosWorkDeliverableSchema = z.object({
  id: KenosUuidSchema,
  version: KenosSchemaVersionSchema,
  projectRef: KenosEntityRefSchema,
  ownerId: KenosUuidSchema,
  title: z.string().min(1).max(200),
  safeSummary: z.string().min(1).max(500),
  status: KenosWorkDeliverableStatusSchema,
  targetAt: KenosIsoDateTimeSchema.nullable().optional(),
  acceptedAt: KenosIsoDateTimeSchema.nullable().optional(),
  dataClassification: KenosClassificationSchema,
  sourceRefs: z.array(KenosWorkSourceRefSchema).default([]),
  planTaskRefs: z.array(KenosWorkPlanTaskProjectionSchema).default([]),
  createdAt: KenosIsoDateTimeSchema,
  updatedAt: KenosIsoDateTimeSchema,
}).superRefine((record, ctx) => {
  refineWorkTimestamps(record, ctx)
  rejectSensitiveSummary(record.safeSummary, ctx)
  if (record.projectRef.type !== 'work.project' || record.projectRef.ownerDomain !== 'work') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectRef'], message: 'deliverable projectRef must be work.project owned by work' })
  }
  if (record.projectRef.ownerId !== record.ownerId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerId'], message: 'deliverable ownerId must match projectRef.ownerId' })
  }
  if (record.status === 'accepted' && !record.acceptedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['acceptedAt'], message: 'accepted deliverables require acceptedAt' })
  }
  if (record.status !== 'accepted' && record.acceptedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['acceptedAt'], message: 'acceptedAt is only valid for accepted deliverables' })
  }
})
export type KenosWorkDeliverable = z.infer<typeof KenosWorkDeliverableSchema>

export const KenosWorkMeetingSchema = z.object({
  id: KenosUuidSchema,
  version: KenosSchemaVersionSchema,
  projectRef: KenosEntityRefSchema,
  ownerId: KenosUuidSchema,
  title: z.string().min(1).max(200),
  occurredAt: KenosIsoDateTimeSchema.nullable().optional(),
  scheduledAt: KenosIsoDateTimeSchema.nullable().optional(),
  attendees: z.array(z.object({
    safeLabel: z.string().min(1).max(120),
    entityRef: KenosEntityRefSchema.optional(),
  })).default([]),
  safeSummary: z.string().min(1).max(500),
  dataClassification: KenosClassificationSchema,
  decisionRefs: z.array(KenosEntityRefSchema).default([]),
  actionProposalRefs: z.array(KenosEntityRefSchema).default([]),
  libraryRefs: z.array(KenosWorkLibraryProjectionSchema).default([]),
  sourceRefs: z.array(KenosWorkSourceRefSchema).default([]),
  createdAt: KenosIsoDateTimeSchema,
  updatedAt: KenosIsoDateTimeSchema,
}).superRefine((record, ctx) => {
  refineWorkTimestamps(record, ctx)
  rejectSensitiveSummary(record.safeSummary, ctx)
  if (record.projectRef.type !== 'work.project' || record.projectRef.ownerDomain !== 'work') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectRef'], message: 'meeting projectRef must be work.project owned by work' })
  }
  if (record.projectRef.ownerId !== record.ownerId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerId'], message: 'meeting ownerId must match projectRef.ownerId' })
  }
  if (!record.occurredAt && !record.scheduledAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduledAt'], message: 'meeting requires occurredAt or scheduledAt' })
  }
  for (const [index, ref] of record.decisionRefs.entries()) {
    if (ref.type !== 'work.decision' || ref.ownerDomain !== 'work') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionRefs', index], message: 'decisionRefs must be work.decision' })
    }
  }
  for (const [index, ref] of record.actionProposalRefs.entries()) {
    if (ref.type !== 'work.action_proposal' || ref.ownerDomain !== 'work') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actionProposalRefs', index], message: 'actionProposalRefs must be work.action_proposal' })
    }
  }
})
export type KenosWorkMeeting = z.infer<typeof KenosWorkMeetingSchema>

export const KenosWorkDecisionSchema = z.object({
  id: KenosUuidSchema,
  version: KenosSchemaVersionSchema,
  projectRef: KenosEntityRefSchema,
  meetingRef: KenosEntityRefSchema.nullable().optional(),
  ownerId: KenosUuidSchema,
  title: z.string().min(1).max(200),
  safeSummary: z.string().min(1).max(500),
  status: KenosWorkDecisionStatusSchema,
  decidedAt: KenosIsoDateTimeSchema.nullable().optional(),
  decidedBy: z.object({
    safeLabel: z.string().min(1).max(120),
    entityRef: KenosEntityRefSchema.optional(),
  }).nullable().optional(),
  supersedesDecisionRef: KenosEntityRefSchema.nullable().optional(),
  dataClassification: KenosClassificationSchema,
  entityRefs: z.array(KenosEntityRefSchema).default([]),
  createdAt: KenosIsoDateTimeSchema,
  updatedAt: KenosIsoDateTimeSchema,
}).superRefine((record, ctx) => {
  refineWorkTimestamps(record, ctx)
  rejectSensitiveSummary(record.safeSummary, ctx)
  if (record.projectRef.type !== 'work.project' || record.projectRef.ownerDomain !== 'work') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectRef'], message: 'decision projectRef must be work.project owned by work' })
  }
  if (record.projectRef.ownerId !== record.ownerId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerId'], message: 'decision ownerId must match projectRef.ownerId' })
  }
  if (record.meetingRef && (record.meetingRef.type !== 'work.meeting' || record.meetingRef.ownerDomain !== 'work')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['meetingRef'], message: 'meetingRef must be work.meeting owned by work' })
  }
  if (record.supersedesDecisionRef) {
    if (record.supersedesDecisionRef.type !== 'work.decision' || record.supersedesDecisionRef.ownerDomain !== 'work') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['supersedesDecisionRef'], message: 'supersedesDecisionRef must be work.decision' })
    }
    if (record.supersedesDecisionRef.id === record.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['supersedesDecisionRef'], message: 'decision cannot supersede itself' })
    }
  }
  if (record.status === 'decided' && (!record.decidedAt || !record.decidedBy)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decidedAt'], message: 'decided decisions require decidedAt and decidedBy' })
  }
  if (record.status === 'proposed' && (record.decidedAt || record.decidedBy)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'proposed decisions cannot contain decision metadata' })
  }
})
export type KenosWorkDecision = z.infer<typeof KenosWorkDecisionSchema>

export const KenosWorkActionProposalSchema = z.object({
  id: KenosUuidSchema,
  version: KenosSchemaVersionSchema,
  ownerId: KenosUuidSchema,
  workEntityRef: KenosEntityRefSchema,
  proposedTaskTitle: z.string().min(1).max(200),
  safeContext: z.string().min(1).max(500),
  suggestedDueAt: KenosIsoDateTimeSchema.nullable().optional(),
  suggestedPriority: KenosWorkPrioritySchema.optional(),
  risk: KenosRiskLevelSchema,
  status: KenosWorkActionProposalStatusSchema,
  planActionId: KenosUuidSchema.nullable().optional(),
  planTaskRef: KenosWorkPlanTaskProjectionSchema.nullable().optional(),
  dataClassification: KenosClassificationSchema,
  requestedAt: KenosIsoDateTimeSchema,
  resolvedAt: KenosIsoDateTimeSchema.nullable().optional(),
  correlationId: KenosUuidSchema,
  idempotencyKey: z.string().min(1).max(200),
  createdAt: KenosIsoDateTimeSchema,
  updatedAt: KenosIsoDateTimeSchema,
}).superRefine((record, ctx) => {
  refineWorkTimestamps(record, ctx)
  rejectSensitiveSummary(record.safeContext, ctx)
  if (KENOS_SENSITIVE_SUMMARY_PATTERN.test(record.proposedTaskTitle)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['proposedTaskTitle'], message: 'proposedTaskTitle contains a sensitive credential marker' })
  }
  if (record.workEntityRef.ownerDomain !== 'work') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['workEntityRef'], message: 'workEntityRef must be owned by work' })
  }
  if (!record.workEntityRef.type.startsWith('work.')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['workEntityRef'], message: 'workEntityRef type must start with work.' })
  }
  if (record.workEntityRef.ownerId !== record.ownerId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerId'], message: 'proposal ownerId must match workEntityRef.ownerId' })
  }
  if (record.status === 'converted') {
    if (!record.planTaskRef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['planTaskRef'], message: 'converted proposals require planTaskRef' })
    }
    if (!record.planActionId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['planActionId'], message: 'converted proposals require planActionId' })
    }
    if (!record.resolvedAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resolvedAt'], message: 'converted proposals require resolvedAt' })
    }
  }
  if (['rejected', 'expired', 'cancelled'].includes(record.status) && !record.resolvedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resolvedAt'], message: `${record.status} proposals require resolvedAt` })
  }
  if (['draft', 'proposed', 'accepted'].includes(record.status) && record.planTaskRef) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['planTaskRef'], message: 'non-converted proposals cannot embed a Plan Task ref as if converted' })
  }
})
export type KenosWorkActionProposal = z.infer<typeof KenosWorkActionProposalSchema>

export const KenosWorkActionProposalTransitions: Readonly<
  Record<KenosWorkActionProposalStatus, readonly KenosWorkActionProposalStatus[]>
> = {
  draft: ['proposed', 'cancelled'],
  proposed: ['accepted', 'rejected', 'expired', 'cancelled', 'converted'],
  accepted: ['converted', 'cancelled', 'expired'],
  rejected: [],
  expired: [],
  converted: [],
  cancelled: [],
}

export const KenosWorkActionProposalTransitionSchema = z.object({
  from: KenosWorkActionProposalStatusSchema,
  to: KenosWorkActionProposalStatusSchema,
}).superRefine((transition, ctx) => {
  if (!KenosWorkActionProposalTransitions[transition.from].includes(transition.to)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: `Invalid WorkActionProposal transition: ${transition.from} -> ${transition.to}`,
    })
  }
})
export type KenosWorkActionProposalTransition = z.infer<typeof KenosWorkActionProposalTransitionSchema>

export const KenosConnectorRegistryEntrySchema = z.object({
  connectorId: z.string().min(1).max(64),
  sourceType: z.string().min(1).max(64),
  permissions: z.array(z.string().min(1)).min(1),
  readWriteCapability: z.enum(['read_only', 'write_with_approval', 'disabled']),
  freshness: KenosIsoDateTimeSchema.nullable().optional(),
  authenticationStatus: z.enum(['unknown', 'authenticated', 'reauth_required', 'disabled']),
  dataClassification: KenosClassificationSchema,
  supportedCaptureTypes: z.array(z.string().min(1)).default([]),
  deepLink: z.string().url().optional(),
  owner: KenosDomainSchema,
  failureState: z.enum(['none', 'rate_limited', 'schema_changed', 'auth_failed', 'unavailable']).default('none'),
}).superRefine((entry, ctx) => {
  if (entry.readWriteCapability !== 'read_only' && entry.failureState === 'none') {
    // Phase 3 foundation inventory allows non-read_only capability labels only when explicitly disabled or gated.
    if (entry.readWriteCapability === 'write_with_approval' && entry.authenticationStatus === 'disabled') return
  }
})
export type KenosConnectorRegistryEntry = z.infer<typeof KenosConnectorRegistryEntrySchema>
