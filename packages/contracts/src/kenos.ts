import { z } from 'zod'

export const KenosDomainSchema = z.enum([
  'assistant',
  'plan',
  'library',
  'training',
  'money',
  'health',
  'home',
  'music',
  'paper',
  'system',
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

export const KenosOutboxStatusSchema = z.enum(['pending', 'processing', 'delivered', 'retry', 'terminal'])
export type KenosOutboxStatus = z.infer<typeof KenosOutboxStatusSchema>

export const KenosErrorClassSchema = z.enum(['transient', 'permanent'])
export type KenosErrorClass = z.infer<typeof KenosErrorClassSchema>

export const KenosEntityRefSchema = z.object({
  domain: KenosDomainSchema,
  type: z.string().min(1),
  id: z.string().min(1),
  ownerDomain: KenosDomainSchema,
  version: z.number().int().nonnegative().optional(),
  securityDomain: KenosSecurityDomainSchema,
  classification: KenosClassificationSchema,
})
export type KenosEntityRef = z.infer<typeof KenosEntityRefSchema>

export const KenosActionRequestSchema = z.object({
  schemaVersion: z.literal(1),
  actionId: z.string().min(1),
  actionType: z.string().min(1),
  producer: KenosDomainSchema,
  targetDomain: KenosDomainSchema,
  actor: z.object({ type: z.enum(['user', 'assistant', 'system']), userId: z.string().min(1).optional() }),
  idempotencyKey: z.string().min(1),
  correlationId: z.string().min(1),
  securityDomain: KenosSecurityDomainSchema,
  classification: KenosClassificationSchema,
  risk: KenosRiskLevelSchema,
  approval: z.object({ state: KenosApprovalStateSchema, approvalId: z.string().min(1).optional() }),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
})
export type KenosActionRequest = z.infer<typeof KenosActionRequestSchema>

export const KenosActionDecisionSchema = z.object({
  allowed: z.boolean(),
  risk: KenosRiskLevelSchema,
  approvalState: KenosApprovalStateSchema,
  reason: z.string().min(1),
  decidedAt: z.string().datetime(),
})
export type KenosActionDecision = z.infer<typeof KenosActionDecisionSchema>

export const KenosActionResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    actionId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    correlationId: z.string().min(1),
    entityRef: KenosEntityRefSchema,
    duplicate: z.boolean(),
    activityId: z.string().min(1),
    outboxId: z.string().min(1),
  }),
  z.object({
    ok: z.literal(false),
    actionId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1).optional(),
    correlationId: z.string().min(1).optional(),
    error: z.object({ code: z.string().min(1), message: z.string().min(1), class: KenosErrorClassSchema }),
  }),
])
export type KenosActionResult = z.infer<typeof KenosActionResultSchema>

export const KenosActivityRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  actionId: z.string().min(1),
  actionType: z.string().min(1),
  correlationId: z.string().min(1),
  actorType: z.enum(['user', 'assistant', 'system']),
  source: KenosDomainSchema,
  policy: KenosActionDecisionSchema,
  entityRef: KenosEntityRefSchema.optional(),
  summary: z.string().min(1),
  redactedPayload: z.record(z.unknown()),
  undo: z.object({ supported: z.boolean(), actionType: z.string().min(1).optional() }),
  createdAt: z.string().datetime(),
})
export type KenosActivityRecord = z.infer<typeof KenosActivityRecordSchema>

export const KenosOutboxRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  actionId: z.string().min(1),
  actionType: z.string().min(1),
  idempotencyKey: z.string().min(1),
  correlationId: z.string().min(1),
  entityRef: KenosEntityRefSchema,
  status: KenosOutboxStatusSchema,
  payload: z.record(z.unknown()),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  nextAttemptAt: z.string().datetime(),
  lastErrorClass: KenosErrorClassSchema.optional(),
  terminalReason: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type KenosOutboxRecord = z.infer<typeof KenosOutboxRecordSchema>

export const KenosCaptureEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  captureId: z.string().min(1),
  source: KenosDomainSchema,
  securityDomain: KenosSecurityDomainSchema,
  classification: KenosClassificationSchema,
  provenance: z.object({ url: z.string().url().optional(), capturedAt: z.string().datetime() }),
  payload: z.record(z.unknown()),
})
export type KenosCaptureEnvelope = z.infer<typeof KenosCaptureEnvelopeSchema>
