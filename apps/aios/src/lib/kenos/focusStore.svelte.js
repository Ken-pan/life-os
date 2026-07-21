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
import {
  endFocusLiveActivity,
  publishFocusLiveActivity,
} from './kenosLiveActivity.js'

export const FOCUS = $state(emptyFocusState())

function commit(next) {
  Object.assign(FOCUS, next)
  if (browser) saveFocusState(FOCUS)
}

function syncLiveActivity(next = FOCUS) {
  if (!browser) return
  const focus = next?.focus
  if (!focus) return
  const status = String(focus.status || '')
  if (['active', 'paused', 'temporarily_left', 'ending'].includes(status)) {
    void publishFocusLiveActivity(focus)
  }
}

export function hydrateFocusStore() {
  if (!browser) return
  const loaded = loadFocusState()
  Object.assign(FOCUS, loaded)
}

export function startTraining(options) {
  hydrateFocusStore()
  const next = startTrainingFocus({ ...FOCUS }, options)
  commit(next)
  syncLiveActivity(next)
}

export function startDeepWork(options) {
  hydrateFocusStore()
  const next = startDeepWorkFocus({ ...FOCUS }, options)
  commit(next)
  syncLiveActivity(next)
}

export function pauseSession() {
  const next = pauseFocus({ ...FOCUS })
  commit(next)
  syncLiveActivity(next)
}

export function resumeSession() {
  const next = resumeFocus({ ...FOCUS })
  commit(next)
  syncLiveActivity(next)
}

export function askLeaveSession() {
  FOCUS.leavePromptOpen = true
}

export function cancelLeavePrompt() {
  FOCUS.leavePromptOpen = false
}

export function leaveSessionTemporarily() {
  const next = temporarilyLeaveFocus({ ...FOCUS })
  commit(next)
  syncLiveActivity(next)
}

export function returnSession() {
  const next = returnToFocus({ ...FOCUS })
  commit(next)
  syncLiveActivity(next)
}

export function endSession(options) {
  const mode = FOCUS.focus?.mode
  const next = endFocus({ ...FOCUS }, options)
  commit(next)
  void endFocusLiveActivity(mode)
}

export function cancelSession() {
  const mode = FOCUS.focus?.mode
  const next = cancelFocus({ ...FOCUS })
  commit(next)
  void endFocusLiveActivity(mode)
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
