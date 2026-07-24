/**
 * AIOS Focus session store core — local simulation only.
 * System owns FocusContext; domain sessions referenced by EntityRef.
 */
import {
  buildSessionSummary,
  canShowSuggestion,
  createDefaultBudget,
  createExplainableSuggestion,
  deferInterruption,
  evaluateInterruption,
  focusActivitySummary,
  hidesGlobalNavigation,
  interruptionCandidate,
  isForegroundFocus,
  markSuggestionDismissed,
  markSuggestionShown,
  releaseDeferredBatch,
  resolveAssistantScope,
  startFocusSession,
  transitionFocus,
} from './focusRuntime.core.js'

export const FOCUS_OWNER_ID = '20000000-0000-4000-8000-000000000001'
export const FOCUS_STORAGE_KEY = 'kenos.focus.v1'

export function emptyFocusState(ownerId = FOCUS_OWNER_ID) {
  return {
    ownerId,
    focus: null,
    deferred: [],
    suggestions: [],
    budget: createDefaultBudget(ownerId),
    activity: [],
    summary: null,
    leavePromptOpen: false,
    lastError: null,
  }
}

export function persistableFocusState(state) {
  return {
    ownerId: state.ownerId,
    focus: state.focus,
    deferred: state.deferred,
    suggestions: state.suggestions,
    budget: state.budget,
    activity: state.activity.slice(0, 40),
    summary: state.summary,
  }
}

export function loadFocusState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(FOCUS_STORAGE_KEY)
    if (!raw) return emptyFocusState()
    const parsed = JSON.parse(raw)
    if (parsed?.ownerId && parsed.ownerId !== FOCUS_OWNER_ID) {
      return emptyFocusState()
    }
    return {
      ...emptyFocusState(parsed.ownerId || FOCUS_OWNER_ID),
      ...parsed,
      leavePromptOpen: false,
      lastError: null,
    }
  } catch {
    return emptyFocusState()
  }
}

export function saveFocusState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(FOCUS_STORAGE_KEY, JSON.stringify(persistableFocusState(state)))
  } catch {
    /* ignore quota */
  }
}

export function clearFocusState(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(FOCUS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  return emptyFocusState()
}

function pushActivity(state, eventType, focus, extra = {}) {
  const entry = {
    id: crypto.randomUUID(),
    eventType,
    summary: focusActivitySummary(eventType, focus),
    focusId: focus.id,
    occurredAt: new Date().toISOString(),
    ...extra,
  }
  return { ...state, activity: [entry, ...state.activity].slice(0, 40) }
}

export function startTrainingFocus(state, options = {}) {
  const sessionRef = {
    id: options.sessionId || '60000000-0000-4000-8000-000000000001',
    type: 'training.workout_session',
    ownerDomain: 'training',
    ownerId: state.ownerId,
  }
  const result = startFocusSession(state.focus && isForegroundFocus(state.focus) ? state.focus : null, {
    ownerId: state.ownerId,
    mode: 'training',
    title: options.title || 'Push Day',
    safeSummary: options.safeSummary || 'Local Training Focus simulation',
    activeSessionRef: sessionRef,
    returnDestination: { kind: 'space', space: 'training', label: 'Return to Training', route: '/spaces/training' },
  })
  if (!result.ok) return { ...state, lastError: result.error }
  let next = {
    ...state,
    focus: result.value,
    budget: createDefaultBudget(state.ownerId, result.value.id),
    summary: null,
    lastError: null,
  }
  next = pushActivity(next, 'focus.started', result.value)
  next = seedTrainingSuggestions(next)
  next = ingestCrossDomainNoise(next)
  return next
}

export function startDeepWorkFocus(state, options = {}) {
  const sessionRef = {
    id: options.projectId || 'a1000000-0000-4000-8000-000000000001',
    type: 'work.project',
    ownerDomain: 'work',
    ownerId: state.ownerId,
  }
  const result = startFocusSession(state.focus && isForegroundFocus(state.focus) ? state.focus : null, {
    ownerId: state.ownerId,
    mode: 'deep_work',
    title: options.title || 'Korben IA',
    safeSummary: options.safeSummary || 'Local Deep Work Focus simulation',
    activeSessionRef: sessionRef,
    classification: 'work_confidential',
    returnDestination: { kind: 'space', space: 'work', label: 'Return to Work', route: '/work' },
  })
  if (!result.ok) return { ...state, lastError: result.error }
  let next = {
    ...state,
    focus: result.value,
    budget: createDefaultBudget(state.ownerId, result.value.id),
    summary: null,
    lastError: null,
  }
  next = pushActivity(next, 'focus.started', result.value)
  next = seedDeepWorkSuggestions(next)
  next = ingestCrossDomainNoise(next)
  return next
}

function ingestCrossDomainNoise(state) {
  if (!state.focus) return state
  const candidates = [
    interruptionCandidate({
      ownerId: state.ownerId,
      focusContextId: state.focus.id,
      sourceDomain: 'work',
      category: 'inbox_update',
      urgency: 'normal',
      risk: 'R1',
      safeSummary: 'Work project update',
      explanation: 'Non-urgent Work update while focused',
    }),
    interruptionCandidate({
      ownerId: state.ownerId,
      focusContextId: state.focus.id,
      sourceDomain: 'money',
      category: 'money_review',
      urgency: 'low',
      risk: 'R0',
      safeSummary: 'Monthly review reminder',
      explanation: 'Money review is out of current Focus',
    }),
    interruptionCandidate({
      ownerId: state.ownerId,
      focusContextId: state.focus.id,
      sourceDomain: 'home',
      category: 'home_task',
      urgency: 'low',
      risk: 'R0',
      safeSummary: 'Shelf organizing task',
      explanation: 'Home task deferred during Focus',
    }),
  ]
  let deferred = [...state.deferred]
  let activity = state.activity
  for (const candidate of candidates) {
    const decision = evaluateInterruption(state.focus, candidate)
    if (!decision.ok) continue
    if (decision.value.handling === 'defer' || decision.value.handling === 'suppress_until_end') {
      const item = deferInterruption(state.focus, candidate, deferred)
      if (item.ok) {
        deferred = [...deferred.filter((d) => d.id !== item.value.id), item.value]
        activity = [
          {
            id: crypto.randomUUID(),
            eventType: 'item.deferred',
            summary: focusActivitySummary('item.deferred', state.focus),
            focusId: state.focus.id,
            occurredAt: new Date().toISOString(),
            safeDetail: item.value.safeSummary,
          },
          ...activity,
        ].slice(0, 40)
      }
    }
  }
  return { ...state, deferred, activity }
}

function seedTrainingSuggestions(state) {
  const created = createExplainableSuggestion({
    ownerId: state.ownerId,
    source: 'rule',
    targetDomain: 'training',
    focusContextId: state.focus.id,
    suggestionType: 'training.next_exercise',
    title: 'Next: Overhead press',
    safeSummary: 'Next exercise from the local workout order',
    rationale: 'Deterministic R0 rule from session plan order',
    whyNow: 'Session started',
    signalsUsed: ['workout_order'],
    impactSummary: 'Guidance only — no write',
    confidence: 0.92,
    risk: 'R0',
    writes: false,
    requiresApproval: false,
  })
  if (!created.ok) return state
  return maybeShowSuggestion({ ...state, suggestions: [created.value, ...state.suggestions] }, created.value.id)
}

function seedDeepWorkSuggestions(state) {
  const created = createExplainableSuggestion({
    ownerId: state.ownerId,
    source: 'rule',
    targetDomain: 'work',
    focusContextId: state.focus.id,
    suggestionType: 'work.recent_decision',
    title: 'Recent decision on scope',
    safeSummary: 'Keep the current deliverable scope frozen for this session',
    rationale: 'R0 information suggestion from Work projection',
    whyNow: 'Deep Work started on this project',
    signalsUsed: ['work.project', 'work.decision'],
    impactSummary: 'Read-only reminder',
    confidence: 0.8,
    risk: 'R0',
    writes: false,
    requiresApproval: false,
  })
  if (!created.ok) return state
  return maybeShowSuggestion({ ...state, suggestions: [created.value, ...state.suggestions] }, created.value.id)
}

export function maybeShowSuggestion(state, suggestionId) {
  const suggestion = state.suggestions.find((s) => s.id === suggestionId)
  if (!suggestion) return state
  const gate = canShowSuggestion(state.budget, suggestion)
  if (!gate.ok || !gate.value.allowed) {
    return { ...state, lastError: null }
  }
  const shown = { ...suggestion, status: 'shown' }
  let next = {
    ...state,
    suggestions: state.suggestions.map((s) => (s.id === suggestionId ? shown : s)),
    budget: markSuggestionShown(state.budget, shown),
  }
  next = pushActivity(next, 'suggestion.shown', state.focus, { suggestionId })
  return next
}

export function dismissSuggestion(state, suggestionId, reason = 'user_dismissed') {
  const suggestion = state.suggestions.find((s) => s.id === suggestionId)
  if (!suggestion) return state
  let next = {
    ...state,
    suggestions: state.suggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: 'dismissed', dismissalReason: reason } : s,
    ),
    budget: markSuggestionDismissed(state.budget, suggestion.suggestionType),
  }
  next = pushActivity(next, 'suggestion.dismissed', state.focus, { suggestionId })
  return next
}

export function acceptSuggestion(state, suggestionId) {
  const suggestion = state.suggestions.find((s) => s.id === suggestionId)
  if (!suggestion) return state
  if (suggestion.risk === 'R4' || suggestion.approvalRequirement === 'fail_closed') {
    return { ...state, lastError: 'R4 suggestions fail closed — no execution' }
  }
  if (suggestion.proposedAction.writes && suggestion.approvalRequirement !== 'none') {
    return {
      ...state,
      suggestions: state.suggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'accepted' } : s,
      ),
      lastError: null,
      // Local only: mark accepted; production Approval/Executor remain off
    }
  }
  let next = {
    ...state,
    suggestions: state.suggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: 'accepted' } : s,
    ),
  }
  next = pushActivity(next, 'suggestion.accepted', state.focus, { suggestionId })
  return next
}

export function pauseFocus(state) {
  if (!state.focus) return state
  const result = transitionFocus(state.focus, 'paused')
  if (!result.ok) return { ...state, lastError: result.error }
  return pushActivity({ ...state, focus: result.value, lastError: null }, 'focus.paused', result.value)
}

export function resumeFocus(state) {
  if (!state.focus) return state
  const result = transitionFocus(state.focus, 'active')
  if (!result.ok) return { ...state, lastError: result.error }
  return pushActivity({ ...state, focus: result.value, lastError: null }, 'focus.resumed', result.value)
}

export function temporarilyLeaveFocus(state) {
  if (!state.focus) return state
  const result = transitionFocus(state.focus, 'temporarily_left')
  if (!result.ok) return { ...state, lastError: result.error }
  return pushActivity(
    { ...state, focus: result.value, leavePromptOpen: false, lastError: null },
    'focus.temporarily_left',
    result.value,
  )
}

export function returnToFocus(state) {
  if (!state.focus) return state
  const result = transitionFocus(state.focus, 'active')
  if (!result.ok) return { ...state, lastError: result.error }
  return pushActivity({ ...state, focus: result.value, lastError: null }, 'focus.resumed', result.value)
}

export function endFocus(state, options = {}) {
  if (!state.focus) return state
  let focus = state.focus
  if (focus.status !== 'ending') {
    const ending = transitionFocus(focus, 'ending')
    if (!ending.ok) return { ...state, lastError: ending.error }
    focus = ending.value
  }
  const completed = transitionFocus(focus, 'completed')
  if (!completed.ok) return { ...state, lastError: completed.error }
  const deferred = releaseDeferredBatch(state.deferred, completed.value.id)
  const summaryResult = buildSessionSummary({
    focus: completed.value,
    deferred,
    completedActions: options.completedActions || defaultCompletedActions(completed.value.mode),
    progress: options.progress || defaultProgress(completed.value.mode),
    nextRecommendedStep: options.nextRecommendedStep || '查看延期事项，或回到 Today',
    notes: options.notes ?? null,
  })
  let next = {
    ...state,
    focus: completed.value,
    deferred,
    summary: summaryResult.ok ? summaryResult.value : null,
    lastError: summaryResult.ok ? null : summaryResult.error,
  }
  next = pushActivity(next, 'focus.ended', completed.value)
  next = pushActivity(next, 'deferred.released', completed.value, {
    count: deferred.filter((d) => d.status === 'released').length,
  })
  return next
}

function defaultCompletedActions(mode) {
  if (mode === 'training') return ['4 个动作', '16 组', '1 条身体记录']
  if (mode === 'deep_work') return ['专注当前项目', '查阅最近决定']
  return []
}

function defaultProgress(mode) {
  if (mode === 'training') return '4 个动作 · 16 组 · 新增 1 条身体记录'
  if (mode === 'deep_work') return '保持在当前 Work/Plan 范围内'
  return 'Session completed'
}

export function cancelFocus(state) {
  if (!state.focus) return state
  const result = transitionFocus(state.focus, 'cancelled')
  if (!result.ok) return { ...state, lastError: result.error }
  return pushActivity({ ...state, focus: result.value, lastError: null }, 'focus.cancelled', result.value)
}

export function focusUiFlags(state) {
  const focus = state.focus
  return {
    hideGlobalNav: hidesGlobalNavigation(focus),
    showReturnBanner: !!focus && focus.status === 'temporarily_left',
    isActiveSession: !!focus && focus.status === 'active',
    isPaused: !!focus && focus.status === 'paused',
    pendingDeferredCount: state.deferred.filter(
      (d) => d.focusContextId === focus?.id && d.status === 'pending',
    ).length,
    // Never surface deferred count as anxiety badge during active Focus
    showDeferredBadge: false,
  }
}

export function assistantScopeForPrompt(state, requestedDomains = [], userExplicitCrossDomain = false) {
  return resolveAssistantScope(state.focus, requestedDomains, userExplicitCrossDomain)
}

export { hidesGlobalNavigation, isForegroundFocus, evaluateInterruption }
