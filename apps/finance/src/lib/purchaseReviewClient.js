// FINC.PURCHASE.6.a — transaction↔order purchase-review client orchestration.
//
// Pure async helpers extracted from PurchaseEnrichmentBlock.svelte so the owner
// Confirm → Undo chain and its boundaries (empty result, duplicate/idempotent
// annotation, version conflict, timeout, undo rollback) are unit-testable
// without a live Supabase session or a logged-in owner.
//
// Each helper takes an `rpc` shaped like supabase.rpc(name, params) → { data,
// error } and returns a plain patch the component maps onto its reactive state.
// The Postgres RPCs (purchase_review_get / _decide / _undo) are authoritative and
// return { ok, status, error, association, decision } JSON (they never throw on a
// conflict — a 409 comes back in `data.status`). These helpers mirror that
// contract 1:1 and deliberately own NO reactive UI concern (timers, optimistic
// echo) — that stays in the component.
//
// SSOT for the state machine: packages/finance-core/src/engine/purchaseReviewDecision.ts
// RPC contract: apps/finance/supabase/migrations/20260713120000_purchase_review_associations.sql

/**
 * @typedef {Object} Association
 * @property {string} id
 * @property {'proposed'|'confirmed'|'rejected'} state
 * @property {number} association_version
 * @property {string} [transaction_id]
 */

/**
 * @typedef {Object} ReviewPatch
 * @property {Association|null} association Authoritative row (null → review UI self-hides).
 * @property {string|null} lastDecisionId Latest reversible decision id (Undo target).
 * @property {'idle'|'stale'|'unknown'} status Explicit outcome the caller MUST surface as-is.
 */

/**
 * Fetch authoritative review state for a transaction. A 404 (no association) or
 * any transport error resolves to an empty state so the review UI self-hides —
 * the "empty result" boundary. Never throws.
 *
 * @param {(name: string, params: object) => Promise<{ data: any, error: any }>} rpc
 * @param {string} transactionId
 * @returns {Promise<{ association: Association|null, lastDecisionId: string|null }>}
 */
export async function loadReviewState(rpc, transactionId) {
  try {
    const { data, error } = await rpc('purchase_review_get', {
      p_transaction_id: transactionId,
    })
    if (error) throw error
    if (data?.ok && data.association) {
      // Latest non-undo decision is the Undo target; a fully-undone history has none.
      const decided = (data.decisions ?? [])
        .filter((d) => d.action_type !== 'undo')
        .at(-1)
      return { association: data.association, lastDecisionId: decided?.id ?? null }
    }
    return { association: null, lastDecisionId: null }
  } catch {
    return { association: null, lastDecisionId: null }
  }
}

/**
 * Confirm or reject a `proposed` association. On success the caller should open
 * the Undo affordance (`openUndo`). On a 409 version conflict or an
 * unknown/timeout error, the authoritative row is reconciled from the server and
 * an explicit `stale` / `unknown` status is returned that the caller surfaces
 * verbatim.
 *
 * NOTE: reconciliation deliberately does NOT reset the status to idle — the prior
 * implementation reloaded through the status-owning loader, which clobbered the
 * 409/timeout warning back to idle so it never rendered. Keeping the status here
 * is the fix.
 *
 * @param {(name: string, params: object) => Promise<{ data: any, error: any }>} rpc
 * @param {{ prev: Association, actionType: 'confirm'|'reject', actionKey: string, transactionId: string }} input
 * @returns {Promise<ReviewPatch & { openUndo: boolean }>}
 */
export async function resolveDecide(rpc, { prev, actionType, actionKey, transactionId }) {
  try {
    const { data, error } = await rpc('purchase_review_decide', {
      p_association_id: prev.id,
      p_action_type: actionType,
      p_expected_version: prev.association_version,
      p_action_key: actionKey,
    })
    if (error) throw error
    if (data?.ok) {
      // Covers both a fresh decision and an idempotent replay (duplicate
      // action_key) — the RPC returns the original association + decision, so no
      // second event is created and the echo simply reconciles to server truth.
      return {
        association: data.association ?? prev,
        lastDecisionId: data.decision?.id ?? null,
        status: 'idle',
        openUndo: true,
      }
    }
    if (data?.status === 409) {
      const reconciled = await loadReviewState(rpc, transactionId)
      return { ...reconciled, status: 'stale', openUndo: false }
    }
    // not_proposed / no_association / invalid_action (400/404): reconcile from the
    // returned row (when present) and drop back to idle without an Undo window.
    return {
      association: data?.association ?? prev,
      lastDecisionId: null,
      status: 'idle',
      openUndo: false,
    }
  } catch {
    const reconciled = await loadReviewState(rpc, transactionId)
    return { ...reconciled, status: 'unknown', openUndo: false }
  }
}

/**
 * Undo the latest reversible decision, rolling the association back to the state
 * it was in before that decision (the "撤销后状态回滚" boundary). On success the
 * caller closes the Undo affordance (`closeUndo`). Conflicts / not-reversible /
 * timeout all reconcile from the server and close the (now-invalid) affordance;
 * a 409 (version conflict or already-superseded undo) additionally surfaces the
 * `stale` warning.
 *
 * @param {(name: string, params: object) => Promise<{ data: any, error: any }>} rpc
 * @param {{ prev: Association, lastDecisionId: string, actionKey: string, transactionId: string }} input
 * @returns {Promise<ReviewPatch & { closeUndo: boolean }>}
 */
export async function resolveUndo(rpc, { prev, lastDecisionId, actionKey, transactionId }) {
  try {
    const { data, error } = await rpc('purchase_review_undo', {
      p_association_id: prev.id,
      p_target_decision_id: lastDecisionId,
      p_expected_version: prev.association_version,
      p_action_key: actionKey,
    })
    if (error) throw error
    if (data?.ok) {
      return {
        association: data.association ?? prev,
        lastDecisionId: null,
        status: 'idle',
        closeUndo: true,
      }
    }
    if (data?.status === 409) {
      const reconciled = await loadReviewState(rpc, transactionId)
      return { ...reconciled, status: 'stale', closeUndo: true }
    }
    // not_reversible / unknown_decision / no_association: reconcile + drop the
    // affordance so a dead Undo button can't linger.
    const reconciled = await loadReviewState(rpc, transactionId)
    return { ...reconciled, status: 'idle', closeUndo: true }
  } catch {
    const reconciled = await loadReviewState(rpc, transactionId)
    return { ...reconciled, status: 'unknown', closeUndo: true }
  }
}
