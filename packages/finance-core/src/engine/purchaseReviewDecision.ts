// FINC.PURCHASE.6.a — Purchase Review decision engine (data-foundation SSOT).
//
// Pure, deterministic reducer for the transaction↔order review workflow. This is
// the authoritative logic that the Supabase RPC functions
// (purchase_review_confirm / _reject / _undo) mirror one-to-one, and that the
// client uses for optimistic updates. It intentionally carries NO IO — the DB
// enforces RLS ownership + row-level version conflicts; this module encodes the
// state machine, optimistic versioning, action_key idempotency, Undo linkage and
// automation precedence so all of it is unit-testable without a database.
//
// Design source of truth: apps/finance/docs/FP6_PURCHASE_REVIEW_DATA_CONTRACT.md

import type { PurchaseEnrichmentSource } from './purchaseEnrichment.js'

/** Association lifecycle state. `proposed` is a live candidate awaiting a human decision. */
export type PurchaseReviewState = 'proposed' | 'confirmed' | 'rejected'

/** Kind of decision event appended to the association history. */
export type PurchaseReviewActionType = 'confirm' | 'reject' | 'undo'

/**
 * Durable association between one bank transaction and one suggested merchant
 * order. Stable identity is `transaction_id + source + external_order_id`; a
 * different order candidate is a different association row.
 */
export interface PurchaseAssociation {
  id: string
  transactionId: string
  source: PurchaseEnrichmentSource
  externalOrderId: string
  state: PurchaseReviewState
  /** Monotonic optimistic-concurrency counter; every state mutation increments it. */
  associationVersion: number
  /** Latest decision epoch; increments once per appended decision event. */
  decisionVersion: number
}

/** Append-only decision event. History is never rewritten; Undo appends a new row. */
export interface PurchaseDecision {
  id: string
  associationId: string
  /** Client idempotency key — a duplicate submission returns the original result. */
  actionKey: string
  actionType: PurchaseReviewActionType
  fromState: PurchaseReviewState
  toState: PurchaseReviewState
  expectedAssociationVersion: number
  resultingAssociationVersion: number
  /** For `undo` only: the decision this reverses. Null for confirm/reject. */
  reversesDecisionId: string | null
  createdAt: number
}

/**
 * Error codes mirror the RPC contract (FP6 data contract §"RPC contract").
 * The paired HTTP status is what the RPC surfaces to the client.
 */
export type PurchaseReviewErrorCode =
  | 'not_proposed' //     400 — confirm/reject requires state === 'proposed'
  | 'version_conflict' // 409 — expectedAssociationVersion !== current
  | 'unknown_decision' // 404 — undo target decision does not exist
  | 'not_reversible' //   400 — undo target is not the latest reversible decision
  | 'superseded' //       409 — undo target was already reversed

export const PURCHASE_REVIEW_ERROR_STATUS: Record<PurchaseReviewErrorCode, number> = {
  not_proposed: 400,
  version_conflict: 409,
  unknown_decision: 404,
  not_reversible: 400,
  superseded: 409,
}

export interface PurchaseReviewRequest {
  actionType: PurchaseReviewActionType
  /** Idempotency key. A repeated key returns the prior decision without a new event. */
  actionKey: string
  expectedAssociationVersion: number
  /** Required for `undo`: the confirm/reject decision to reverse. */
  targetDecisionId?: string
  /** Injected id for the new decision event (DB supplies a uuid). */
  newDecisionId: string
  /** Injected timestamp (DB supplies now()). */
  now: number
}

export interface PurchaseReviewResult {
  ok: boolean
  error?: PurchaseReviewErrorCode
  /** Authoritative association after applying the request (unchanged on error / replay). */
  association: PurchaseAssociation
  /** The new decision, or the original decision on an idempotent replay. */
  decision?: PurchaseDecision
  /** True when `actionKey` matched an existing decision — no new event was appended. */
  idempotentReplay?: boolean
}

function fail(
  association: PurchaseAssociation,
  error: PurchaseReviewErrorCode,
): PurchaseReviewResult {
  return { ok: false, error, association }
}

/**
 * The single mutation entry point. Given the current authoritative association,
 * its full decision history and a request, returns the next association + the
 * appended decision (or an error / idempotent replay). Never mutates its inputs.
 */
export function applyPurchaseReviewDecision(
  association: PurchaseAssociation,
  decisions: readonly PurchaseDecision[],
  request: PurchaseReviewRequest,
): PurchaseReviewResult {
  // 1. Idempotency: a duplicate action_key returns the original result, no new event.
  const prior = decisions.find((d) => d.actionKey === request.actionKey)
  if (prior) {
    return { ok: true, association, decision: prior, idempotentReplay: true }
  }

  if (request.actionType === 'undo') {
    return applyUndo(association, decisions, request)
  }
  return applyConfirmOrReject(association, decisions, request)
}

function applyConfirmOrReject(
  association: PurchaseAssociation,
  _decisions: readonly PurchaseDecision[],
  request: PurchaseReviewRequest,
): PurchaseReviewResult {
  // Only a live candidate can be confirmed or rejected.
  if (association.state !== 'proposed') {
    return fail(association, 'not_proposed')
  }
  if (request.expectedAssociationVersion !== association.associationVersion) {
    return fail(association, 'version_conflict')
  }

  const toState: PurchaseReviewState =
    request.actionType === 'confirm' ? 'confirmed' : 'rejected'
  const resultingAssociationVersion = association.associationVersion + 1

  const decision: PurchaseDecision = {
    id: request.newDecisionId,
    associationId: association.id,
    actionKey: request.actionKey,
    actionType: request.actionType,
    fromState: 'proposed',
    toState,
    expectedAssociationVersion: request.expectedAssociationVersion,
    resultingAssociationVersion,
    reversesDecisionId: null,
    createdAt: request.now,
  }

  const next: PurchaseAssociation = {
    ...association,
    state: toState,
    associationVersion: resultingAssociationVersion,
    decisionVersion: association.decisionVersion + 1,
  }

  return { ok: true, association: next, decision }
}

/**
 * The most recent confirm/reject decision that has not itself been reversed.
 * Only this decision is reversible — Undo is single-step, latest-first.
 */
function latestReversibleDecision(
  decisions: readonly PurchaseDecision[],
): PurchaseDecision | null {
  const reversed = new Set(
    decisions
      .filter((d) => d.actionType === 'undo' && d.reversesDecisionId)
      .map((d) => d.reversesDecisionId as string),
  )
  for (let i = decisions.length - 1; i >= 0; i -= 1) {
    const d = decisions[i]
    if (d.actionType === 'undo') continue
    if (reversed.has(d.id)) continue
    return d
  }
  return null
}

function applyUndo(
  association: PurchaseAssociation,
  decisions: readonly PurchaseDecision[],
  request: PurchaseReviewRequest,
): PurchaseReviewResult {
  const target = decisions.find((d) => d.id === request.targetDecisionId)
  if (!target) {
    return fail(association, 'unknown_decision')
  }
  // Already reversed by a prior undo → superseded (409), not a fresh reversal.
  const alreadyReversed = decisions.some(
    (d) => d.actionType === 'undo' && d.reversesDecisionId === target.id,
  )
  if (alreadyReversed) {
    return fail(association, 'superseded')
  }
  // Only the latest live confirm/reject can be undone.
  const reversible = latestReversibleDecision(decisions)
  if (!reversible || reversible.id !== target.id) {
    return fail(association, 'not_reversible')
  }
  if (request.expectedAssociationVersion !== association.associationVersion) {
    return fail(association, 'version_conflict')
  }

  // Undo returns the association to the state the target decision moved it from.
  const toState = target.fromState
  const resultingAssociationVersion = association.associationVersion + 1

  const decision: PurchaseDecision = {
    id: request.newDecisionId,
    associationId: association.id,
    actionKey: request.actionKey,
    actionType: 'undo',
    fromState: association.state,
    toState,
    expectedAssociationVersion: request.expectedAssociationVersion,
    resultingAssociationVersion,
    reversesDecisionId: target.id,
    createdAt: request.now,
  }

  const next: PurchaseAssociation = {
    ...association,
    state: toState,
    associationVersion: resultingAssociationVersion,
    decisionVersion: association.decisionVersion + 1,
  }

  return { ok: true, association: next, decision }
}

// ─────────────────────────── Automation precedence ───────────────────────────
// Manual Confirm/Reject must outrank automated matching + enrichment writes for
// the same stable association (FP6 data contract §"Manual-decision precedence").

/**
 * Whether an automated matcher may replace/refresh the order candidate on this
 * association. A human `confirmed` or `rejected` decision locks the pairing;
 * only a still-`proposed` association may be automatically overwritten.
 */
export function automationMayOverwriteCandidate(
  association: Pick<PurchaseAssociation, 'state'>,
): boolean {
  return association.state === 'proposed'
}

/**
 * Whether a re-surfaced identical candidate (same source + external_order_id)
 * may be presented to the user again as a fresh `proposed`. A previously
 * `rejected` pairing must NOT silently return — it stays suppressed.
 */
export function automationMayResurface(
  association: Pick<PurchaseAssociation, 'state'>,
): boolean {
  return association.state !== 'rejected'
}

/** One decided association on a transaction, as seen by the automated matcher. */
export interface PurchaseReviewPrecedenceEntry {
  state: PurchaseReviewState
  source: PurchaseEnrichmentSource
  externalOrderId: string
}

/** transaction_id → its confirmed/rejected associations (proposed rows are irrelevant here). */
export type PurchaseReviewPrecedenceIndex = Map<
  string,
  readonly PurchaseReviewPrecedenceEntry[]
>

export interface AutomationWriteCandidate {
  transactionId: string
  source: PurchaseEnrichmentSource
  externalOrderId: string
}

export type AutomationGateReason = 'confirmed_locked' | 'rejected_no_resurface' | null

/**
 * Precedence gate for the automated matcher (`link-purchase-orders.mjs`): given a
 * candidate identity-bearing enrichment write and the transaction's decided
 * associations, decide whether automation must stand down.
 *
 * - A `confirmed` association on the transaction LOCKS automated identity writes
 *   (automation must not change/overwrite a human-confirmed pairing).
 * - A `rejected` association for the SAME candidate must not be silently
 *   resurfaced. A rejected *different* candidate does not block a new one.
 *
 * Mirrors `automationMayOverwriteCandidate` / `automationMayResurface` but scoped
 * to a concrete transaction↔candidate write. Pure + unit-tested.
 */
export function purchaseReviewAutomationGate(
  candidate: AutomationWriteCandidate,
  index: PurchaseReviewPrecedenceIndex,
): { blocked: boolean; reason: AutomationGateReason } {
  const entries = index.get(candidate.transactionId) ?? []
  if (entries.some((e) => e.state === 'confirmed')) {
    return { blocked: true, reason: 'confirmed_locked' }
  }
  if (
    entries.some(
      (e) =>
        e.state === 'rejected' &&
        e.source === candidate.source &&
        e.externalOrderId === candidate.externalOrderId,
    )
  ) {
    return { blocked: true, reason: 'rejected_no_resurface' }
  }
  return { blocked: false, reason: null }
}
