import { describe, it, expect } from 'vitest'
import {
  applyPurchaseReviewDecision,
  automationMayOverwriteCandidate,
  automationMayResurface,
  PURCHASE_REVIEW_ERROR_STATUS,
  type PurchaseAssociation,
  type PurchaseDecision,
  type PurchaseReviewRequest,
} from './purchaseReviewDecision.js'

function assoc(overrides: Partial<PurchaseAssociation> = {}): PurchaseAssociation {
  return {
    id: 'assoc-1',
    transactionId: 'txn-1',
    source: 'amazon',
    externalOrderId: '111-2223334-4445556',
    state: 'proposed',
    associationVersion: 0,
    decisionVersion: 0,
    ...overrides,
  }
}

function req(overrides: Partial<PurchaseReviewRequest> = {}): PurchaseReviewRequest {
  return {
    actionType: 'confirm',
    actionKey: 'key-1',
    expectedAssociationVersion: 0,
    newDecisionId: 'dec-1',
    now: 1_000,
    ...overrides,
  }
}

describe('applyPurchaseReviewDecision — confirm / reject', () => {
  it('confirm on proposed → confirmed, version + decisionVersion increment', () => {
    const res = applyPurchaseReviewDecision(assoc(), [], req({ actionType: 'confirm' }))
    expect(res.ok).toBe(true)
    expect(res.association.state).toBe('confirmed')
    expect(res.association.associationVersion).toBe(1)
    expect(res.association.decisionVersion).toBe(1)
    expect(res.decision).toMatchObject({
      actionType: 'confirm',
      fromState: 'proposed',
      toState: 'confirmed',
      resultingAssociationVersion: 1,
      reversesDecisionId: null,
    })
  })

  it('reject on proposed → rejected', () => {
    const res = applyPurchaseReviewDecision(assoc(), [], req({ actionType: 'reject' }))
    expect(res.ok).toBe(true)
    expect(res.association.state).toBe('rejected')
    expect(res.association.associationVersion).toBe(1)
  })

  it('does not mutate its inputs', () => {
    const a = assoc()
    const decisions: PurchaseDecision[] = []
    applyPurchaseReviewDecision(a, decisions, req())
    expect(a.state).toBe('proposed')
    expect(a.associationVersion).toBe(0)
    expect(decisions).toHaveLength(0)
  })

  it('confirm on non-proposed → not_proposed (400)', () => {
    const res = applyPurchaseReviewDecision(
      assoc({ state: 'confirmed', associationVersion: 1 }),
      [],
      req({ expectedAssociationVersion: 1 }),
    )
    expect(res.ok).toBe(false)
    expect(res.error).toBe('not_proposed')
    expect(PURCHASE_REVIEW_ERROR_STATUS[res.error!]).toBe(400)
    // association unchanged on error
    expect(res.association.state).toBe('confirmed')
  })

  it('stale expected version → version_conflict (409)', () => {
    const res = applyPurchaseReviewDecision(
      assoc({ associationVersion: 3 }),
      [],
      req({ expectedAssociationVersion: 2 }),
    )
    expect(res.ok).toBe(false)
    expect(res.error).toBe('version_conflict')
    expect(PURCHASE_REVIEW_ERROR_STATUS[res.error!]).toBe(409)
  })
})

describe('applyPurchaseReviewDecision — idempotency', () => {
  it('duplicate action_key replays the original decision, no new event', () => {
    const first = applyPurchaseReviewDecision(assoc(), [], req({ actionKey: 'dup' }))
    const history = [first.decision!]
    // Same key submitted again against the now-confirmed association.
    const replay = applyPurchaseReviewDecision(
      first.association,
      history,
      req({ actionKey: 'dup', newDecisionId: 'dec-should-not-be-used' }),
    )
    expect(replay.ok).toBe(true)
    expect(replay.idempotentReplay).toBe(true)
    expect(replay.decision!.id).toBe('dec-1')
    // no version bump on replay
    expect(replay.association.associationVersion).toBe(first.association.associationVersion)
  })
})

describe('applyPurchaseReviewDecision — undo', () => {
  function confirmed() {
    const res = applyPurchaseReviewDecision(assoc(), [], req({ actionKey: 'k-confirm' }))
    return { association: res.association, decisions: [res.decision!] }
  }

  it('undo confirm → proposed, version increments, appends reversing decision', () => {
    const { association, decisions } = confirmed()
    const res = applyPurchaseReviewDecision(
      association,
      decisions,
      req({
        actionType: 'undo',
        actionKey: 'k-undo',
        targetDecisionId: 'dec-1',
        expectedAssociationVersion: 1,
        newDecisionId: 'dec-2',
        now: 2_000,
      }),
    )
    expect(res.ok).toBe(true)
    expect(res.association.state).toBe('proposed')
    expect(res.association.associationVersion).toBe(2)
    expect(res.decision).toMatchObject({
      actionType: 'undo',
      toState: 'proposed',
      reversesDecisionId: 'dec-1',
      resultingAssociationVersion: 2,
    })
  })

  it('undo reject → proposed', () => {
    const r = applyPurchaseReviewDecision(assoc(), [], req({ actionType: 'reject', actionKey: 'k-rej' }))
    const res = applyPurchaseReviewDecision(
      r.association,
      [r.decision!],
      req({
        actionType: 'undo',
        actionKey: 'k-undo',
        targetDecisionId: 'dec-1',
        expectedAssociationVersion: 1,
        newDecisionId: 'dec-2',
      }),
    )
    expect(res.ok).toBe(true)
    expect(res.association.state).toBe('proposed')
  })

  it('undo of a missing decision → unknown_decision (404)', () => {
    const { association, decisions } = confirmed()
    const res = applyPurchaseReviewDecision(
      association,
      decisions,
      req({ actionType: 'undo', actionKey: 'k', targetDecisionId: 'nope', expectedAssociationVersion: 1, newDecisionId: 'd' }),
    )
    expect(res.error).toBe('unknown_decision')
    expect(PURCHASE_REVIEW_ERROR_STATUS[res.error!]).toBe(404)
  })

  it('undoing an already-undone decision → superseded (409)', () => {
    const { association, decisions } = confirmed()
    const undo1 = applyPurchaseReviewDecision(
      association,
      decisions,
      req({ actionType: 'undo', actionKey: 'u1', targetDecisionId: 'dec-1', expectedAssociationVersion: 1, newDecisionId: 'dec-2' }),
    )
    const history = [...decisions, undo1.decision!]
    // Try to undo dec-1 again.
    const undo2 = applyPurchaseReviewDecision(
      undo1.association,
      history,
      req({ actionType: 'undo', actionKey: 'u2', targetDecisionId: 'dec-1', expectedAssociationVersion: 2, newDecisionId: 'dec-3' }),
    )
    expect(undo2.error).toBe('superseded')
  })

  it('cannot undo an undo decision itself → not_reversible (400)', () => {
    // confirm(dec-1) → undo(dec-2). dec-2 is an undo event and is not itself reversible.
    const c1 = applyPurchaseReviewDecision(assoc(), [], req({ actionKey: 'c1' }))
    const u1 = applyPurchaseReviewDecision(
      c1.association,
      [c1.decision!],
      req({ actionType: 'undo', actionKey: 'u1', targetDecisionId: 'dec-1', expectedAssociationVersion: 1, newDecisionId: 'dec-2' }),
    )
    const history = [c1.decision!, u1.decision!]
    const res = applyPurchaseReviewDecision(
      u1.association,
      history,
      req({ actionType: 'undo', actionKey: 'u2', targetDecisionId: 'dec-2', expectedAssociationVersion: 2, newDecisionId: 'dec-3' }),
    )
    expect(res.error).toBe('not_reversible')
  })

  it('undo with stale version → version_conflict (409)', () => {
    const { association, decisions } = confirmed()
    const res = applyPurchaseReviewDecision(
      association,
      decisions,
      req({ actionType: 'undo', actionKey: 'k', targetDecisionId: 'dec-1', expectedAssociationVersion: 99, newDecisionId: 'd' }),
    )
    expect(res.error).toBe('version_conflict')
  })
})

describe('automation precedence', () => {
  it('may overwrite candidate only while proposed', () => {
    expect(automationMayOverwriteCandidate({ state: 'proposed' })).toBe(true)
    expect(automationMayOverwriteCandidate({ state: 'confirmed' })).toBe(false)
    expect(automationMayOverwriteCandidate({ state: 'rejected' })).toBe(false)
  })

  it('must not resurface a rejected pairing', () => {
    expect(automationMayResurface({ state: 'proposed' })).toBe(true)
    expect(automationMayResurface({ state: 'confirmed' })).toBe(true)
    expect(automationMayResurface({ state: 'rejected' })).toBe(false)
  })
})
