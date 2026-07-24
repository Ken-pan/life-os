/**
 * Suppress assistant URL↔state reconcile while UI programmatically updates both.
 * Shared by +page.svelte and ChatSidebar so openRecent / openConversation do not
 * race URL→state reconcile (which would call startNewChat before ?c= is written).
 */

let applyingFromUrl = $state(false)

/** @returns {boolean} */
export function isApplyingAssistantFromUrl() {
  return applyingFromUrl
}

export function beginAssistantUrlApply() {
  applyingFromUrl = true
}

export function endAssistantUrlApply() {
  applyingFromUrl = false
}
