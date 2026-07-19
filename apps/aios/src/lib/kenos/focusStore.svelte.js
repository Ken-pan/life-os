import { browser } from '$app/environment'
import {
  acceptSuggestion,
  assistantScopeForPrompt,
  cancelFocus,
  clearFocusState,
  dismissSuggestion,
  emptyFocusState,
  endFocus,
  focusUiFlags,
  loadFocusState,
  pauseFocus,
  resumeFocus,
  returnToFocus,
  saveFocusState,
  startDeepWorkFocus,
  startTrainingFocus,
  temporarilyLeaveFocus,
} from './focusStore.core.js'

export const FOCUS = $state(emptyFocusState())

function commit(next) {
  Object.assign(FOCUS, next)
  if (browser) saveFocusState(FOCUS)
}

export function hydrateFocusStore() {
  if (!browser) return
  const loaded = loadFocusState()
  Object.assign(FOCUS, loaded)
}

export function startTraining() {
  hydrateFocusStore()
  commit(startTrainingFocus({ ...FOCUS }))
}

export function startDeepWork(options) {
  hydrateFocusStore()
  commit(startDeepWorkFocus({ ...FOCUS }, options))
}

export function pauseSession() {
  commit(pauseFocus({ ...FOCUS }))
}

export function resumeSession() {
  commit(resumeFocus({ ...FOCUS }))
}

export function askLeaveSession() {
  FOCUS.leavePromptOpen = true
}

export function cancelLeavePrompt() {
  FOCUS.leavePromptOpen = false
}

export function leaveSessionTemporarily() {
  commit(temporarilyLeaveFocus({ ...FOCUS }))
}

export function returnSession() {
  commit(returnToFocus({ ...FOCUS }))
}

export function endSession(options) {
  commit(endFocus({ ...FOCUS }, options))
}

export function cancelSession() {
  commit(cancelFocus({ ...FOCUS }))
}

export function dismissFocusSuggestion(id) {
  commit(dismissSuggestion({ ...FOCUS }, id))
}

export function acceptFocusSuggestion(id) {
  commit(acceptSuggestion({ ...FOCUS }, id))
}

export function resetFocusStore() {
  Object.assign(FOCUS, clearFocusState())
}

export function scopedAssistant(requestedDomains = [], userExplicit = false) {
  return assistantScopeForPrompt(FOCUS, requestedDomains, userExplicit)
}

export function focusFlags() {
  return focusUiFlags(FOCUS)
}

export function elapsedSeconds(now = Date.now()) {
  const focus = FOCUS.focus
  if (!focus?.startedAt) return 0
  const end = focus.endedAt ? Date.parse(focus.endedAt) : now
  return Math.max(0, Math.floor((end - Date.parse(focus.startedAt)) / 1000))
}

export function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
