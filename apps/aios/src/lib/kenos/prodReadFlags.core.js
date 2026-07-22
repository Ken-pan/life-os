/**
 * Production Kenos read-path feature flags.
 * All default Off — preview/canary must opt in explicitly.
 * Never treat local demo/simulation as production-ready.
 *
 * `VITE_KENOS_READ_CANARY=1` opts Focus/Work/Today overlay/Shadow On for the
 * isolated Read Client Canary while keeping all production writes fail-closed.
 */

import { isProdReadCanaryMode } from './prodWriteGuard.core.js'

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdApprovalReadEnabled(env = import.meta.env) {
  // Approvals already ship on the canonical RPC; keep always-on for authenticated reads.
  // Explicit Off only when VITE_KENOS_PROD_READ_APPROVALS=0.
  return env?.VITE_KENOS_PROD_READ_APPROVALS !== '0'
}

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdFocusReadEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return env?.VITE_KENOS_PROD_READ_FOCUS !== '0'
  return env?.VITE_KENOS_PROD_READ_FOCUS === '1'
}

/**
 * Optional Focus side reads. Default follows Focus read flag.
 * Explicit `=0` marks capability unavailable and suppresses network requests.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdFocusDeferredReadEnabled(env = import.meta.env) {
  if (!isProdFocusReadEnabled(env)) return false
  return env?.VITE_KENOS_PROD_READ_FOCUS_DEFERRED !== '0'
}

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdFocusSuggestionsReadEnabled(env = import.meta.env) {
  if (!isProdFocusReadEnabled(env)) return false
  return env?.VITE_KENOS_PROD_READ_FOCUS_SUGGESTIONS !== '0'
}

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdWorkReadEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return env?.VITE_KENOS_PROD_READ_WORK !== '0'
  return env?.VITE_KENOS_PROD_READ_WORK === '1'
}

/**
 * Training Space production read from portal_today_summary.fitness.
 * Default Off — never show hardcoded Push Day as production truth.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdTrainingReadEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return env?.VITE_KENOS_PROD_READ_TRAINING !== '0'
  return env?.VITE_KENOS_PROD_READ_TRAINING === '1'
}

/**
 * Money Space production read from portal_today_summary.finance.
 * Default Off.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdMoneyReadEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return env?.VITE_KENOS_PROD_READ_MONEY !== '0'
  return env?.VITE_KENOS_PROD_READ_MONEY === '1'
}

/**
 * Music Space production read from portal_today_summary.music.
 * Default Off.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdMusicReadEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return env?.VITE_KENOS_PROD_READ_MUSIC !== '0'
  return env?.VITE_KENOS_PROD_READ_MUSIC === '1'
}

/**
 * Home Space production read from portal_today_summary.home.
 * Default Off.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdHomeReadEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return env?.VITE_KENOS_PROD_READ_HOME !== '0'
  return env?.VITE_KENOS_PROD_READ_HOME === '1'
}

/**
 * When On, Today may attach Kenos Work/Focus capability chips from production reads.
 * Default Off — Today remains legacy portal_today_summary + local Work foundation.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdTodayKenosOverlayEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return env?.VITE_KENOS_PROD_READ_TODAY_OVERLAY !== '0'
  return env?.VITE_KENOS_PROD_READ_TODAY_OVERLAY === '1'
}

/**
 * Canonical Plan Activity read (`kenos_list_plan_activity`) merged into the
 * Activity feed. Read projection only — Activity append stays in Plan RPCs.
 * Default Off.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdPlanActivityReadEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return env?.VITE_KENOS_PROD_READ_PLAN_ACTIVITY !== '0'
  return env?.VITE_KENOS_PROD_READ_PLAN_ACTIVITY === '1'
}

/**
 * Shadow comparison against independent legacy fixtures/sources.
 * Default On in non-production builds; Off unless explicitly enabled in prod hosts.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdShadowCompareEnabled(env = import.meta.env) {
  if (env?.VITE_KENOS_PROD_SHADOW === '0') return false
  if (env?.VITE_KENOS_PROD_SHADOW === '1') return true
  if (isProdReadCanaryMode(env)) return true
  return env?.DEV === true || env?.MODE === 'development'
}

export function prodReadFlagSnapshot(env = import.meta.env) {
  return Object.freeze({
    readCanary: isProdReadCanaryMode(env),
    approvals: isProdApprovalReadEnabled(env),
    focus: isProdFocusReadEnabled(env),
    focusDeferred: isProdFocusDeferredReadEnabled(env),
    focusSuggestions: isProdFocusSuggestionsReadEnabled(env),
    work: isProdWorkReadEnabled(env),
    training: isProdTrainingReadEnabled(env),
    money: isProdMoneyReadEnabled(env),
    music: isProdMusicReadEnabled(env),
    home: isProdHomeReadEnabled(env),
    todayOverlay: isProdTodayKenosOverlayEnabled(env),
    planActivity: isProdPlanActivityReadEnabled(env),
    shadow: isProdShadowCompareEnabled(env),
    planCommandWrite: false,
    approvalDecisionWrite: false,
    captureIngestWrite: false,
    focusWrite: false,
    workWrite: false,
    executor: false,
  })
}
