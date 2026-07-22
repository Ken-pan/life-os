/**
 * Assistant Home + Conversation shell helpers (Phase 1).
 * Pure functions — no Svelte / bridge side effects.
 */

export const ASSISTANT_LOCAL_MODE_KEY = 'kenos.ask.localMode'

/** @typedef {'locked' | 'home' | 'conversation'} AssistantSurface */
/** @typedef {'select' | 'clear' | 'clear-url' | 'noop'} UrlToStateAction */
/** @typedef {'set' | 'clear' | 'noop'} StateToUrlAction */

/**
 * @param {{
 *   activeId?: string | null
 *   messageCount?: number
 *   streaming?: boolean
 *   signedOut?: boolean
 *   localModeAccepted?: boolean
 * }} input
 * @returns {AssistantSurface}
 */
export function resolveAssistantSurface({
  activeId = null,
  messageCount = 0,
  streaming = false,
  signedOut = false,
  localModeAccepted = false,
  /** @deprecated use signedOut — kept for older callers */
  needsSignIn = false,
} = {}) {
  const inThread =
    Boolean(activeId) && (Number(messageCount) > 0 || Boolean(streaming))
  if (inThread) return 'conversation'
  // Ask locked gate is auth-only (not source permission_denied / CloudGate overlap).
  const locked = Boolean(signedOut || needsSignIn) && !localModeAccepted
  if (locked) return 'locked'
  return 'home'
}

/**
 * Native Global Dock hides when liveState is one of these (Kenos Mode Ask).
 * @param {AssistantSurface} surface
 */
export function liveStateForAssistantSurface(surface) {
  return surface === 'conversation' ? 'conversation' : 'idle'
}

/**
 * @param {URLSearchParams | { get?: (k: string) => string | null } | null | undefined} params
 * @returns {string | null}
 */
export function conversationIdFromSearch(params) {
  if (!params || typeof params.get !== 'function') return null
  const raw = params.get('c') || params.get('chat')
  const id = String(raw || '').trim()
  return id || null
}

/**
 * URL is source of truth for "which chat is open".
 * Never rewrite URL from state when this returns `clear` (browser/WK back).
 *
 * @param {{
 *   urlConversationId?: string | null
 *   activeId?: string | null
 *   messageCount?: number
 *   streaming?: boolean
 *   conversationExists?: boolean
 * }} input
 * @returns {UrlToStateAction}
 */
export function reconcileUrlToState({
  urlConversationId = null,
  activeId = null,
  messageCount = 0,
  streaming = false,
  conversationExists = false,
} = {}) {
  if (urlConversationId) {
    if (!conversationExists) return 'clear-url'
    if (activeId === urlConversationId) return 'noop'
    return 'select'
  }
  // No ?c= — honor history.back / returnHome. Do not clobber mid-first-send.
  if (!activeId) return 'noop'
  if (streaming) return 'noop'
  if (Number(messageCount) > 0) return 'clear'
  return 'noop'
}

/**
 * When UI owns the change (send / select / new), mirror into the URL.
 *
 * @param {{
 *   activeId?: string | null
 *   urlConversationId?: string | null
 *   messageCount?: number
 *   streaming?: boolean
 * }} input
 * @returns {StateToUrlAction}
 */
export function reconcileStateToUrl({
  activeId = null,
  urlConversationId = null,
  messageCount = 0,
  streaming = false,
} = {}) {
  const shouldExpose = Boolean(
    activeId && (Number(messageCount) > 0 || Boolean(streaming)),
  )
  if (shouldExpose && urlConversationId !== activeId) return 'set'
  if (!shouldExpose && urlConversationId) return 'clear'
  return 'noop'
}

/**
 * Build path+search for Assistant.
 * - `currentSearch` preserves unrelated params (utm, etc.)
 * - `scope === undefined`: leave scope/entity from currentSearch alone
 * - `scope === null` / `''`: clear soft scope
 * - `scope === 'work'`: set work soft scope
 *
 * @param {{
 *   pathname?: string
 *   conversationId?: string | null
 *   scope?: string | null
 *   entity?: string | null
 *   currentSearch?: string
 * }} opts
 */
export function buildAssistantHref({
  pathname = '/assistant',
  conversationId = null,
  scope = undefined,
  entity = undefined,
  currentSearch = '',
} = {}) {
  const params = new URLSearchParams(
    currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch,
  )
  if (conversationId) {
    params.set('c', String(conversationId))
    params.delete('chat')
  } else {
    params.delete('c')
    params.delete('chat')
  }

  if (scope === 'work') {
    params.set('scope', 'work')
    if (entity) params.set('entity', String(entity))
    else params.delete('entity')
  } else if (scope === null || scope === '') {
    params.delete('scope')
    params.delete('entity')
  }

  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * @param {{
 *   path?: string
 *   title?: string
 *   liveState?: string
 *   canGoBack?: boolean
 *   conversationId?: string
 *   summary?: string
 * }} input
 */
export function buildAssistantNavManifest({
  path = '/assistant',
  title = 'Assistant',
  liveState = 'idle',
  canGoBack = false,
  conversationId = '',
  summary = '',
} = {}) {
  return {
    domainId: 'kenos',
    path,
    title,
    activeTab: 'assistant',
    canGoBack: Boolean(canGoBack),
    currentEntity: String(conversationId || ''),
    liveState: String(liveState || 'idle'),
    unsavedDraft: false,
    summary: summary || title || 'Ask',
  }
}

/**
 * @param {'global' | 'context' | string} kind
 * @param {{ space?: string }} [scopeUi]
 * @returns {'all' | 'work' | 'local'}
 */
export function composerPlaceholderKind(kind, scopeUi = {}) {
  if (kind === 'context') {
    const space = String(scopeUi.space || '')
    if (space === '工作' || /work/i.test(space)) return 'work'
  }
  return 'all'
}

/**
 * Sync read for Ask local-mode preference (avoid locked flash).
 * @param {{ getItem?: (k: string) => string | null } | null | undefined} storage
 */
export function readLocalModeAccepted(storage) {
  if (!storage || typeof storage.getItem !== 'function') return false
  try {
    return storage.getItem(ASSISTANT_LOCAL_MODE_KEY) === '1'
  } catch {
    return false
  }
}
