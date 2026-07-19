import assert from 'node:assert/strict'
import {
  KenosDeferredItemSchema,
  KenosFocusContextSchema,
  KenosFocusModeValues,
  KenosFocusStatusTransitions,
  KenosFocusStatusTransitionSchema,
  KenosFocusStatusValues,
  KenosInterruptionCandidateSchema,
  KenosProactiveSuggestionSchema,
  KenosSessionSummarySchema,
} from '../src/kenos-focus.ts'
import {
  appleFocusSuggestion,
  buildSessionSummary,
  canShowSuggestion,
  canTransitionFocusStatus,
  createDefaultBudget,
  createExplainableSuggestion,
  createFocusContext,
  deferInterruption,
  evaluateInterruption,
  focusModePolicy,
  hidesGlobalNavigation,
  interruptionCandidate,
  markSuggestionDismissed,
  markSuggestionShown,
  releaseDeferredBatch,
  resolveAssistantScope,
  startFocusSession,
  transitionFocus,
} from '../src/kenos-focus-runtime.ts'

const OWNER = '20000000-0000-4000-8000-000000000001'
const SESSION_REF = {
  id: '60000000-0000-4000-8000-000000000001',
  type: 'training.workout_session',
  ownerDomain: 'training',
  ownerId: OWNER,
}

// --- schema / transitions ---
assert.equal(KenosFocusModeValues.length, 8)
assert.equal(KenosFocusStatusValues.length, 8)
assert.deepEqual(KenosFocusStatusTransitions.inactive, ['starting'])
assert.deepEqual(KenosFocusStatusTransitions.active, ['paused', 'temporarily_left', 'ending', 'cancelled'])
assert.equal(KenosFocusStatusTransitionSchema.safeParse({ from: 'active', to: 'paused' }).success, true)
assert.equal(KenosFocusStatusTransitionSchema.safeParse({ from: 'completed', to: 'active' }).success, false)
assert.equal(canTransitionFocusStatus('active', 'temporarily_left'), true)
assert.equal(canTransitionFocusStatus('starting', 'completed'), false)

// unknown mode fail closed at policy layer
assert.throws(() => focusModePolicy(/** @type {any} */ ('unknown_mode')))

const created = createFocusContext({
  ownerId: OWNER,
  mode: 'training',
  title: 'Push Day',
  safeSummary: 'Training focus for push day',
  activeSessionRef: SESSION_REF,
})
assert.equal(created.ok, true)
assert.equal(created.value.status, 'inactive')
assert.ok(created.value.visibleDomains.includes('training'))
assert.ok(created.value.hiddenDomains.includes('work'))

const started = startFocusSession(null, {
  ownerId: OWNER,
  mode: 'training',
  title: 'Push Day',
  safeSummary: 'Training focus for push day',
  activeSessionRef: SESSION_REF,
  at: '2026-07-19T10:00:00.000Z',
})
assert.equal(started.ok, true)
assert.equal(started.value.status, 'active')
assert.equal(hidesGlobalNavigation(started.value), true)

const blocked = startFocusSession(started.value, {
  ownerId: OWNER,
  mode: 'deep_work',
  title: 'Deep Work',
  safeSummary: 'Should not silently replace',
})
assert.equal(blocked.ok, false)

const left = transitionFocus(started.value, 'temporarily_left', '2026-07-19T10:15:00.000Z')
assert.equal(left.ok, true)
assert.equal(hidesGlobalNavigation(left.value), false)
const resumed = transitionFocus(left.value, 'active', '2026-07-19T10:20:00.000Z')
assert.equal(resumed.ok, true)

const paused = transitionFocus(resumed.value, 'paused')
assert.equal(paused.ok, true)
const unpaused = transitionFocus(paused.value, 'active')
assert.equal(unpaused.ok, true)
const ending = transitionFocus(unpaused.value, 'ending')
assert.equal(ending.ok, true)
const completed = transitionFocus(ending.value, 'completed', '2026-07-19T11:00:00.000Z')
assert.equal(completed.ok, true)
assert.equal(completed.value.endedAt, '2026-07-19T11:00:00.000Z')
// idempotent end
assert.equal(transitionFocus(completed.value, 'completed').ok, true)
assert.equal(transitionFocus(completed.value, 'active').ok, false)

const cancelledPath = startFocusSession(null, {
  ownerId: OWNER,
  mode: 'deep_work',
  title: 'Kenos IA',
  safeSummary: 'Deep work on navigation IA',
})
assert.equal(cancelledPath.ok, true)
assert.equal(transitionFocus(cancelledPath.value, 'cancelled').ok, true)

// schema validates active training fixture shape
assert.equal(KenosFocusContextSchema.safeParse(started.value).success, true)

// --- interruption / defer ---
const workPing = interruptionCandidate({
  ownerId: OWNER,
  focusContextId: started.value.id,
  sourceDomain: 'work',
  category: 'inbox_update',
  urgency: 'normal',
  risk: 'R1',
  safeSummary: 'Work project update',
  explanation: 'Non-urgent Work update during Training',
})
assert.equal(KenosInterruptionCandidateSchema.safeParse(workPing).success, true)
const workDecision = evaluateInterruption(started.value, workPing)
assert.equal(workDecision.ok, true)
assert.equal(workDecision.value.handling, 'defer')

const safety = interruptionCandidate({
  ownerId: OWNER,
  focusContextId: started.value.id,
  sourceDomain: 'health',
  category: 'health_safety',
  urgency: 'critical',
  risk: 'R2',
  safeSummary: 'Heart-rate safety alert',
  explanation: 'Safety must interrupt Training',
})
assert.equal(evaluateInterruption(started.value, safety).value.handling, 'always_allow')

const timer = interruptionCandidate({
  ownerId: OWNER,
  focusContextId: started.value.id,
  sourceDomain: 'training',
  category: 'workout_timer',
  urgency: 'high',
  risk: 'R0',
  safeSummary: 'Rest timer ended',
  explanation: 'In-session training timer',
})
assert.equal(evaluateInterruption(started.value, timer).value.handling, 'show_now')

const deferred = deferInterruption(started.value, workPing, [])
assert.equal(deferred.ok, true)
assert.equal(KenosDeferredItemSchema.safeParse(deferred.value).success, true)
const deferredAgain = deferInterruption(started.value, workPing, [deferred.value])
assert.equal(deferredAgain.ok, true)
assert.equal(deferredAgain.value.id, deferred.value.id)

const released = releaseDeferredBatch([deferred.value], started.value.id, '2026-07-19T11:01:00.000Z')
assert.equal(released[0].status, 'released')

// wind-down suppresses work
const wind = startFocusSession(null, {
  ownerId: OWNER,
  mode: 'wind_down',
  title: 'Wind down',
  safeSummary: 'Evening wind-down',
})
assert.equal(wind.ok, true)
const windWork = evaluateInterruption(
  wind.value,
  interruptionCandidate({
    ownerId: OWNER,
    sourceDomain: 'work',
    category: 'approval',
    urgency: 'normal',
    risk: 'R2',
    safeSummary: 'Approval waiting',
    explanation: 'Ordinary approval during wind-down',
  }),
)
assert.equal(windWork.value.handling, 'suppress_until_end')

// --- assistant scope ---
const inScope = resolveAssistantScope(started.value, ['training'], false)
assert.equal(inScope.kind, 'in_scope')
const leak = resolveAssistantScope(started.value, ['work', 'money'], false)
assert.equal(leak.kind, 'denied')
const explicit = resolveAssistantScope(started.value, ['work'], true)
assert.equal(explicit.kind, 'explicit_cross_domain')
assert.match(explicit.notice, /Focus unchanged/)

// --- suggestions + budget ---
const suggestion = createExplainableSuggestion({
  ownerId: OWNER,
  source: 'rule',
  targetDomain: 'training',
  focusContextId: started.value.id,
  suggestionType: 'training.next_exercise',
  title: 'Next: Overhead press',
  safeSummary: 'Suggested next exercise from session plan',
  rationale: 'Deterministic next-step rule from workout order',
  whyNow: 'Rest timer completed',
  signalsUsed: ['workout_order', 'rest_timer'],
  impactSummary: 'No write; guidance only',
  confidence: 0.9,
  risk: 'R0',
  writes: false,
  requiresApproval: false,
})
assert.equal(suggestion.ok, true)
assert.equal(KenosProactiveSuggestionSchema.safeParse(suggestion.value).success, true)
assert.ok(suggestion.value.whyNow)
assert.ok(suggestion.value.signalsUsed.length)

const r3 = createExplainableSuggestion({
  ownerId: OWNER,
  source: 'rule',
  targetDomain: 'work',
  suggestionType: 'work.external_send',
  title: 'Send update',
  safeSummary: 'Would send an external message',
  rationale: 'External send requires Approval',
  whyNow: 'User asked to notify',
  signalsUsed: ['user_request'],
  impactSummary: 'External side effect if approved',
  confidence: 0.8,
  risk: 'R3',
  writes: true,
  requiresApproval: true,
  actionType: 'work.send_update',
})
assert.equal(r3.ok, true)
assert.equal(r3.value.approvalRequirement, 'strong_confirm')

const r4 = createExplainableSuggestion({
  ownerId: OWNER,
  source: 'system',
  targetDomain: 'system',
  suggestionType: 'system.policy_change',
  title: 'Change policy',
  safeSummary: 'Would alter security policy',
  rationale: 'R4 must fail closed',
  whyNow: 'Never auto',
  signalsUsed: ['none'],
  impactSummary: 'Irreversible policy change',
  confidence: 0.99,
  risk: 'R4',
  writes: true,
  requiresApproval: true,
})
assert.equal(r4.ok, true)
assert.equal(r4.value.approvalRequirement, 'fail_closed')

let budget = createDefaultBudget(OWNER, started.value.id)
assert.equal(canShowSuggestion(budget, suggestion.value).value.allowed, true)
budget = markSuggestionShown(budget, suggestion.value)
budget = markSuggestionShown(budget, suggestion.value)
assert.equal(canShowSuggestion(budget, suggestion.value).value.allowed, false)
budget = markSuggestionDismissed(budget, 'training.next_exercise')
budget = markSuggestionDismissed(budget, 'training.next_exercise')
assert.equal(canShowSuggestion(createDefaultBudget(OWNER), { ...suggestion.value, confidence: 0.2 }).value.allowed, false)

// --- session summary ---
const summary = buildSessionSummary({
  focus: completed.value,
  deferred: released,
  completedActions: ['Logged 4 exercises', '16 sets'],
  progress: '4 exercises · 16 sets · 1 body note',
  nextRecommendedStep: 'Rest or review deferred Inbox items',
  at: '2026-07-19T11:02:00.000Z',
})
assert.equal(summary.ok, true)
assert.equal(KenosSessionSummarySchema.safeParse(summary.value).success, true)
assert.ok(summary.value.durationSeconds >= 0)
assert.ok(summary.value.deferredItemCounts.work >= 1)

// Apple Focus hint never auto-enters by default
const apple = appleFocusSuggestion('fitness')
assert.equal(apple.suggestedMode, 'training')
assert.equal(apple.requiresUserConfirm, true)
assert.equal(apple.autoEnter, false)

// Deep work vertical helpers
const deep = startFocusSession(null, {
  ownerId: OWNER,
  mode: 'deep_work',
  title: 'Kenos IA',
  safeSummary: 'Deep Work on Kenos navigation',
  activeSessionRef: {
    id: '70000000-0000-4000-8000-000000000001',
    type: 'work.project',
    ownerDomain: 'work',
    ownerId: OWNER,
  },
})
assert.equal(deep.ok, true)
assert.deepEqual(deep.value.visibleDomains.slice().sort(), ['library', 'plan', 'system', 'work'].sort())
const homePing = evaluateInterruption(
  deep.value,
  interruptionCandidate({
    ownerId: OWNER,
    sourceDomain: 'home',
    category: 'home_task',
    urgency: 'low',
    risk: 'R0',
    safeSummary: 'Organize shelf',
    explanation: 'Home task during deep work',
  }),
)
assert.equal(homePing.value.handling, 'defer')

console.log('kenos focus contracts + runtime: ok')
