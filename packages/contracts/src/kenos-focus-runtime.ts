/**
 * Phase 5 Focus runtime — pure, local, fail-closed.
 * No production Executor / notifications / domain canonical writes.
 */
import { randomUUID } from 'node:crypto'
import type { KenosClassification, KenosDomain, KenosEntityRef, KenosRiskLevel } from './kenos.ts'
import {
  KenosDeferredItemSchema,
  KenosFocusContextSchema,
  KenosFocusStatusTransitions,
  KenosInterruptionCandidateSchema,
  KenosProactiveSuggestionSchema,
  KenosSessionSummarySchema,
  type KenosAssistantScope,
  type KenosDeferredItem,
  type KenosFocusContext,
  type KenosFocusMode,
  type KenosFocusReturnDestination,
  type KenosFocusSource,
  type KenosFocusStatus,
  type KenosInterruptionCandidate,
  type KenosInterruptionHandling,
  type KenosInterruptionUrgency,
  type KenosInterventionBudget,
  type KenosProactiveSuggestion,
  type KenosSessionSummary,
} from './kenos-focus.ts'

export type FocusRuntimeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

const nowIso = (at?: string) => at ?? new Date().toISOString()

export function canTransitionFocusStatus(from: KenosFocusStatus, to: KenosFocusStatus): boolean {
  return KenosFocusStatusTransitions[from].includes(to)
}

/** Mode presets: visible domains + interruption allowlist. Unknown mode fail closed. */
export function focusModePolicy(mode: KenosFocusMode): {
  activeSpace: KenosDomain
  visibleDomains: KenosDomain[]
  hiddenDomains: KenosDomain[]
  allowedInterruptionCategories: string[]
  assistantScope: KenosAssistantScope
  notificationPolicyRef: string
} {
  switch (mode) {
    case 'training':
      return {
        activeSpace: 'training',
        visibleDomains: ['training', 'health', 'system'],
        hiddenDomains: ['work', 'money', 'home', 'library', 'plan', 'music'],
        allowedInterruptionCategories: [
          'workout_timer',
          'training_guidance',
          'health_safety',
          'whitelisted_contact',
          'system_critical',
        ],
        assistantScope: {
          mode: 'training',
          allowedDomains: ['training', 'health', 'music'],
          allowExplicitCrossDomain: true,
          proactiveCrossDomain: false,
          toolsAllowlist: [
            'training.next_exercise',
            'training.rest_timer',
            'training.log_pain',
            'training.notes',
            'music.session',
          ],
        },
        notificationPolicyRef: 'focus.training.v1',
      }
    case 'deep_work':
      return {
        activeSpace: 'work',
        visibleDomains: ['work', 'plan', 'library', 'system'],
        hiddenDomains: ['training', 'money', 'home', 'health', 'music'],
        allowedInterruptionCategories: [
          'current_work_context',
          'active_meeting',
          'user_selected_communication',
          'system_critical',
        ],
        assistantScope: {
          mode: 'deep_work',
          allowedDomains: ['work', 'plan', 'library'],
          allowExplicitCrossDomain: true,
          proactiveCrossDomain: false,
          toolsAllowlist: [
            'work.current_project',
            'work.recent_decision',
            'plan.current_task',
            'library.related',
          ],
        },
        notificationPolicyRef: 'focus.deep_work.v1',
      }
    case 'meeting':
      return {
        activeSpace: 'work',
        visibleDomains: ['work', 'plan', 'system'],
        hiddenDomains: ['training', 'money', 'home', 'library', 'music'],
        allowedInterruptionCategories: ['active_meeting', 'system_critical'],
        assistantScope: {
          mode: 'meeting',
          allowedDomains: ['work', 'plan'],
          allowExplicitCrossDomain: true,
          proactiveCrossDomain: false,
          toolsAllowlist: ['work.meeting_notes', 'work.action_proposal_draft'],
        },
        notificationPolicyRef: 'focus.meeting.v1',
      }
    case 'reading':
      return {
        activeSpace: 'library',
        visibleDomains: ['library', 'system'],
        hiddenDomains: ['work', 'money', 'home', 'training', 'plan'],
        allowedInterruptionCategories: ['reading_context', 'system_critical'],
        assistantScope: {
          mode: 'reading',
          allowedDomains: ['library'],
          allowExplicitCrossDomain: true,
          proactiveCrossDomain: false,
          toolsAllowlist: ['library.current', 'library.notes'],
        },
        notificationPolicyRef: 'focus.reading.v1',
      }
    case 'home_organizing':
      return {
        activeSpace: 'home',
        visibleDomains: ['home', 'system'],
        hiddenDomains: ['work', 'money', 'training', 'library', 'plan'],
        allowedInterruptionCategories: ['home_task', 'household_safety', 'system_critical'],
        assistantScope: {
          mode: 'home_organizing',
          allowedDomains: ['home'],
          allowExplicitCrossDomain: true,
          proactiveCrossDomain: false,
          toolsAllowlist: ['home.session', 'home.item_locate'],
        },
        notificationPolicyRef: 'focus.home_organizing.v1',
      }
    case 'finance_review':
      return {
        activeSpace: 'money',
        visibleDomains: ['money', 'system'],
        hiddenDomains: ['work', 'training', 'home', 'library', 'plan'],
        allowedInterruptionCategories: ['finance_review', 'system_critical'],
        assistantScope: {
          mode: 'finance_review',
          allowedDomains: ['money'],
          allowExplicitCrossDomain: true,
          proactiveCrossDomain: false,
          toolsAllowlist: ['money.review', 'money.stale_source'],
        },
        notificationPolicyRef: 'focus.finance_review.v1',
      }
    case 'wind_down':
      return {
        activeSpace: 'health',
        visibleDomains: ['health', 'system'],
        hiddenDomains: ['work', 'money', 'plan', 'library', 'training'],
        allowedInterruptionCategories: [
          'sleep_safety',
          'health_safety',
          'alarm',
          'household_safety',
          'system_critical',
        ],
        assistantScope: {
          mode: 'wind_down',
          allowedDomains: ['health', 'home'],
          allowExplicitCrossDomain: true,
          proactiveCrossDomain: false,
          toolsAllowlist: ['health.sleep', 'health.safety'],
        },
        notificationPolicyRef: 'focus.wind_down.v1',
      }
    case 'custom':
      return {
        activeSpace: 'system',
        visibleDomains: ['system'],
        hiddenDomains: ['work', 'money', 'home', 'training', 'library', 'plan'],
        allowedInterruptionCategories: ['system_critical', 'user_override'],
        assistantScope: {
          mode: 'custom',
          allowedDomains: ['system'],
          allowExplicitCrossDomain: true,
          proactiveCrossDomain: false,
          toolsAllowlist: [],
        },
        notificationPolicyRef: 'focus.custom.v1',
      }
    default: {
      const _exhaustive: never = mode
      throw new Error(`Unknown focus mode fail-closed: ${_exhaustive}`)
    }
  }
}

export function createFocusContext(input: {
  ownerId: string
  mode: KenosFocusMode
  title: string
  safeSummary: string
  activeSessionRef?: KenosEntityRef | null
  source?: KenosFocusSource
  classification?: KenosClassification
  returnDestination?: KenosFocusReturnDestination
  expectedEndAt?: string | null
  at?: string
}): FocusRuntimeResult<KenosFocusContext> {
  const policy = focusModePolicy(input.mode)
  const at = nowIso(input.at)
  const id = randomUUID()
  const draft: KenosFocusContext = {
    id,
    version: '1',
    ownerId: input.ownerId,
    mode: input.mode,
    activeSpace: policy.activeSpace,
    activeSessionRef: input.activeSessionRef ?? null,
    startedAt: null,
    expectedEndAt: input.expectedEndAt ?? null,
    pausedAt: null,
    endedAt: null,
    status: 'inactive',
    visibleDomains: policy.visibleDomains,
    hiddenDomains: policy.hiddenDomains,
    allowedInterruptionCategories: policy.allowedInterruptionCategories,
    assistantScope: policy.assistantScope,
    notificationPolicyRef: policy.notificationPolicyRef,
    deferredQueueRef: randomUUID(),
    returnDestination:
      input.returnDestination ??
      ({
        kind: 'space',
        space: policy.activeSpace,
        label: `Return to ${policy.activeSpace}`,
      } satisfies KenosFocusReturnDestination),
    source: input.source ?? 'user',
    classification: input.classification ?? 'personal',
    title: input.title,
    safeSummary: input.safeSummary,
    correlationId: randomUUID(),
    createdAt: at,
    updatedAt: at,
  }
  const parsed = KenosFocusContextSchema.safeParse(draft)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  return { ok: true, value: parsed.data }
}

export function transitionFocus(
  focus: KenosFocusContext,
  to: KenosFocusStatus,
  at?: string,
): FocusRuntimeResult<KenosFocusContext> {
  if (!canTransitionFocusStatus(focus.status, to)) {
    // Idempotent no-ops for repeated start/end style requests
    if (focus.status === to) return { ok: true, value: focus }
    if (focus.status === 'completed' && to === 'completed') return { ok: true, value: focus }
    if (focus.status === 'cancelled' && to === 'cancelled') return { ok: true, value: focus }
    return { ok: false, error: `Illegal Focus transition: ${focus.status} -> ${to}` }
  }
  const stamp = nowIso(at)
  const next: KenosFocusContext = { ...focus, status: to, updatedAt: stamp }
  if (to === 'starting') {
    next.endedAt = null
  }
  if (to === 'active') {
    next.startedAt = focus.startedAt ?? stamp
    next.pausedAt = null
  }
  if (to === 'paused') {
    next.pausedAt = stamp
  }
  if (to === 'temporarily_left') {
    // keep startedAt; navigation may restore global IA
  }
  if (to === 'ending' || to === 'completed' || to === 'cancelled') {
    if (to === 'completed' || to === 'cancelled') {
      next.endedAt = stamp
      next.pausedAt = null
    }
  }
  const parsed = KenosFocusContextSchema.safeParse(next)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  return { ok: true, value: parsed.data }
}

/** Start a Focus: inactive→starting→active. Rejects if another foreground Focus exists. */
export function startFocusSession(
  existingForeground: KenosFocusContext | null,
  input: Parameters<typeof createFocusContext>[0],
): FocusRuntimeResult<KenosFocusContext> {
  if (existingForeground && isForegroundFocus(existingForeground)) {
    return {
      ok: false,
      error: 'Foreground Focus already active; resolve it before starting another',
    }
  }
  const created = createFocusContext(input)
  if (!created.ok) return created
  const starting = transitionFocus(created.value, 'starting', input.at)
  if (!starting.ok) return starting
  return transitionFocus(starting.value, 'active', input.at)
}

export function isForegroundFocus(focus: KenosFocusContext): boolean {
  return ['starting', 'active', 'paused', 'temporarily_left', 'ending'].includes(focus.status)
}

export function hidesGlobalNavigation(focus: KenosFocusContext | null): boolean {
  return !!focus && focus.status === 'active'
}

/**
 * Platform interruption policy. Clients must not invent show_now for deferred categories.
 */
export function evaluateInterruption(
  focus: KenosFocusContext | null,
  candidate: KenosInterruptionCandidate,
): FocusRuntimeResult<{ handling: KenosInterruptionHandling; reason: string }> {
  const parsed = KenosInterruptionCandidateSchema.safeParse(candidate)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  if (!focus || !isForegroundFocus(focus) || focus.status === 'temporarily_left') {
    return { ok: true, value: { handling: 'show_now', reason: 'No active Focus barrier' } }
  }

  if (candidate.urgency === 'critical' || candidate.category === 'system_critical') {
    return { ok: true, value: { handling: 'always_allow', reason: 'System-critical interruption' } }
  }
  if (candidate.category === 'health_safety' || candidate.category === 'sleep_safety') {
    return { ok: true, value: { handling: 'always_allow', reason: 'Safety interruption' } }
  }

  if (focus.allowedInterruptionCategories.includes(candidate.category)) {
    return { ok: true, value: { handling: 'show_now', reason: 'Category allowlisted for Focus mode' } }
  }

  if (focus.mode === 'wind_down') {
    if (['work', 'money', 'plan'].includes(candidate.sourceDomain)) {
      return {
        ok: true,
        value: { handling: 'suppress_until_end', reason: 'Wind-down hides Work/Money/project status' },
      }
    }
  }

  if (focus.hiddenDomains.includes(candidate.sourceDomain)) {
    if (candidate.urgency === 'high' && candidate.risk === 'R3') {
      return {
        ok: true,
        value: { handling: 'require_user_override', reason: 'High-urgency hidden-domain item' },
      }
    }
    return {
      ok: true,
      value: { handling: 'defer', reason: `Deferred: ${candidate.sourceDomain} hidden in ${focus.mode}` },
    }
  }

  if (!focus.visibleDomains.includes(candidate.sourceDomain) && candidate.sourceDomain !== 'system') {
    return {
      ok: true,
      value: { handling: 'defer', reason: 'Source domain outside visible set' },
    }
  }

  return { ok: true, value: { handling: 'quiet_indicator', reason: 'In-scope, non-critical' } }
}

export function deferInterruption(
  focus: KenosFocusContext,
  candidate: KenosInterruptionCandidate,
  existing: KenosDeferredItem[],
  at?: string,
): FocusRuntimeResult<KenosDeferredItem> {
  const decision = evaluateInterruption(focus, candidate)
  if (!decision.ok) return decision
  if (!['defer', 'suppress_until_end'].includes(decision.value.handling)) {
    return { ok: false, error: `Cannot defer with handling ${decision.value.handling}` }
  }
  const dedupeKey = `${candidate.sourceDomain}:${candidate.category}:${candidate.relatedEntityRef?.id ?? candidate.safeSummary}`
  const duplicate = existing.find(
    (item) =>
      item.focusContextId === focus.id &&
      item.status === 'pending' &&
      `${item.sourceDomain}:${item.category}:${item.sourceEntityRef?.id ?? item.safeSummary}` === dedupeKey,
  )
  if (duplicate) return { ok: true, value: duplicate }

  const stamp = nowIso(at)
  const item: KenosDeferredItem = {
    id: randomUUID(),
    ownerId: focus.ownerId,
    focusContextId: focus.id,
    sourceDomain: candidate.sourceDomain,
    sourceEntityRef: candidate.relatedEntityRef ?? null,
    category: candidate.category,
    safeSummary: candidate.safeSummary,
    classification: candidate.classification,
    originalCreatedAt: candidate.createdAt,
    deferredAt: stamp,
    releaseAt: null,
    expiry: candidate.expiry ?? null,
    urgency: candidate.urgency,
    status: 'pending',
    reason: decision.value.reason,
    correlationId: focus.correlationId,
  }
  const parsed = KenosDeferredItemSchema.safeParse(item)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  return { ok: true, value: parsed.data }
}

export function releaseDeferredBatch(
  items: KenosDeferredItem[],
  focusContextId: string,
  at?: string,
): KenosDeferredItem[] {
  const stamp = nowIso(at)
  return items.map((item) => {
    if (item.focusContextId !== focusContextId || item.status !== 'pending') return item
    if (item.urgency === 'critical') {
      return { ...item, status: 'released' as const, releaseAt: stamp }
    }
    // Careful release: mark released but caller batches UI; no notification dump
    return { ...item, status: 'released' as const, releaseAt: stamp }
  })
}

export function createDefaultBudget(ownerId: string, focusContextId?: string | null): KenosInterventionBudget {
  return {
    id: randomUUID(),
    ownerId,
    focusContextId: focusContextId ?? null,
    maxSuggestionsPerSession: 2,
    cooldownSeconds: 900,
    repeatedDismissalSuppression: 2,
    quietHours: null,
    urgencyThreshold: 'high',
    groupedRelease: true,
    shownNonUrgentCount: 0,
    lastShownAt: null,
    dismissedTypes: {},
  }
}

export function canShowSuggestion(
  budget: KenosInterventionBudget,
  suggestion: Pick<KenosProactiveSuggestion, 'suggestionType' | 'risk' | 'confidence'>,
  at?: string,
): FocusRuntimeResult<{ allowed: boolean; reason: string }> {
  if (suggestion.risk === 'R4') {
    return { ok: true, value: { allowed: false, reason: 'R4 fail closed' } }
  }
  if (suggestion.confidence < 0.45) {
    return { ok: true, value: { allowed: false, reason: 'Low confidence — list only, no interrupt' } }
  }
  const dismissCount = budget.dismissedTypes[suggestion.suggestionType] ?? 0
  if (dismissCount >= budget.repeatedDismissalSuppression) {
    return { ok: true, value: { allowed: false, reason: 'Repeated dismissal suppression' } }
  }
  if (suggestion.risk === 'R0' || suggestion.risk === 'R1') {
    if (budget.shownNonUrgentCount >= budget.maxSuggestionsPerSession) {
      return { ok: true, value: { allowed: false, reason: 'Session non-urgent budget exhausted' } }
    }
  }
  if (budget.lastShownAt && budget.cooldownSeconds > 0) {
    const elapsed = (Date.parse(nowIso(at)) - Date.parse(budget.lastShownAt)) / 1000
    if (elapsed < budget.cooldownSeconds && suggestion.risk !== 'R3') {
      return { ok: true, value: { allowed: false, reason: 'Cooldown active' } }
    }
  }
  return { ok: true, value: { allowed: true, reason: 'Within intervention budget' } }
}

export function markSuggestionShown(
  budget: KenosInterventionBudget,
  suggestion: Pick<KenosProactiveSuggestion, 'risk'>,
  at?: string,
): KenosInterventionBudget {
  return {
    ...budget,
    shownNonUrgentCount:
      suggestion.risk === 'R0' || suggestion.risk === 'R1'
        ? budget.shownNonUrgentCount + 1
        : budget.shownNonUrgentCount,
    lastShownAt: nowIso(at),
  }
}

export function markSuggestionDismissed(
  budget: KenosInterventionBudget,
  suggestionType: string,
): KenosInterventionBudget {
  return {
    ...budget,
    dismissedTypes: {
      ...budget.dismissedTypes,
      [suggestionType]: (budget.dismissedTypes[suggestionType] ?? 0) + 1,
    },
  }
}

export type ScopedAssistantDecision =
  | { kind: 'in_scope'; domains: KenosDomain[] }
  | { kind: 'explicit_cross_domain'; domains: KenosDomain[]; notice: string }
  | { kind: 'denied'; reason: string }

export function resolveAssistantScope(
  focus: KenosFocusContext | null,
  requestedDomains: KenosDomain[],
  userExplicitCrossDomain: boolean,
): ScopedAssistantDecision {
  if (!focus || !isForegroundFocus(focus)) {
    return { kind: 'in_scope', domains: requestedDomains.length ? requestedDomains : ['assistant'] }
  }
  if (!focus.assistantScope) {
    return { kind: 'denied', reason: 'Missing assistantScope — fail closed' }
  }
  const allowed = new Set(focus.assistantScope.allowedDomains)
  const outOfScope = requestedDomains.filter((d) => !allowed.has(d))
  if (!outOfScope.length) {
    return { kind: 'in_scope', domains: requestedDomains.length ? requestedDomains : [...allowed] }
  }
  if (userExplicitCrossDomain && focus.assistantScope.allowExplicitCrossDomain) {
    return {
      kind: 'explicit_cross_domain',
      domains: requestedDomains,
      notice: 'Temporarily answering outside current Focus; Focus unchanged',
    }
  }
  if (focus.assistantScope.proactiveCrossDomain) {
    return { kind: 'in_scope', domains: requestedDomains }
  }
  return {
    kind: 'denied',
    reason: `Out of Focus scope: ${outOfScope.join(', ')}. Ask explicitly to cross domains.`,
  }
}

export function buildSessionSummary(input: {
  focus: KenosFocusContext
  deferred: KenosDeferredItem[]
  completedActions?: string[]
  progress: string
  nextRecommendedStep: string
  notes?: string | null
  activityRefs?: string[]
  errors?: string[]
  at?: string
}): FocusRuntimeResult<KenosSessionSummary> {
  const stamp = nowIso(input.at)
  const started = input.focus.startedAt ? Date.parse(input.focus.startedAt) : Date.parse(input.focus.createdAt)
  const ended = input.focus.endedAt ? Date.parse(input.focus.endedAt) : Date.parse(stamp)
  const deferredItemCounts: Record<string, number> = {}
  let releasedUrgentCount = 0
  for (const item of input.deferred.filter((d) => d.focusContextId === input.focus.id)) {
    deferredItemCounts[item.sourceDomain] = (deferredItemCounts[item.sourceDomain] ?? 0) + 1
    if (item.status === 'released' && (item.urgency === 'high' || item.urgency === 'critical')) {
      releasedUrgentCount += 1
    }
  }
  const summary: KenosSessionSummary = {
    id: randomUUID(),
    focusContextId: input.focus.id,
    ownerId: input.focus.ownerId,
    mode: input.focus.mode,
    activeSpace: input.focus.activeSpace,
    activeSessionRef: input.focus.activeSessionRef ?? null,
    durationSeconds: Math.max(0, Math.round((ended - started) / 1000)),
    completedActions: input.completedActions ?? [],
    progress: input.progress,
    notes: input.notes ?? null,
    deferredItemCounts,
    releasedUrgentCount,
    errors: input.errors ?? [],
    nextRecommendedStep: input.nextRecommendedStep,
    activityRefs: input.activityRefs ?? [],
    createdAt: stamp,
  }
  const parsed = KenosSessionSummarySchema.safeParse(summary)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  return { ok: true, value: parsed.data }
}

export function createExplainableSuggestion(input: {
  ownerId: string
  source: KenosProactiveSuggestion['source']
  targetDomain: KenosDomain
  focusContextId?: string | null
  suggestionType: string
  title: string
  safeSummary: string
  rationale: string
  whyNow: string
  signalsUsed: string[]
  impactSummary: string
  confidence: number
  risk: KenosRiskLevel
  writes: boolean
  requiresApproval: boolean
  approvalRequirement?: KenosProactiveSuggestion['approvalRequirement']
  actionType?: string | null
  evidenceRefs?: KenosEntityRef[]
  classification?: KenosClassification
  at?: string
}): FocusRuntimeResult<KenosProactiveSuggestion> {
  const stamp = nowIso(input.at)
  let approvalRequirement = input.approvalRequirement
  if (!approvalRequirement) {
    if (input.risk === 'R4') approvalRequirement = 'fail_closed'
    else if (input.risk === 'R3') approvalRequirement = 'strong_confirm'
    else if (input.writes || input.requiresApproval) approvalRequirement = 'confirm'
    else approvalRequirement = 'none'
  }
  const suggestion: KenosProactiveSuggestion = {
    id: randomUUID(),
    version: '1',
    ownerId: input.ownerId,
    source: input.source,
    targetDomain: input.targetDomain,
    focusContextId: input.focusContextId ?? null,
    suggestionType: input.suggestionType,
    title: input.title,
    safeSummary: input.safeSummary,
    rationale: input.rationale,
    evidenceRefs: input.evidenceRefs ?? [],
    confidence: input.confidence,
    risk: input.risk,
    proposedAction: {
      actionType: input.actionType ?? null,
      writes: input.writes,
      requiresApproval: input.requiresApproval || approvalRequirement !== 'none',
      reversibleHint: input.writes ? 'Local draft only until confirmed' : 'No write',
    },
    approvalRequirement,
    createdAt: stamp,
    expiresAt: null,
    status: 'generated',
    dismissalReason: null,
    feedback: null,
    classification: input.classification ?? 'personal',
    correlationId: randomUUID(),
    whyNow: input.whyNow,
    signalsUsed: input.signalsUsed,
    impactSummary: input.impactSummary,
  }
  const parsed = KenosProactiveSuggestionSchema.safeParse(suggestion)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  return { ok: true, value: parsed.data }
}

export function appleFocusSuggestion(
  systemFocus: 'fitness' | 'work' | 'sleep' | 'personal' | 'other',
): { suggestedMode: KenosFocusMode; requiresUserConfirm: true; autoEnter: false } {
  const map: Record<typeof systemFocus, KenosFocusMode> = {
    fitness: 'training',
    work: 'deep_work',
    sleep: 'wind_down',
    personal: 'custom',
    other: 'custom',
  }
  return { suggestedMode: map[systemFocus], requiresUserConfirm: true, autoEnter: false }
}

export type FocusActivityEventType =
  | 'focus.started'
  | 'focus.paused'
  | 'focus.resumed'
  | 'focus.temporarily_left'
  | 'focus.ended'
  | 'focus.cancelled'
  | 'suggestion.shown'
  | 'suggestion.accepted'
  | 'suggestion.dismissed'
  | 'item.deferred'
  | 'deferred.released'

export function focusActivitySummary(eventType: FocusActivityEventType, focus: KenosFocusContext): string {
  switch (eventType) {
    case 'focus.started':
      return `Started ${focus.title}`
    case 'focus.paused':
      return `Paused ${focus.title}`
    case 'focus.resumed':
      return `Resumed ${focus.title}`
    case 'focus.temporarily_left':
      return `Temporarily left ${focus.title}`
    case 'focus.ended':
      return `Ended ${focus.title}`
    case 'focus.cancelled':
      return `Cancelled ${focus.title}`
    case 'suggestion.shown':
      return 'Showed a suggestion'
    case 'suggestion.accepted':
      return 'Accepted a suggestion'
    case 'suggestion.dismissed':
      return 'Dismissed a suggestion'
    case 'item.deferred':
      return 'Deferred an interruption'
    case 'deferred.released':
      return 'Released deferred items'
    default: {
      const _e: never = eventType
      return `Focus event ${_e}`
    }
  }
}

export function interruptionCandidate(input: {
  ownerId: string
  focusContextId?: string | null
  sourceDomain: KenosDomain
  category: string
  urgency: KenosInterruptionUrgency
  risk: KenosRiskLevel
  safeSummary: string
  explanation: string
  recommendedHandling?: KenosInterruptionHandling
  relatedEntityRef?: KenosEntityRef | null
  classification?: KenosClassification
  at?: string
}): KenosInterruptionCandidate {
  return {
    id: randomUUID(),
    ownerId: input.ownerId,
    focusContextId: input.focusContextId ?? null,
    sourceDomain: input.sourceDomain,
    category: input.category,
    urgency: input.urgency,
    risk: input.risk,
    classification: input.classification ?? 'personal',
    createdAt: nowIso(input.at),
    expiry: null,
    relatedEntityRef: input.relatedEntityRef ?? null,
    recommendedHandling: input.recommendedHandling ?? 'defer',
    explanation: input.explanation,
    safeSummary: input.safeSummary,
  }
}
