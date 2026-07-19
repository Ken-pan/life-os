import { z } from 'zod'

export const KenosSchemaVersionSchema = z.literal('1')
export type KenosSchemaVersion = z.infer<typeof KenosSchemaVersionSchema>

export const KenosUuidSchema = z.string().uuid()
export const KenosIsoDateTimeSchema = z.string().datetime()

export const KenosDomainSchema = z.enum([
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
])
export type KenosDomain = z.infer<typeof KenosDomainSchema>

export const KenosSecurityDomainSchema = z.enum(['personal', 'work', 'household', 'system'])
export type KenosSecurityDomain = z.infer<typeof KenosSecurityDomainSchema>

export const KenosClassificationSchema = z.enum([
  'public',
  'personal',
  'sensitive',
  'work_confidential',
  'restricted_local_only',
  'ephemeral',
])
export type KenosClassification = z.infer<typeof KenosClassificationSchema>

export const KenosRiskLevelSchema = z.enum(['R0', 'R1', 'R2', 'R3', 'R4'])
export type KenosRiskLevel = z.infer<typeof KenosRiskLevelSchema>

export const KenosApprovalStateSchema = z.enum(['not_required', 'preview_required', 'approved', 'rejected', 'expired'])
export type KenosApprovalState = z.infer<typeof KenosApprovalStateSchema>

export const KenosOutboxStatusSchema = z.enum(['pending', 'processing', 'published', 'retry', 'dead_letter'])
export type KenosOutboxStatus = z.infer<typeof KenosOutboxStatusSchema>

export const KenosErrorClassSchema = z.enum(['transient', 'permanent'])
export type KenosErrorClass = z.infer<typeof KenosErrorClassSchema>

export const KenosActorSchema = z.object({
  type: z.enum(['user', 'assistant', 'automation', 'connector', 'system']),
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

export const KenosActionDecisionSchema = z.object({
  requestId: KenosUuidSchema,
  outcome: z.enum(['allow', 'require_approval', 'deny', 'expired']),
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

export const KenosActionResultSchema = z.object({
  requestId: KenosUuidSchema,
  status: z.enum(['succeeded', 'failed', 'queued', 'conflict', 'cancelled']),
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
  result: z.enum(['succeeded', 'failed', 'queued', 'undone', 'cancelled']),
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
