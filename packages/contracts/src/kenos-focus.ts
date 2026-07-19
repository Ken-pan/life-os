/**
 * Phase 5 Focus / Contextual Intelligence contracts (additive, schemaVersion "1").
 * System/Platform owns FocusContext; domains keep session truth behind EntityRef only.
 */
import { z } from 'zod'
import {
  KenosClassificationSchema,
  KenosDomainSchema,
  KenosEntityRefSchema,
  KenosIsoDateTimeSchema,
  KenosRiskLevelSchema,
  KenosSchemaVersionSchema,
  KenosUuidSchema,
} from './kenos.ts'

const KENOS_SENSITIVE_SUMMARY_PATTERN = /\b(token|secret|password|authorization|cookie|bearer)\b/i

function rejectSensitive(path: string, value: string, ctx: z.RefinementCtx) {
  if (KENOS_SENSITIVE_SUMMARY_PATTERN.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: `${path} contains a sensitive credential marker`,
    })
  }
}

function refineTimestamps(record: { createdAt: string; updatedAt: string }, ctx: z.RefinementCtx) {
  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['updatedAt'],
      message: 'updatedAt must not be earlier than createdAt',
    })
  }
}

export const KenosFocusModeValues = [
  'training',
  'deep_work',
  'meeting',
  'reading',
  'home_organizing',
  'finance_review',
  'wind_down',
  'custom',
] as const
export const KenosFocusModeSchema = z.enum(KenosFocusModeValues)
export type KenosFocusMode = z.infer<typeof KenosFocusModeSchema>

export const KenosFocusStatusValues = [
  'inactive',
  'starting',
  'active',
  'temporarily_left',
  'paused',
  'ending',
  'completed',
  'cancelled',
] as const
export const KenosFocusStatusSchema = z.enum(KenosFocusStatusValues)
export type KenosFocusStatus = z.infer<typeof KenosFocusStatusSchema>

export const KenosFocusSourceValues = [
  'user',
  'assistant_suggestion',
  'apple_focus_suggestion',
  'system',
  'deep_link',
] as const
export const KenosFocusSourceSchema = z.enum(KenosFocusSourceValues)
export type KenosFocusSource = z.infer<typeof KenosFocusSourceSchema>

export const KenosAssistantScopeSchema = z.object({
  mode: KenosFocusModeSchema,
  allowedDomains: z.array(KenosDomainSchema).min(1),
  allowExplicitCrossDomain: z.boolean().default(true),
  proactiveCrossDomain: z.boolean().default(false),
  toolsAllowlist: z.array(z.string().min(1)).default([]),
  notes: z.string().max(500).optional(),
}).strict()
export type KenosAssistantScope = z.infer<typeof KenosAssistantScopeSchema>

export const KenosFocusReturnDestinationSchema = z.object({
  kind: z.enum(['today', 'spaces', 'space', 'session', 'route']),
  space: KenosDomainSchema.optional(),
  route: z.string().min(1).max(200).optional(),
  sessionRef: KenosEntityRefSchema.optional(),
  label: z.string().min(1).max(120),
}).strict()
export type KenosFocusReturnDestination = z.infer<typeof KenosFocusReturnDestinationSchema>

export const KenosFocusContextSchema = z
  .object({
    id: KenosUuidSchema,
    version: KenosSchemaVersionSchema,
    ownerId: KenosUuidSchema,
    mode: KenosFocusModeSchema,
    activeSpace: KenosDomainSchema,
    activeSessionRef: KenosEntityRefSchema.nullable().optional(),
    startedAt: KenosIsoDateTimeSchema.nullable().optional(),
    expectedEndAt: KenosIsoDateTimeSchema.nullable().optional(),
    pausedAt: KenosIsoDateTimeSchema.nullable().optional(),
    endedAt: KenosIsoDateTimeSchema.nullable().optional(),
    status: KenosFocusStatusSchema,
    visibleDomains: z.array(KenosDomainSchema).min(1),
    hiddenDomains: z.array(KenosDomainSchema).default([]),
    allowedInterruptionCategories: z.array(z.string().min(1)).min(1),
    assistantScope: KenosAssistantScopeSchema,
    notificationPolicyRef: z.string().min(1).max(120),
    deferredQueueRef: KenosUuidSchema,
    returnDestination: KenosFocusReturnDestinationSchema,
    source: KenosFocusSourceSchema,
    classification: KenosClassificationSchema,
    title: z.string().min(1).max(120),
    safeSummary: z.string().min(1).max(500),
    correlationId: KenosUuidSchema,
    createdAt: KenosIsoDateTimeSchema,
    updatedAt: KenosIsoDateTimeSchema,
  })
  .strict()
  .superRefine((record, ctx) => {
    refineTimestamps(record, ctx)
    rejectSensitive('safeSummary', record.safeSummary, ctx)
    rejectSensitive('title', record.title, ctx)
    if (record.activeSessionRef) {
      if (record.activeSessionRef.ownerId !== record.ownerId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['activeSessionRef'],
          message: 'activeSessionRef.ownerId must match FocusContext.ownerId',
        })
      }
    }
    if (['active', 'paused', 'temporarily_left', 'ending'].includes(record.status) && !record.startedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startedAt'],
        message: `${record.status} FocusContext requires startedAt`,
      })
    }
    if (['completed', 'cancelled'].includes(record.status) && !record.endedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endedAt'],
        message: `${record.status} FocusContext requires endedAt`,
      })
    }
    if (record.status === 'inactive' && (record.startedAt || record.endedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'inactive FocusContext cannot carry startedAt/endedAt',
      })
    }
    const overlap = record.visibleDomains.filter((d) => record.hiddenDomains.includes(d))
    if (overlap.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hiddenDomains'],
        message: 'hiddenDomains must not overlap visibleDomains',
      })
    }
    if (!record.visibleDomains.includes(record.activeSpace)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['visibleDomains'],
        message: 'visibleDomains must include activeSpace',
      })
    }
    if (record.assistantScope.mode !== record.mode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assistantScope', 'mode'],
        message: 'assistantScope.mode must match FocusContext.mode',
      })
    }
  })
export type KenosFocusContext = z.infer<typeof KenosFocusContextSchema>

/** Legal Focus status transitions. Unknown/illegal transitions fail closed. */
export const KenosFocusStatusTransitions: Readonly<
  Record<KenosFocusStatus, readonly KenosFocusStatus[]>
> = {
  inactive: ['starting'],
  starting: ['active', 'cancelled'],
  active: ['paused', 'temporarily_left', 'ending', 'cancelled'],
  temporarily_left: ['active', 'ending', 'cancelled'],
  paused: ['active', 'ending', 'cancelled'],
  ending: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export const KenosFocusStatusTransitionSchema = z
  .object({
    from: KenosFocusStatusSchema,
    to: KenosFocusStatusSchema,
  })
  .superRefine((transition, ctx) => {
    if (!KenosFocusStatusTransitions[transition.from].includes(transition.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `Invalid Focus transition: ${transition.from} -> ${transition.to}`,
      })
    }
  })
export type KenosFocusStatusTransition = z.infer<typeof KenosFocusStatusTransitionSchema>

export const KenosInterruptionHandlingValues = [
  'show_now',
  'quiet_indicator',
  'defer',
  'suppress_until_end',
  'require_user_override',
  'always_allow',
] as const
export const KenosInterruptionHandlingSchema = z.enum(KenosInterruptionHandlingValues)
export type KenosInterruptionHandling = z.infer<typeof KenosInterruptionHandlingSchema>

export const KenosInterruptionUrgencyValues = ['low', 'normal', 'high', 'critical'] as const
export const KenosInterruptionUrgencySchema = z.enum(KenosInterruptionUrgencyValues)
export type KenosInterruptionUrgency = z.infer<typeof KenosInterruptionUrgencySchema>

export const KenosInterruptionCandidateSchema = z
  .object({
    id: KenosUuidSchema,
    ownerId: KenosUuidSchema,
    focusContextId: KenosUuidSchema.nullable().optional(),
    sourceDomain: KenosDomainSchema,
    category: z.string().min(1).max(64),
    urgency: KenosInterruptionUrgencySchema,
    risk: KenosRiskLevelSchema,
    classification: KenosClassificationSchema,
    createdAt: KenosIsoDateTimeSchema,
    expiry: KenosIsoDateTimeSchema.nullable().optional(),
    relatedEntityRef: KenosEntityRefSchema.nullable().optional(),
    recommendedHandling: KenosInterruptionHandlingSchema,
    explanation: z.string().min(1).max(500),
    safeSummary: z.string().min(1).max(300),
  })
  .strict()
  .superRefine((record, ctx) => {
    rejectSensitive('explanation', record.explanation, ctx)
    rejectSensitive('safeSummary', record.safeSummary, ctx)
  })
export type KenosInterruptionCandidate = z.infer<typeof KenosInterruptionCandidateSchema>

export const KenosDeferredItemStatusValues = [
  'pending',
  'released',
  'dismissed',
  'expired',
  'superseded',
] as const
export const KenosDeferredItemStatusSchema = z.enum(KenosDeferredItemStatusValues)
export type KenosDeferredItemStatus = z.infer<typeof KenosDeferredItemStatusSchema>

export const KenosDeferredItemSchema = z
  .object({
    id: KenosUuidSchema,
    ownerId: KenosUuidSchema,
    focusContextId: KenosUuidSchema,
    sourceDomain: KenosDomainSchema,
    sourceEntityRef: KenosEntityRefSchema.nullable().optional(),
    category: z.string().min(1).max(64),
    safeSummary: z.string().min(1).max(300),
    classification: KenosClassificationSchema,
    originalCreatedAt: KenosIsoDateTimeSchema,
    deferredAt: KenosIsoDateTimeSchema,
    releaseAt: KenosIsoDateTimeSchema.nullable().optional(),
    expiry: KenosIsoDateTimeSchema.nullable().optional(),
    urgency: KenosInterruptionUrgencySchema,
    status: KenosDeferredItemStatusSchema,
    reason: z.string().min(1).max(300),
    correlationId: KenosUuidSchema,
  })
  .strict()
  .superRefine((record, ctx) => {
    rejectSensitive('safeSummary', record.safeSummary, ctx)
    rejectSensitive('reason', record.reason, ctx)
    if (record.sourceEntityRef && record.sourceEntityRef.ownerId !== record.ownerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceEntityRef'],
        message: 'sourceEntityRef.ownerId must match DeferredItem.ownerId',
      })
    }
  })
export type KenosDeferredItem = z.infer<typeof KenosDeferredItemSchema>

export const KenosProactiveSuggestionStatusValues = [
  'generated',
  'shown',
  'accepted',
  'dismissed',
  'expired',
  'superseded',
  'converted_to_action',
  'failed',
] as const
export const KenosProactiveSuggestionStatusSchema = z.enum(KenosProactiveSuggestionStatusValues)
export type KenosProactiveSuggestionStatus = z.infer<typeof KenosProactiveSuggestionStatusSchema>

export const KenosProactiveSuggestionSchema = z
  .object({
    id: KenosUuidSchema,
    version: KenosSchemaVersionSchema,
    ownerId: KenosUuidSchema,
    source: z.enum(['rule', 'session', 'assistant', 'system', 'apple_focus']),
    targetDomain: KenosDomainSchema,
    focusContextId: KenosUuidSchema.nullable().optional(),
    suggestionType: z.string().min(1).max(64),
    title: z.string().min(1).max(120),
    safeSummary: z.string().min(1).max(400),
    rationale: z.string().min(1).max(500),
    evidenceRefs: z.array(KenosEntityRefSchema).default([]),
    confidence: z.number().min(0).max(1),
    risk: KenosRiskLevelSchema,
    proposedAction: z
      .object({
        actionType: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/).nullable().optional(),
        writes: z.boolean(),
        requiresApproval: z.boolean(),
        reversibleHint: z.string().min(1).max(200).optional(),
      })
      .strict(),
    approvalRequirement: z.enum(['none', 'confirm', 'strong_confirm', 'fail_closed']),
    createdAt: KenosIsoDateTimeSchema,
    expiresAt: KenosIsoDateTimeSchema.nullable().optional(),
    status: KenosProactiveSuggestionStatusSchema,
    dismissalReason: z.string().max(300).nullable().optional(),
    feedback: z.string().max(300).nullable().optional(),
    classification: KenosClassificationSchema,
    correlationId: KenosUuidSchema,
    whyNow: z.string().min(1).max(300),
    signalsUsed: z.array(z.string().min(1)).min(1),
    impactSummary: z.string().min(1).max(300),
  })
  .strict()
  .superRefine((record, ctx) => {
    rejectSensitive('title', record.title, ctx)
    rejectSensitive('safeSummary', record.safeSummary, ctx)
    rejectSensitive('rationale', record.rationale, ctx)
    if (record.risk === 'R4' && record.approvalRequirement !== 'fail_closed') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approvalRequirement'],
        message: 'R4 suggestions must fail closed',
      })
    }
    if (['R3', 'R4'].includes(record.risk) && record.approvalRequirement === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approvalRequirement'],
        message: 'R3/R4 suggestions cannot skip approval',
      })
    }
    if (record.proposedAction.writes && record.approvalRequirement === 'none' && record.risk !== 'R0') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proposedAction'],
        message: 'write-producing suggestions require approval unless R0 observe-only',
      })
    }
  })
export type KenosProactiveSuggestion = z.infer<typeof KenosProactiveSuggestionSchema>

export const KenosInterventionBudgetSchema = z
  .object({
    id: KenosUuidSchema,
    ownerId: KenosUuidSchema,
    focusContextId: KenosUuidSchema.nullable().optional(),
    maxSuggestionsPerSession: z.number().int().min(0).max(20).default(2),
    cooldownSeconds: z.number().int().min(0).default(900),
    repeatedDismissalSuppression: z.number().int().min(1).max(10).default(2),
    quietHours: z
      .object({
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(0).max(23),
      })
      .nullable()
      .optional(),
    urgencyThreshold: KenosInterruptionUrgencySchema.default('high'),
    groupedRelease: z.boolean().default(true),
    shownNonUrgentCount: z.number().int().min(0).default(0),
    lastShownAt: KenosIsoDateTimeSchema.nullable().optional(),
    dismissedTypes: z.record(z.number().int().min(0)).default({}),
  })
  .strict()
export type KenosInterventionBudget = z.infer<typeof KenosInterventionBudgetSchema>

export const KenosSessionSummarySchema = z
  .object({
    id: KenosUuidSchema,
    focusContextId: KenosUuidSchema,
    ownerId: KenosUuidSchema,
    mode: KenosFocusModeSchema,
    activeSpace: KenosDomainSchema,
    activeSessionRef: KenosEntityRefSchema.nullable().optional(),
    durationSeconds: z.number().int().min(0),
    completedActions: z.array(z.string().min(1)).default([]),
    progress: z.string().min(1).max(400),
    notes: z.string().max(1000).nullable().optional(),
    deferredItemCounts: z.record(z.number().int().min(0)).default({}),
    releasedUrgentCount: z.number().int().min(0).default(0),
    errors: z.array(z.string().min(1)).default([]),
    nextRecommendedStep: z.string().min(1).max(300),
    activityRefs: z.array(KenosUuidSchema).default([]),
    createdAt: KenosIsoDateTimeSchema,
  })
  .strict()
  .superRefine((record, ctx) => {
    rejectSensitive('progress', record.progress, ctx)
    rejectSensitive('nextRecommendedStep', record.nextRecommendedStep, ctx)
  })
export type KenosSessionSummary = z.infer<typeof KenosSessionSummarySchema>

export const KenosAppleFocusHintSchema = z
  .object({
    systemFocus: z.enum(['fitness', 'work', 'sleep', 'personal', 'other']),
    suggestedMode: KenosFocusModeSchema,
    autoEnter: z.boolean().default(false),
    requiresUserConfirm: z.boolean().default(true),
  })
  .strict()
  .superRefine((hint, ctx) => {
    if (hint.autoEnter && hint.requiresUserConfirm) {
      // autoEnter only after explicit user preference; still confirm first time
    }
    if (!hint.requiresUserConfirm && !hint.autoEnter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requiresUserConfirm'],
        message: 'non-auto Apple Focus hints must require user confirm',
      })
    }
  })
export type KenosAppleFocusHint = z.infer<typeof KenosAppleFocusHintSchema>
