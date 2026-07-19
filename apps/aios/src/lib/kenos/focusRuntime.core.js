/**
 * AIOS-local Focus runtime mirror of packages/contracts/src/kenos-focus-runtime.ts.
 * Keeps fail-closed behavior without a forbidden @life-os/contracts value import.
 * Canonical schemas/tests live under packages/contracts.
 */

const FOCUS_STATUS_TRANSITIONS = Object.freeze({
  inactive: ['starting'],
  starting: ['active', 'cancelled'],
  active: ['paused', 'temporarily_left', 'ending', 'cancelled'],
  temporarily_left: ['active', 'ending', 'cancelled'],
  paused: ['active', 'ending', 'cancelled'],
  ending: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
})

const SENSITIVE = /\b(token|secret|password|authorization|cookie|bearer)\b/i

function uuid() {
  return crypto.randomUUID()
}

function nowIso(at) {
  return at ?? new Date().toISOString()
}

function rejectSensitive(value) {
  return typeof value === 'string' && SENSITIVE.test(value)
}

export function canTransitionFocusStatus(from, to) {
  return (FOCUS_STATUS_TRANSITIONS[from] || []).includes(to)
}

export function focusModePolicy(mode) {
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
    case 'meeting':
    case 'reading':
    case 'home_organizing':
    case 'finance_review':
    case 'custom':
      return focusModePolicyFallback(mode)
    default:
      throw new Error(`Unknown focus mode fail-closed: ${mode}`)
  }
}

function focusModePolicyFallback(mode) {
  const space =
    mode === 'meeting'
      ? 'work'
      : mode === 'reading'
        ? 'library'
        : mode === 'home_organizing'
          ? 'home'
          : mode === 'finance_review'
            ? 'money'
            : 'system'
  return {
    activeSpace: space,
    visibleDomains: [space, 'system'],
    hiddenDomains: ['work', 'money', 'home', 'training', 'library', 'plan'].filter((d) => d !== space),
    allowedInterruptionCategories: ['system_critical', 'user_override'],
    assistantScope: {
      mode,
      allowedDomains: [space],
      allowExplicitCrossDomain: true,
      proactiveCrossDomain: false,
      toolsAllowlist: [],
    },
    notificationPolicyRef: `focus.${mode}.v1`,
  }
}

export function createFocusContext(input) {
  if (rejectSensitive(input.title) || rejectSensitive(input.safeSummary)) {
    return { ok: false, error: 'Sensitive marker in Focus title/summary' }
  }
  let policy
  try {
    policy = focusModePolicy(input.mode)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  const at = nowIso(input.at)
  const value = {
    id: uuid(),
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
    deferredQueueRef: uuid(),
    returnDestination:
      input.returnDestination ??
      ({
        kind: 'space',
        space: policy.activeSpace,
        label: `Return to ${policy.activeSpace}`,
      }),
    source: input.source ?? 'user',
    classification: input.classification ?? 'personal',
    title: input.title,
    safeSummary: input.safeSummary,
    correlationId: uuid(),
    createdAt: at,
    updatedAt: at,
  }
  return { ok: true, value }
}

export function transitionFocus(focus, to, at) {
  if (!canTransitionFocusStatus(focus.status, to)) {
    if (focus.status === to) return { ok: true, value: focus }
    if (focus.status === 'completed' && to === 'completed') return { ok: true, value: focus }
    if (focus.status === 'cancelled' && to === 'cancelled') return { ok: true, value: focus }
    return { ok: false, error: `Illegal Focus transition: ${focus.status} -> ${to}` }
  }
  const stamp = nowIso(at)
  const next = { ...focus, status: to, updatedAt: stamp }
  if (to === 'starting') next.endedAt = null
  if (to === 'active') {
    next.startedAt = focus.startedAt ?? stamp
    next.pausedAt = null
  }
  if (to === 'paused') next.pausedAt = stamp
  if (to === 'completed' || to === 'cancelled') {
    next.endedAt = stamp
    next.pausedAt = null
  }
  return { ok: true, value: next }
}

export function isForegroundFocus(focus) {
  return !!focus && ['starting', 'active', 'paused', 'temporarily_left', 'ending'].includes(focus.status)
}

export function hidesGlobalNavigation(focus) {
  return !!focus && focus.status === 'active'
}

export function startFocusSession(existingForeground, input) {
  if (existingForeground && isForegroundFocus(existingForeground)) {
    return { ok: false, error: 'Foreground Focus already active; resolve it before starting another' }
  }
  const created = createFocusContext(input)
  if (!created.ok) return created
  const starting = transitionFocus(created.value, 'starting', input.at)
  if (!starting.ok) return starting
  return transitionFocus(starting.value, 'active', input.at)
}

export function evaluateInterruption(focus, candidate) {
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
  if (focus.mode === 'wind_down' && ['work', 'money', 'plan'].includes(candidate.sourceDomain)) {
    return {
      ok: true,
      value: { handling: 'suppress_until_end', reason: 'Wind-down hides Work/Money/project status' },
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
    return { ok: true, value: { handling: 'defer', reason: 'Source domain outside visible set' } }
  }
  return { ok: true, value: { handling: 'quiet_indicator', reason: 'In-scope, non-critical' } }
}

export function interruptionCandidate(input) {
  return {
    id: uuid(),
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

export function deferInterruption(focus, candidate, existing) {
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
  return {
    ok: true,
    value: {
      id: uuid(),
      ownerId: focus.ownerId,
      focusContextId: focus.id,
      sourceDomain: candidate.sourceDomain,
      sourceEntityRef: candidate.relatedEntityRef ?? null,
      category: candidate.category,
      safeSummary: candidate.safeSummary,
      classification: candidate.classification,
      originalCreatedAt: candidate.createdAt,
      deferredAt: nowIso(),
      releaseAt: null,
      expiry: candidate.expiry ?? null,
      urgency: candidate.urgency,
      status: 'pending',
      reason: decision.value.reason,
      correlationId: focus.correlationId,
    },
  }
}

export function releaseDeferredBatch(items, focusContextId, at) {
  const stamp = nowIso(at)
  return items.map((item) => {
    if (item.focusContextId !== focusContextId || item.status !== 'pending') return item
    return { ...item, status: 'released', releaseAt: stamp }
  })
}

export function createDefaultBudget(ownerId, focusContextId = null) {
  return {
    id: uuid(),
    ownerId,
    focusContextId,
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

export function canShowSuggestion(budget, suggestion) {
  if (suggestion.risk === 'R4') return { ok: true, value: { allowed: false, reason: 'R4 fail closed' } }
  if (suggestion.confidence < 0.45) {
    return { ok: true, value: { allowed: false, reason: 'Low confidence — list only, no interrupt' } }
  }
  const dismissCount = budget.dismissedTypes[suggestion.suggestionType] ?? 0
  if (dismissCount >= budget.repeatedDismissalSuppression) {
    return { ok: true, value: { allowed: false, reason: 'Repeated dismissal suppression' } }
  }
  if (
    (suggestion.risk === 'R0' || suggestion.risk === 'R1') &&
    budget.shownNonUrgentCount >= budget.maxSuggestionsPerSession
  ) {
    return { ok: true, value: { allowed: false, reason: 'Session non-urgent budget exhausted' } }
  }
  return { ok: true, value: { allowed: true, reason: 'Within intervention budget' } }
}

export function markSuggestionShown(budget, suggestion, at) {
  return {
    ...budget,
    shownNonUrgentCount:
      suggestion.risk === 'R0' || suggestion.risk === 'R1'
        ? budget.shownNonUrgentCount + 1
        : budget.shownNonUrgentCount,
    lastShownAt: nowIso(at),
  }
}

export function markSuggestionDismissed(budget, suggestionType) {
  return {
    ...budget,
    dismissedTypes: {
      ...budget.dismissedTypes,
      [suggestionType]: (budget.dismissedTypes[suggestionType] ?? 0) + 1,
    },
  }
}

export function resolveAssistantScope(focus, requestedDomains, userExplicitCrossDomain) {
  if (!focus || !isForegroundFocus(focus)) {
    return { kind: 'in_scope', domains: requestedDomains.length ? requestedDomains : ['assistant'] }
  }
  if (!focus.assistantScope) return { kind: 'denied', reason: 'Missing assistantScope — fail closed' }
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
  return {
    kind: 'denied',
    reason: `Out of Focus scope: ${outOfScope.join(', ')}. Ask explicitly to cross domains.`,
  }
}

export function createExplainableSuggestion(input) {
  if (rejectSensitive(input.title) || rejectSensitive(input.safeSummary) || rejectSensitive(input.rationale)) {
    return { ok: false, error: 'Sensitive marker in suggestion' }
  }
  let approvalRequirement = input.approvalRequirement
  if (!approvalRequirement) {
    if (input.risk === 'R4') approvalRequirement = 'fail_closed'
    else if (input.risk === 'R3') approvalRequirement = 'strong_confirm'
    else if (input.writes || input.requiresApproval) approvalRequirement = 'confirm'
    else approvalRequirement = 'none'
  }
  if (input.risk === 'R4' && approvalRequirement !== 'fail_closed') {
    return { ok: false, error: 'R4 suggestions must fail closed' }
  }
  return {
    ok: true,
    value: {
      id: uuid(),
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
      createdAt: nowIso(input.at),
      expiresAt: null,
      status: 'generated',
      dismissalReason: null,
      feedback: null,
      classification: input.classification ?? 'personal',
      correlationId: uuid(),
      whyNow: input.whyNow,
      signalsUsed: input.signalsUsed,
      impactSummary: input.impactSummary,
    },
  }
}

export function buildSessionSummary(input) {
  const stamp = nowIso(input.at)
  const started = Date.parse(input.focus.startedAt || input.focus.createdAt)
  const ended = Date.parse(input.focus.endedAt || stamp)
  const deferredItemCounts = {}
  let releasedUrgentCount = 0
  for (const item of input.deferred.filter((d) => d.focusContextId === input.focus.id)) {
    deferredItemCounts[item.sourceDomain] = (deferredItemCounts[item.sourceDomain] ?? 0) + 1
    if (item.status === 'released' && (item.urgency === 'high' || item.urgency === 'critical')) {
      releasedUrgentCount += 1
    }
  }
  return {
    ok: true,
    value: {
      id: uuid(),
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
    },
  }
}

export function appleFocusSuggestion(systemFocus) {
  const map = {
    fitness: 'training',
    work: 'deep_work',
    sleep: 'wind_down',
    personal: 'custom',
    other: 'custom',
  }
  return { suggestedMode: map[systemFocus] || 'custom', requiresUserConfirm: true, autoEnter: false }
}

export function focusActivitySummary(eventType, focus) {
  const title = focus?.title || 'Focus'
  const labels = {
    'focus.started': `Started ${title}`,
    'focus.paused': `Paused ${title}`,
    'focus.resumed': `Resumed ${title}`,
    'focus.temporarily_left': `Temporarily left ${title}`,
    'focus.ended': `Ended ${title}`,
    'focus.cancelled': `Cancelled ${title}`,
    'suggestion.shown': 'Showed a suggestion',
    'suggestion.accepted': 'Accepted a suggestion',
    'suggestion.dismissed': 'Dismissed a suggestion',
    'item.deferred': 'Deferred an interruption',
    'deferred.released': 'Released deferred items',
  }
  return labels[eventType] || `Focus event ${eventType}`
}

export { FOCUS_STATUS_TRANSITIONS }
