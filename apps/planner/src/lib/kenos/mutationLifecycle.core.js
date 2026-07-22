/**
 * Kenos mutation lifecycle (F5-05.2) — one explicit state machine for a queued
 * canonical mutation, replacing the implicit pending/failed/dead_letter trio.
 *
 * States (only those meaningful for a durable queued write are persisted):
 *   LOCAL_DRAFT       not yet queued (UI-local; not stored here)
 *   QUEUED            durable, waiting for a flush window        (persisted: 'pending')
 *   SENDING           RPC in flight                              (transient, not persisted)
 *   SERVER_CONFIRMED  RPC returned ok → intent removed           (terminal success)
 *   RETRYABLE_FAILURE transient error, will retry                (persisted: 'failed')
 *   AUTH_BLOCKED      no/mismatched session → hold, do not drop  (persisted: 'auth_blocked')
 *   CONFLICT          server reports a newer version             (persisted: 'conflict')
 *   REJECTED          permanent server rejection, never retry    (persisted: 'rejected')
 *   CANCELLED         user discarded                             (removed)
 *   DEAD_LETTER       retryable failure exceeded max attempts    (persisted: 'dead_letter')
 *
 * The persisted `status` strings stay backward-compatible with the existing
 * queue ('pending'/'failed'/'dead_letter'); 'rejected'/'conflict'/'auth_blocked'
 * are new terminal-ish holds that are NOT retried on subsequent flush cycles.
 */

export const MUTATION_STATE = Object.freeze({
  LOCAL_DRAFT: 'local_draft',
  QUEUED: 'pending',
  SENDING: 'sending',
  SERVER_CONFIRMED: 'server_confirmed',
  RETRYABLE_FAILURE: 'failed',
  AUTH_BLOCKED: 'auth_blocked',
  CONFLICT: 'conflict',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  DEAD_LETTER: 'dead_letter',
})

// Statuses a flush cycle must NOT re-attempt (terminal / needs explicit user or
// auth action). Everything else ('pending'/'failed'/undefined) is retryable.
export const NON_RETRYABLE_STATUSES = Object.freeze(
  new Set([MUTATION_STATE.DEAD_LETTER, MUTATION_STATE.REJECTED, MUTATION_STATE.CONFLICT]),
)

// Permanent server rejections raised by the Plan/Capture RPCs — retrying these
// can never succeed (bad request shape, wrong owner, policy), so they must go
// straight to REJECTED instead of burning the retry budget.
const PERMANENT_ERROR_CODES = new Set([
  'schema_version_not_supported',
  'actor_id_required',
  'actor_user_mismatch',
  'actor_type_not_allowed',
  'wrong_owner',
  'producer_not_allowed',
  'security_domain_not_allowed',
  'risk_not_allowed',
  'unsupported_action',
  'invalid_action_payload',
  'device_id_required',
  'requested_at_required',
  'idempotency_key_required',
  'correlation_id_required',
  'action_id_reused',
  'capture_id_required',
  'capture_not_found',
  'invalid_capture_status_for_ingest',
  'title_required',
  'task_not_found',
])

const CONFLICT_ERROR_CODES = new Set([
  'stale_version',
  'version_conflict',
  'conflict',
])

const AUTH_ERROR_CODES = new Set([
  'auth_required',
  'auth_mismatch_or_missing',
  'jwt expired',
  'jwt_expired',
  'token_expired',
  'unauthorized',
])

/**
 * Classify a flush error string into a lifecycle category.
 * @param {string | null | undefined} error
 * @returns {'retryable' | 'rejected' | 'conflict' | 'auth'}
 */
export function classifyFlushError(error) {
  const raw = String(error || '').toLowerCase().trim()
  if (!raw) return 'retryable'
  // `unsupported_action:plan.foo` style — strip the suffix.
  const code = raw.split(':')[0].trim()
  for (const c of AUTH_ERROR_CODES) if (raw.includes(c)) return 'auth'
  if (CONFLICT_ERROR_CODES.has(code)) return 'conflict'
  if (PERMANENT_ERROR_CODES.has(code)) return 'rejected'
  // Network / transient shapes → retryable.
  return 'retryable'
}

/**
 * Compute the next persisted state for an intent after a flush attempt.
 * @param {{ status?: string, attempts?: number }} intent
 * @param {{ ok: boolean, error?: string, duplicate?: boolean }} result
 * @param {number} maxAttempts
 * @returns {{ status: string, attempts: number, lastError?: string, removed?: boolean }}
 */
export function nextIntentState(intent, result, maxAttempts) {
  if (result?.ok) {
    // SERVER_CONFIRMED (incl. idempotent duplicate) → caller removes the intent.
    return { status: MUTATION_STATE.SERVER_CONFIRMED, attempts: intent.attempts || 0, removed: true }
  }
  const category = classifyFlushError(result?.error)
  const attempts = (intent.attempts || 0) + 1
  if (category === 'rejected') {
    return { status: MUTATION_STATE.REJECTED, attempts, lastError: result?.error || 'rejected' }
  }
  if (category === 'conflict') {
    return { status: MUTATION_STATE.CONFLICT, attempts, lastError: result?.error || 'conflict' }
  }
  if (category === 'auth') {
    // Do NOT count auth as an attempt — hold until reauth (attempts unchanged).
    return {
      status: MUTATION_STATE.AUTH_BLOCKED,
      attempts: intent.attempts || 0,
      lastError: result?.error || 'auth_blocked',
    }
  }
  // retryable
  const dead = attempts >= maxAttempts
  return {
    status: dead ? MUTATION_STATE.DEAD_LETTER : MUTATION_STATE.RETRYABLE_FAILURE,
    attempts,
    lastError: result?.error || 'flush_failed',
  }
}

/**
 * A queued intent's user-facing sync status (no infra jargon).
 * @param {{ status?: string }} intent
 * @returns {'pending' | 'failed' | 'conflict' | 'blocked'}
 */
export function userSyncStatus(intent) {
  switch (intent?.status) {
    case MUTATION_STATE.REJECTED:
    case MUTATION_STATE.DEAD_LETTER:
      return 'failed'
    case MUTATION_STATE.CONFLICT:
      return 'conflict'
    case MUTATION_STATE.AUTH_BLOCKED:
      return 'blocked'
    default:
      return 'pending'
  }
}
