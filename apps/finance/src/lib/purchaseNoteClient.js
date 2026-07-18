// FINC.PURCHASE.6b — per-transaction note + handled ("已处理") client orchestration.
//
// Pure async helpers extracted from PurchaseEnrichmentBlock.svelte so the
// load / save boundaries (no row yet, save success, transport error, and the
// "notes not deployed yet" degrade) are unit-testable without a live Supabase
// session or a logged-in owner.
//
// Each helper takes an `rpc` shaped like supabase.rpc(name, params) → { data,
// error } and returns a plain patch the component maps onto its reactive state.
// The Postgres RPCs (purchase_note_get / _set) are authoritative and return
// { ok, note, handled, handled_at } JSON.
//
// Unlike the 6.a review chain there is no state machine here: a note is a plain
// per-(user, transaction) upsert, so there is no version / undo / idempotency
// ceremony — just load and save, with graceful self-hide when the annotation
// table isn't reachable (e.g. migration not yet deployed to this environment).
//
// RPC contract: apps/finance/supabase/migrations/20260717230000_finance_purchase_notes.sql

/**
 * @typedef {Object} NoteState
 * @property {boolean} available False → the note RPC is unreachable; the UI self-hides.
 * @property {string} note Private free-text note ('' when none).
 * @property {boolean} handled Whether the user marked this transaction handled.
 * @property {string|null} handledAt ISO timestamp of when it was marked handled.
 */

/** @type {NoteState} */
const EMPTY = { available: false, note: '', handled: false, handledAt: null }

/**
 * Load the note + handled flag for a transaction. A missing row resolves to the
 * "no annotation" state (available=true, empty note) — distinct from a transport
 * error, which resolves to `available:false` so the note UI self-hides (the
 * migration may not be deployed in this environment). Never throws.
 *
 * @param {(name: string, params: object) => Promise<{ data: any, error: any }>} rpc
 * @param {string} transactionId
 * @returns {Promise<NoteState>}
 */
export async function loadNote(rpc, transactionId) {
  try {
    const { data, error } = await rpc('purchase_note_get', {
      p_transaction_id: transactionId,
    })
    if (error) throw error
    if (data?.ok) {
      return {
        available: true,
        note: data.note ?? '',
        handled: !!data.handled,
        handledAt: data.handled_at ?? null,
      }
    }
    return { ...EMPTY }
  } catch {
    return { ...EMPTY }
  }
}

/**
 * @typedef {Object} SavePatch
 * @property {'saved'|'error'} status Explicit outcome the caller surfaces as-is.
 * @property {string} note Server-echoed note (falls back to the sent value on error).
 * @property {boolean} handled Server-echoed handled flag.
 * @property {string|null} handledAt Server-stamped handled timestamp (null when unmarked).
 */

/**
 * Upsert the note + handled flag. On success returns the server-echoed row and
 * `status:'saved'`; on any transport error returns `status:'error'` with the
 * optimistic values the caller already applied, so the field keeps the user's
 * text and shows a retryable error. Never throws.
 *
 * @param {(name: string, params: object) => Promise<{ data: any, error: any }>} rpc
 * @param {{ transactionId: string, note: string, handled: boolean }} input
 * @returns {Promise<SavePatch>}
 */
export async function saveNote(rpc, { transactionId, note, handled }) {
  try {
    const { data, error } = await rpc('purchase_note_set', {
      p_transaction_id: transactionId,
      p_note: note,
      p_handled: handled,
    })
    if (error) throw error
    if (data?.ok) {
      return {
        status: 'saved',
        note: data.note ?? note,
        handled: !!data.handled,
        handledAt: data.handled_at ?? null,
      }
    }
    return { status: 'error', note, handled, handledAt: null }
  } catch {
    return { status: 'error', note, handled, handledAt: null }
  }
}
