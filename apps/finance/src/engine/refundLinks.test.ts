import { describe, it, expect } from 'vitest'
import { buildRefundLinkIndex } from './refundLinks.js'
import type { Txn } from './transactions.js'

// FINC.PURCHASE.6b — refund-link index boundaries.

function txn(over: Partial<Txn> & Pick<Txn, 'id' | 'amount'>): Txn {
  return {
    date: '2026-05-01',
    month: '2026-05',
    merchant: 'Amazon',
    category: 'Shopping',
    account: 'Visa',
    flow: 'expense',
    budgetImpact: -over.amount,
    inSpending: true,
    inCashFlow: true,
    ...over,
  }
}

// Purchase row: positive amount, returnInfo.status returned, relatedTxnId → refund.
function purchase(id: string, orderId: string, relatedTxnId?: string, refundAmount = 40): Txn {
  return txn({
    id,
    amount: 40,
    merchant: 'Amazon',
    purchaseEnrichment: {
      source: 'amazon',
      orderId,
      returnInfo: relatedTxnId
        ? { status: 'returned', relatedTxnId, refundAmount }
        : { status: 'returned', refundAmount },
    },
  })
}

// Refund credit row: negative amount, isRefundCredit, relatedTxnId → purchase.
function refund(
  id: string,
  orderId: string,
  relatedTxnId?: string,
  amount = 40,
  date = '2026-05-12',
): Txn {
  return txn({
    id,
    amount: -amount,
    date,
    flow: 'refund_or_reversal',
    budgetImpact: amount,
    inSpending: false,
    merchant: 'Amazon',
    purchaseEnrichment: {
      source: 'amazon',
      orderId,
      returnInfo: {
        status: 'refunded',
        isRefundCredit: true,
        relatedOrderId: orderId,
        relatedTxnId,
        refundAmount: amount,
      },
    },
  })
}

describe('buildRefundLinkIndex', () => {
  it('empty ledger / no refunds → empty index', () => {
    expect(buildRefundLinkIndex([]).size).toBe(0)
    const plain = txn({ id: 'p', amount: 20 })
    expect(buildRefundLinkIndex([plain]).size).toBe(0)
  })

  it('txn-anchored pair: links once despite both rows pointing at each other', () => {
    const p = purchase('p1', 'O1', 'r1')
    const r = refund('r1', 'O1', 'p1')
    const index = buildRefundLinkIndex([p, r])
    const links = index.get('p1')
    expect(links).toHaveLength(1) // deduped across directions A + B
    expect(links![0]).toMatchObject({
      txnId: 'r1',
      matchedBy: 'txn',
      present: true,
      amount: 40,
      date: '2026-05-12',
      merchant: 'Amazon',
    })
    // The refund row itself is not a purchase key.
    expect(index.has('r1')).toBe(false)
  })

  it('order-anchored fallback when no relatedTxnId is present', () => {
    const p = purchase('p1', 'O1') // no relatedTxnId
    const r = refund('r1', 'O1') // no relatedTxnId, only orderId
    const links = buildRefundLinkIndex([p, r]).get('p1')
    expect(links).toHaveLength(1)
    expect(links![0]).toMatchObject({ txnId: 'r1', matchedBy: 'order', present: true })
  })

  it('gap: purchase claims a refund whose ledger row is not loaded', () => {
    const p = purchase('p1', 'O1', 'r-missing', 33)
    const links = buildRefundLinkIndex([p]).get('p1')
    expect(links).toHaveLength(1)
    expect(links![0]).toMatchObject({
      txnId: 'r-missing',
      present: false,
      amount: 33,
      date: null,
      merchant: null,
    })
  })

  it('one purchase → multiple partial refunds', () => {
    const p = purchase('p1', 'O1') // relatedTxnId single-valued; rely on order match
    const r1 = refund('r1', 'O1', 'p1', 15, '2026-05-10')
    const r2 = refund('r2', 'O1', 'p1', 25, '2026-05-18')
    const links = buildRefundLinkIndex([p, r1, r2]).get('p1')
    expect(links).toHaveLength(2)
    expect(links!.map((l) => l.txnId)).toEqual(['r1', 'r2']) // sorted by date
    expect(links!.map((l) => l.amount)).toEqual([15, 25])
  })

  it('detects refund credit rows by flow and by merchant+negative amount', () => {
    // flow-based
    const p1 = purchase('p1', 'O1', 'r1')
    const r1 = refund('r1', 'O1', 'p1')
    // merchant + negative amount, no explicit refund flow, order-anchored
    const p2 = purchase('p2', 'O2')
    const r2: Txn = txn({
      id: 'r2',
      amount: -12,
      flow: 'income',
      budgetImpact: 12,
      inSpending: false,
      merchant: 'Best Buy',
      purchaseEnrichment: {
        source: 'bestbuy',
        orderId: 'O2',
        returnInfo: { status: 'refunded', isRefundCredit: true, relatedOrderId: 'O2', refundAmount: 12 },
      },
    })
    // p2 is Best Buy too so purchaseByOrder keys match source
    p2.merchant = 'Best Buy'
    p2.purchaseEnrichment = {
      source: 'bestbuy',
      orderId: 'O2',
      returnInfo: { status: 'returned', refundAmount: 12 },
    }
    const index = buildRefundLinkIndex([p1, r1, p2, r2])
    expect(index.get('p1')).toHaveLength(1)
    expect(index.get('p2')).toHaveLength(1)
    expect(index.get('p2')![0]).toMatchObject({ txnId: 'r2', matchedBy: 'order', amount: 12 })
  })

  it('does not link an unrelated refund (different order, no anchor)', () => {
    const p = purchase('p1', 'O1')
    const r = refund('r1', 'O-OTHER') // different order, no relatedTxnId
    expect(buildRefundLinkIndex([p, r]).size).toBe(0)
  })

  it('ignores a refund whose amount is zero on both sides', () => {
    const p = purchase('p1', 'O1', 'r1', 0) // purchase claims $0 refund
    const r = refund('r1', 'O1', 'p1', 0) // refund txn amount $0
    expect(buildRefundLinkIndex([p, r]).size).toBe(0)
  })
})
