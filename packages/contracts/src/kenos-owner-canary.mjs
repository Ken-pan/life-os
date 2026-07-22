// Owner-only production writer canary — decision contract (G3).
//
// This is the executable mirror of the SQL gate in
// apps/finance/supabase/migrations/PENDING_kenos_owner_canary.sql.notapplied
// (`kenos_assert_owner_canary` + `kenos_canary_action_prohibited`). Keeping the
// logic here lets it be unit-tested deterministically and lets clients pre-check
// before a round-trip. The SQL function remains the AUTHORITATIVE enforcement;
// this must stay behaviourally identical (see kenos-owner-canary.test.mjs and
// the pgTAP test apps/finance/supabase/tests/owner_canary.test.sql).

// Rejected even if an operator mis-adds them to an allowlist.
export function isProhibitedCanaryAction(actionType) {
  const a = String(actionType ?? '')
  if (a === '') return true
  return (
    a.startsWith('work.') ||
    a.startsWith('email.') ||
    a.startsWith('calendar.') ||
    a.startsWith('connector.') ||
    a.startsWith('native.') ||
    a.includes('bulk') ||
    a.includes('delete_all') ||
    a.startsWith('url.') ||
    a.startsWith('http.')
  )
}

/**
 * Default-DENY decision. Every input explicit; returns { ok, reason }.
 * @param {object} p
 * @param {string|null} p.authUid            the authenticated user (auth.uid()); null = unauthenticated
 * @param {string} p.actionType
 * @param {string} p.rpc
 * @param {number} p.nowMs
 * @param {Array<object>} p.canaryRows        the caller's own canary rows (RLS-scoped)
 */
export function evaluateOwnerCanary({ authUid, actionType, rpc, nowMs, canaryRows = [] }) {
  if (!authUid) return deny('not_authenticated')
  if (isProhibitedCanaryAction(actionType)) return deny('prohibited_action_class')

  const own = canaryRows.filter((r) => r.owner_id === authUid)
  if (own.length === 0) return deny('no_canary_for_owner')

  const active = own.filter(
    (r) => r.environment === 'production' && r.disabled === false &&
      nowMs >= Date.parse(r.starts_at) && nowMs < Date.parse(r.expires_at),
  )
  if (active.length === 0) return deny('no_active_window_or_disabled')

  const match = active.find(
    (r) => Array.isArray(r.allowed_action_types) && r.allowed_action_types.includes(actionType) &&
      Array.isArray(r.allowed_rpcs) && r.allowed_rpcs.includes(rpc),
  )
  if (!match) return deny('action_or_rpc_not_allowlisted')

  return { ok: true, reason: 'authorized' }
}

function deny(reason) {
  return { ok: false, reason }
}
