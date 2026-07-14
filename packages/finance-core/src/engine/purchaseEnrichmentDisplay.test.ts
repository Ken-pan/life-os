import { describe, expect, it } from 'vitest'
import fixtures from '@life-os/finance-enrichment-contract/fixtures/display-state.json'
import {
  classifyCleanReasons,
  resolveDisplayState,
  buildDuplicateMaps,
  isCleanPurchaseStatus,
} from '@life-os/finance-enrichment-contract'
import type { Txn } from './transactions'
import {
  buildPurchaseDisplayContext,
  classifyPurchaseDisplayState,
  computePurchaseCoverage,
} from './purchaseEnrichmentDisplay'

function txn(
  partial: Partial<Txn> & { purchaseEnrichment?: Txn['purchaseEnrichment'] },
): Txn {
  return {
    id: partial.id ?? 'txn-1',
    date: partial.date ?? '2026-01-30',
    month: '2026-01',
    merchant: partial.merchant ?? 'Target',
    category: 'Shopping',
    account: partial.account ?? 'Target Circle Card',
    flow: 'expense',
    amount: partial.amount ?? 5.22,
    budgetImpact: partial.budgetImpact ?? -5.22,
    inSpending: true,
    inCashFlow: true,
    ...partial,
  }
}

describe('shared contract fixtures', () => {
  for (const c of fixtures.cases) {
    it(`fixture ${c.id} -> ${c.expectedState}`, () => {
      const dupMaps = buildDuplicateMaps([c.order])
      const reasons = classifyCleanReasons(c.order, dupMaps)
      const state = resolveDisplayState(c.order, reasons)
      expect(state).toBe(c.expectedState)
    })
  }
})

describe('classifyPurchaseDisplayState', () => {
  it('maps spot-check Target row through Txn adapter', () => {
    const t = txn({
      id: 'e02b527f-0da1-4543-9098-60f3466a06db',
      amount: 5.22,
      account: 'Target Circle Card',
      purchaseEnrichment: {
        source: 'target',
        orderId: '6030-1284-0161-7280',
        orderDate: '2026-01-30',
        orderTotal: 5.22,
        status: 'purchased',
        detailUrl: 'https://www.target.com/orders/stores/6030-1284-0161-7280',
        matchConfidence: 'high',
        lineItems: [
          {
            title: 'Core Power Elite Strawberry 42G Protein Shake',
            quantity: 1,
            imageStoragePath: 'uid/target/oid/a.jpg',
          },
        ],
      },
    })
    const ctx = buildPurchaseDisplayContext([t])
    expect(classifyPurchaseDisplayState(t, ctx).state).toBe('clean_enriched')
  })

  it('classifies duplicate orderId as matched_review', () => {
    const shared = {
      source: 'amazon' as const,
      orderId: 'dup-order',
      orderTotal: 10,
      status: 'Delivered',
      matchConfidence: 'high' as const,
      lineItems: [{ title: 'A', quantity: 1 }],
    }
    const t1 = txn({ id: 'a', purchaseEnrichment: shared })
    const t2 = txn({ id: 'b', purchaseEnrichment: shared })
    const ctx = buildPurchaseDisplayContext([t1, t2])
    expect(classifyPurchaseDisplayState(t1, ctx).state).toBe('matched_review')
  })

  it('classifies missing enrichment as merchant_only', () => {
    const t = txn({ merchant: 'Rent Payment' })
    const ctx = buildPurchaseDisplayContext([t])
    expect(classifyPurchaseDisplayState(t, ctx).state).toBe('merchant_only')
  })
})

describe('computePurchaseCoverage', () => {
  it('aggregates display states', () => {
    const clean = txn({
      id: 'c1',
      amount: 5,
      purchaseEnrichment: {
        source: 'target',
        orderId: '91234567890',
        orderTotal: 5,
        status: 'purchased',
        matchConfidence: 'high',
        detailUrl: 'https://www.target.com/orders/91234567890',
        lineItems: [{ title: 'X', quantity: 1 }],
      },
    })
    const review = txn({
      id: 'r1',
      purchaseEnrichment: {
        source: 'amazon',
        orderId: 'a1',
        orderTotal: 10,
        status: 'Delivered',
        matchConfidence: 'low',
        lineItems: [{ title: 'Y', quantity: 1 }],
      },
    })
    const plain = txn({ id: 'm1', merchant: 'Payroll' })
    const stats = computePurchaseCoverage([clean, review, plain])
    expect(stats.cleanEnriched).toBe(1)
    expect(stats.cleanItemCount).toBe(1)
    expect(stats.matchedReview).toBe(1)
    expect(stats.merchantOnly).toBe(1)
  })
})

describe('isCleanPurchaseStatus — matching-quality fixes', () => {
  it('treats missing / unknown status as clean (Amazon exports omit status)', () => {
    // txnToNormalizedOrder coerces null → 'unknown'; that must not force review.
    expect(isCleanPurchaseStatus(null)).toBe(true)
    expect(isCleanPurchaseStatus('')).toBe(true)
    expect(isCleanPurchaseStatus('unknown')).toBe(true)
  })

  it('accepts free-text fulfilment phrasings', () => {
    expect(isCleanPurchaseStatus('Delivered June 30')).toBe(true)
    expect(isCleanPurchaseStatus('Delivered today')).toBe(true)
    expect(isCleanPurchaseStatus('Picked Up')).toBe(true) // space vs picked_up
    expect(isCleanPurchaseStatus('Picked up')).toBe(true)
    expect(isCleanPurchaseStatus('Purchased in Store')).toBe(true)
    expect(isCleanPurchaseStatus('Ready for pickup')).toBe(true)
    expect(isCleanPurchaseStatus('Arriving today')).toBe(true)
  })

  it('still flags returns / refunds / cancellations as non-clean', () => {
    expect(isCleanPurchaseStatus('Returned')).toBe(false)
    expect(isCleanPurchaseStatus('Return complete')).toBe(false)
    expect(isCleanPurchaseStatus('Refund issued')).toBe(false)
    expect(isCleanPurchaseStatus('Refunded')).toBe(false)
    expect(isCleanPurchaseStatus('Cancelled')).toBe(false)
  })
})
