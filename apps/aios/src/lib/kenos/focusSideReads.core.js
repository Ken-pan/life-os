/**
 * Optional Focus side-read capabilities (deferred items / proactive suggestions).
 * Capability Registry decides available vs unavailable; unavailable must not hit the network.
 */

import {
  isProdFocusDeferredReadEnabled,
  isProdFocusSuggestionsReadEnabled,
} from './prodReadFlags.core.js'

export const FOCUS_DEFERRED_SOURCE = 'public.kenos_deferred_items'
export const FOCUS_SUGGESTION_SOURCE = 'public.kenos_proactive_suggestions'

/** Schema-aligned selects — wrong columns caused production GET 400 noise. */
export const FOCUS_DEFERRED_SELECT =
  'id,owner_id,focus_context_id,status,safe_summary,deferred_at,original_created_at,urgency'

export const FOCUS_SUGGESTIONS_SELECT =
  'id,owner_id,focus_context_id,status,safe_summary,title,created_at,suggestion_type'

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function focusDeferredCapability(env = import.meta.env) {
  const available = isProdFocusDeferredReadEnabled(env)
  return Object.freeze({
    id: 'focus.deferred.read',
    domain: 'focus',
    operation: 'read',
    surface: available ? 'available' : 'unavailable',
    sourceOfTruth: FOCUS_DEFERRED_SOURCE,
    userSafeLabel: available ? '延期事项可读' : '延期事项尚未开启',
    userSafeDetail: available
      ? '从你的 Focus 延期列表读取。'
      : '能力未开启时不会请求该来源，也不会显示为零条。',
    productionReady: available,
    writesProduction: false,
  })
}

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function focusSuggestionsCapability(env = import.meta.env) {
  const available = isProdFocusSuggestionsReadEnabled(env)
  return Object.freeze({
    id: 'focus.suggestions.read',
    domain: 'focus',
    operation: 'read',
    surface: available ? 'available' : 'unavailable',
    sourceOfTruth: FOCUS_SUGGESTION_SOURCE,
    userSafeLabel: available ? '建议可读' : '建议尚未开启',
    userSafeDetail: available
      ? '从你的 Focus 建议列表读取。'
      : '能力未开启时不会请求该来源，也不会显示为零条。',
    productionReady: available,
    writesProduction: false,
  })
}

/**
 * @param {'deferred'|'suggestions'} kind
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isFocusSideReadAvailable(kind, env = import.meta.env) {
  return kind === 'deferred'
    ? isProdFocusDeferredReadEnabled(env)
    : isProdFocusSuggestionsReadEnabled(env)
}
