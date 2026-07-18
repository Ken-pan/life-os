import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadReviewState,
  resolveDecide,
  resolveUndo,
} from './purchaseReviewClient.js'

// FINC.PURCHASE.6.a — owner Confirm → Undo closure boundaries.
//
// The client helpers are exercised against an in-memory RPC that mirrors the
// Postgres functions in
// supabase/migrations/20260713120000_purchase_review_associations.sql
// branch-for-branch (idempotency, state machine, optimistic version, single-step
// latest-first Undo, superseded detection). The SQL itself mirrors the pure
// engine packages/finance-core/.../purchaseReviewDecision.ts 1:1, so this is a
// faithful stand-in for the real owner round-trip without a live Supabase session.

function makeFakeDb() {
  let seq = 0
  const nextId = (p) => `${p}-${(seq += 1)}`
  /** @type {Map<string, any>} */
  const assocs = new Map()
  /** @type {any[]} */
  const decisions = []

  const findAssocByTxn = (txnId) =>
    [...assocs.values()]
      .filter((a) => a.transaction_id === txnId)
      .sort((a, b) => b.updated_at - a.updated_at)[0]

  function seedProposed({ txnId = 'txn-1', source = 'amazon', orderId = 'order-1' } = {}) {
    const id = nextId('assoc')
    const row = {
      id,
      transaction_id: txnId,
      source,
      external_order_id: orderId,
      state: 'proposed',
      association_version: 0,
      decision_version: 0,
      updated_at: seq,
    }
    assocs.set(id, row)
    return { ...row }
  }

  function get(txnId) {
    const a = findAssocByTxn(txnId)
    if (!a) return { ok: false, status: 404, error: 'no_association' }
    const hist = decisions
      .filter((d) => d.association_id === a.id)
      .sort((x, y) => x.created_at - y.created_at)
    return { ok: true, status: 200, association: { ...a }, decisions: hist.map((d) => ({ ...d })) }
  }

  function decide({ p_association_id, p_action_type, p_expected_version, p_action_key }) {
    if (p_action_type !== 'confirm' && p_action_type !== 'reject')
      return { ok: false, status: 400, error: 'invalid_action' }
    const a = assocs.get(p_association_id)
    if (!a) return { ok: false, status: 404, error: 'no_association' }
    const existing = decisions.find(
      (d) => d.association_id === a.id && d.action_key === p_action_key,
    )
    if (existing)
      return {
        ok: true,
        status: 200,
        idempotentReplay: true,
        association: { ...a },
        decision: { ...existing },
      }
    if (a.state !== 'proposed')
      return { ok: false, status: 400, error: 'not_proposed', association: { ...a } }
    if (a.association_version !== p_expected_version)
      return { ok: false, status: 409, error: 'version_conflict', association: { ...a } }

    const toState = p_action_type === 'confirm' ? 'confirmed' : 'rejected'
    const newVer = a.association_version + 1
    const decision = {
      id: nextId('dec'),
      association_id: a.id,
      action_key: p_action_key,
      action_type: p_action_type,
      from_state: 'proposed',
      to_state: toState,
      expected_association_version: p_expected_version,
      resulting_association_version: newVer,
      reverses_decision_id: null,
      created_at: (seq += 1),
    }
    decisions.push(decision)
    a.state = toState
    a.association_version = newVer
    a.decision_version += 1
    a.updated_at = seq
    return { ok: true, status: 200, association: { ...a }, decision: { ...decision } }
  }

  function undo({ p_association_id, p_target_decision_id, p_expected_version, p_action_key }) {
    const a = assocs.get(p_association_id)
    if (!a) return { ok: false, status: 404, error: 'no_association' }
    const existing = decisions.find(
      (d) => d.association_id === a.id && d.action_key === p_action_key,
    )
    if (existing)
      return {
        ok: true,
        status: 200,
        idempotentReplay: true,
        association: { ...a },
        decision: { ...existing },
      }
    const target = decisions.find(
      (d) => d.id === p_target_decision_id && d.association_id === a.id,
    )
    if (!target)
      return { ok: false, status: 404, error: 'unknown_decision', association: { ...a } }
    const alreadyReversed = decisions.some(
      (d) => d.association_id === a.id && d.action_type === 'undo' && d.reverses_decision_id === target.id,
    )
    if (alreadyReversed)
      return { ok: false, status: 409, error: 'superseded', association: { ...a } }
    const latest = decisions
      .filter(
        (d) =>
          d.association_id === a.id &&
          (d.action_type === 'confirm' || d.action_type === 'reject') &&
          !decisions.some(
            (u) => u.association_id === a.id && u.action_type === 'undo' && u.reverses_decision_id === d.id,
          ),
      )
      .sort((x, y) => y.created_at - x.created_at)[0]
    if (!latest || latest.id !== target.id)
      return { ok: false, status: 400, error: 'not_reversible', association: { ...a } }
    if (a.association_version !== p_expected_version)
      return { ok: false, status: 409, error: 'version_conflict', association: { ...a } }

    const newVer = a.association_version + 1
    const decision = {
      id: nextId('dec'),
      association_id: a.id,
      action_key: p_action_key,
      action_type: 'undo',
      from_state: a.state,
      to_state: target.from_state,
      expected_association_version: p_expected_version,
      resulting_association_version: newVer,
      reverses_decision_id: target.id,
      created_at: (seq += 1),
    }
    decisions.push(decision)
    a.state = target.from_state
    a.association_version = newVer
    a.decision_version += 1
    a.updated_at = seq
    return { ok: true, status: 200, association: { ...a }, decision: { ...decision } }
  }

  // Supabase-shaped rpc(name, params) → { data, error }. `throwOn` simulates a
  // transport failure (the "unknown/timeout" boundary) for a given rpc name.
  let throwOn = null
  const rpc = async (name, params) => {
    if (throwOn === name) return { data: null, error: new Error('network') }
    if (name === 'purchase_review_get') return { data: get(params.p_transaction_id), error: null }
    if (name === 'purchase_review_decide') return { data: decide(params), error: null }
    if (name === 'purchase_review_undo') return { data: undo(params), error: null }
    throw new Error(`unexpected rpc ${name}`)
  }

  return {
    rpc,
    seedProposed,
    raw: { get, decide, undo, assocs, decisions },
    failNext: (name) => {
      throwOn = name
    },
    clearFail: () => {
      throwOn = null
    },
  }
}

describe('purchaseReviewClient — owner Confirm → Undo closure', () => {
  /** @type {ReturnType<typeof makeFakeDb>} */
  let db
  beforeEach(() => {
    db = makeFakeDb()
  })

  it('empty result: no association → self-hides', async () => {
    const state = await loadReviewState(db.rpc, 'txn-missing')
    expect(state).toEqual({ association: null, lastDecisionId: null })
  })

  it('empty result: transport error also self-hides (never throws)', async () => {
    db.failNext('purchase_review_get')
    const state = await loadReviewState(db.rpc, 'txn-1')
    expect(state).toEqual({ association: null, lastDecisionId: null })
  })

  it('full chain: proposed → confirm → undo rolls state back to proposed', async () => {
    const prev = db.seedProposed()

    const confirmed = await resolveDecide(db.rpc, {
      prev,
      actionType: 'confirm',
      actionKey: 'k-confirm',
      transactionId: 'txn-1',
    })
    expect(confirmed.association.state).toBe('confirmed')
    expect(confirmed.association.association_version).toBe(1)
    expect(confirmed.status).toBe('idle')
    expect(confirmed.openUndo).toBe(true)
    expect(confirmed.lastDecisionId).toBeTruthy()

    const undone = await resolveUndo(db.rpc, {
      prev: confirmed.association,
      lastDecisionId: confirmed.lastDecisionId,
      actionKey: 'k-undo',
      transactionId: 'txn-1',
    })
    // Rollback: back to proposed, version advanced, affordance closed.
    expect(undone.association.state).toBe('proposed')
    expect(undone.association.association_version).toBe(2)
    expect(undone.lastDecisionId).toBeNull()
    expect(undone.status).toBe('idle')
    expect(undone.closeUndo).toBe(true)

    // History preserved append-only: confirm + undo(reverses confirm).
    const hist = db.raw.decisions
    expect(hist).toHaveLength(2)
    expect(hist[1].action_type).toBe('undo')
    expect(hist[1].reverses_decision_id).toBe(hist[0].id)

    // A fresh load now presents the association as proposed again (re-decidable).
    const reloaded = await loadReviewState(db.rpc, 'txn-1')
    expect(reloaded.association.state).toBe('proposed')
  })

  it('duplicate annotation: replaying the same action_key is idempotent (no 2nd decision)', async () => {
    const prev = db.seedProposed()
    const first = await resolveDecide(db.rpc, {
      prev,
      actionType: 'confirm',
      actionKey: 'dup-key',
      transactionId: 'txn-1',
    })
    expect(first.association.association_version).toBe(1)
    expect(db.raw.decisions).toHaveLength(1)

    // Same key again (retried submission) — RPC returns the original, no new event.
    const replay = await resolveDecide(db.rpc, {
      prev, // still the stale proposed echo
      actionType: 'confirm',
      actionKey: 'dup-key',
      transactionId: 'txn-1',
    })
    expect(replay.association.association_version).toBe(1)
    expect(replay.association.state).toBe('confirmed')
    expect(db.raw.decisions).toHaveLength(1) // still exactly one decision
  })

  it('version conflict: 409 surfaces stale AND keeps it visible (regression guard)', async () => {
    const prev = db.seedProposed() // v0
    // Another tab runs a full confirm→undo cycle: the row is proposed again but at
    // v2, so `prev`'s expected v0 is a pure version_conflict (state still proposed,
    // which is what distinguishes 409 from the not_proposed 400 case).
    const c = db.raw.decide({
      p_association_id: prev.id,
      p_action_type: 'confirm',
      p_expected_version: 0,
      p_action_key: 'other-confirm',
    })
    db.raw.undo({
      p_association_id: prev.id,
      p_target_decision_id: c.decision.id,
      p_expected_version: 1,
      p_action_key: 'other-undo',
    })
    expect(db.raw.assocs.get(prev.id).state).toBe('proposed')
    expect(db.raw.assocs.get(prev.id).association_version).toBe(2)

    const patch = await resolveDecide(db.rpc, {
      prev, // stale v0
      actionType: 'reject',
      actionKey: 'mine',
      transactionId: 'txn-1',
    })
    // The fix: status must remain 'stale', not be clobbered to 'idle' by reconcile.
    expect(patch.status).toBe('stale')
    // And the association is reconciled to authoritative server truth (proposed v2).
    expect(patch.association.state).toBe('proposed')
    expect(patch.association.association_version).toBe(2)
  })

  it('not_proposed: deciding an already-decided row reconciles to idle, no undo window', async () => {
    const prev = db.seedProposed()
    const confirmed = await resolveDecide(db.rpc, {
      prev,
      actionType: 'confirm',
      actionKey: 'k1',
      transactionId: 'txn-1',
    })
    // Try to decide again on the now-confirmed row.
    const patch = await resolveDecide(db.rpc, {
      prev: confirmed.association,
      actionType: 'reject',
      actionKey: 'k2',
      transactionId: 'txn-1',
    })
    expect(patch.status).toBe('idle')
    expect(patch.openUndo).toBe(false)
    expect(patch.association.state).toBe('confirmed')
  })

  it('unknown/timeout: a thrown RPC surfaces unknown AND reconciles (regression guard)', async () => {
    const prev = db.seedProposed()
    db.failNext('purchase_review_decide')
    const patch = await resolveDecide(db.rpc, {
      prev,
      actionType: 'confirm',
      actionKey: 'k1',
      transactionId: 'txn-1',
    })
    // The fix: 'unknown' must survive the reconcile reload (was clobbered to idle).
    expect(patch.status).toBe('unknown')
    // Reconciled from server: the decide never landed, still proposed.
    expect(patch.association.state).toBe('proposed')
    expect(patch.openUndo).toBe(false)
  })

  it('undo superseded: undoing an already-reversed decision surfaces stale + closes affordance', async () => {
    const prev = db.seedProposed()
    const confirmed = await resolveDecide(db.rpc, {
      prev,
      actionType: 'confirm',
      actionKey: 'k1',
      transactionId: 'txn-1',
    })
    const undone = await resolveUndo(db.rpc, {
      prev: confirmed.association,
      lastDecisionId: confirmed.lastDecisionId,
      actionKey: 'u1',
      transactionId: 'txn-1',
    })
    expect(undone.association.state).toBe('proposed')

    // Attempt to undo the same (now-reversed) confirm again → superseded (409).
    const again = await resolveUndo(db.rpc, {
      prev: confirmed.association, // stale, targeting the reversed confirm
      lastDecisionId: confirmed.lastDecisionId,
      actionKey: 'u2',
      transactionId: 'txn-1',
    })
    expect(again.status).toBe('stale')
    expect(again.closeUndo).toBe(true)
  })

  it('undo unknown/timeout: thrown RPC surfaces unknown + closes affordance', async () => {
    const prev = db.seedProposed()
    const confirmed = await resolveDecide(db.rpc, {
      prev,
      actionType: 'confirm',
      actionKey: 'k1',
      transactionId: 'txn-1',
    })
    db.failNext('purchase_review_undo')
    const patch = await resolveUndo(db.rpc, {
      prev: confirmed.association,
      lastDecisionId: confirmed.lastDecisionId,
      actionKey: 'u1',
      transactionId: 'txn-1',
    })
    expect(patch.status).toBe('unknown')
    expect(patch.closeUndo).toBe(true)
    // Reconciled: the undo never landed, still confirmed.
    expect(patch.association.state).toBe('confirmed')
  })

  it('reject path: proposed → reject → undo restores proposed', async () => {
    const prev = db.seedProposed()
    const rejected = await resolveDecide(db.rpc, {
      prev,
      actionType: 'reject',
      actionKey: 'r1',
      transactionId: 'txn-1',
    })
    expect(rejected.association.state).toBe('rejected')
    const undone = await resolveUndo(db.rpc, {
      prev: rejected.association,
      lastDecisionId: rejected.lastDecisionId,
      actionKey: 'ru1',
      transactionId: 'txn-1',
    })
    expect(undone.association.state).toBe('proposed')
    expect(undone.closeUndo).toBe(true)
  })
})
