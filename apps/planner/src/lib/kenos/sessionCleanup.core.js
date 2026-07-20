/**
 * Logout / account-switch cleanup for Planner compatibility.
 * Clears user content from in-memory state + device STORAGE_KEY while
 * preserving device-level settings (theme, locale, rhythm prefs, …).
 */

import { SYSTEM_LIST_INBOX } from '../types.js'

/**
 * @param {import('../types.js').AppState | null | undefined} state
 * @returns {import('../types.js').AppState}
 */
export function buildSignedOutState(state) {
  const settings = state?.settings && typeof state.settings === 'object' ? { ...state.settings } : {}
  const inbox = {
    id: SYSTEM_LIST_INBOX,
    title: 'inbox',
    icon: 'inbox',
    color: '#F5A623',
    sortOrder: 0,
    system: 'inbox',
    updatedAt: 0,
    deletedAt: null,
  }
  return {
    schemaVersion: state?.schemaVersion ?? 2,
    tasks: [],
    projects: [],
    attachments: [],
    kenosActionOutbox: [],
    kenosActivity: [],
    lists: [inbox],
    settings: {
      ...settings,
      defaultListId: SYSTEM_LIST_INBOX,
      updatedAt: typeof settings.updatedAt === 'number' ? settings.updatedAt : 0,
    },
  }
}

/**
 * True when state still holds user-owned content that must not survive logout.
 * @param {import('../types.js').AppState | null | undefined} state
 */
export function hasUserScopedContent(state) {
  if (!state) return false
  if (Array.isArray(state.tasks) && state.tasks.length > 0) return true
  if (Array.isArray(state.projects) && state.projects.length > 0) return true
  if (Array.isArray(state.attachments) && state.attachments.length > 0) return true
  if (Array.isArray(state.kenosActionOutbox) && state.kenosActionOutbox.length > 0) return true
  if (Array.isArray(state.kenosActivity) && state.kenosActivity.length > 0) return true
  if (Array.isArray(state.lists) && state.lists.some((list) => list && !list.system)) return true
  return false
}
