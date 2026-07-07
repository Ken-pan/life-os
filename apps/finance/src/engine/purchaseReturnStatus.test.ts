import { describe, expect, it } from 'vitest'
import {
  mergePurchaseEnrichment,
  classifyReturnInfoMerge,
  repairStaleReturnInfoOnly,
  buildTargetedStaleReturnInfoRepairPlan,
  wouldWriteEnrichmentUpdate,
  enrichmentFieldChanges,
  type PurchaseEnrichment,
} from './purchaseEnrichment.ts'
import {
  isRefundCreditTxn,
  parseMoney,
  parseMerchantDate,
  parseReturnInfoFromMerchantStatus,
} from './purchaseReturnStatus.ts'
import {
  enrichmentFromOrder,
  effectiveOrderDate,
  matchScore,
  matchOrdersToPurchaseTxns,
  matchRefundCreditsToOrders,
  type MerchantOrderRecord,
} from './purchaseOrderMatch.ts'

describe('purchaseReturnStatus', () => {
  it('ignores return window closed eligibility text', () => {
    expect(
      parseReturnInfoFromMerchantStatus(
        'Return window closed on March 1, 2026',
      ),
    ).toBeUndefined()
  })

  it('parses Best Buy Returned status', () => {
    const info = parseReturnInfoFromMerchantStatus('Returned', {
      statusDate: 'February 15, 2026',
      orderTotal: '$287.42',
    })
    expect(info?.status).toBe('returned')
    expect(info?.eventDate).toBe('2026-02-15')
    expect(info?.refundAmount).toBe(287.42)
  })

  it('parses Amazon refund from detail subtotals', () => {
    const info = parseReturnInfoFromMerchantStatus('Delivered', {
      detailText: 'Refund Total: $33.42',
    })
    expect(info?.status).toBe('refunded')
    expect(info?.refundAmount).toBe(33.42)
  })

  it('suppresses returnInfo for Delivered without explicit refund evidence', () => {
    expect(
      parseReturnInfoFromMerchantStatus('Delivered today', {
        detailText: 'Return or replace items Track package',
      }),
    ).toBeUndefined()
  })

  it('suppresses returnInfo when only orderTotal would imply refund', () => {
    expect(
      parseReturnInfoFromMerchantStatus('Arriving tomorrow', {
        detailText: 'Arriving tomorrow',
        orderTotal: '$66.40',
      }),
    ).toBeUndefined()
  })

  it('detects refund credit txns', () => {
    expect(isRefundCreditTxn({ amount: -287.42, merchant: 'Best Buy' })).toBe(
      true,
    )
    expect(isRefundCreditTxn({ amount: 287.42, merchant: 'Best Buy' })).toBe(
      false,
    )
    expect(
      isRefundCreditTxn({
        amount: -10,
        merchant: 'Best Buy',
        flow: 'refund_or_reversal',
      }),
    ).toBe(true)
  })

  it('parses merchant dates', () => {
    expect(parseMerchantDate('July 4, 2026')).toBe('2026-07-04')
    expect(parseMoney('$66.40')).toBe(66.4)
  })
})

describe('purchaseOrderMatch scoring', () => {
  it('prefers charge shortly after order date', () => {
    const soon = matchScore('2026-02-16', '2026-02-14', 0, 12)
    const late = matchScore('2026-03-01', '2026-02-14', 0, 12)
    const before = matchScore('2026-02-10', '2026-02-14', 0, 12)
    expect(soon).toBeLessThan(late)
    expect(soon).toBeLessThan(before)
  })

  it('uses Best Buy status date for in-store purchases', () => {
    expect(
      effectiveOrderDate('bestbuy', {
        orderDate: 'February 10, 2026',
        statusDate: 'February 15, 2026',
        status: 'Purchased in Store',
        channel: 'In store',
      }),
    ).toBe('2026-02-15')
  })
})

describe('purchaseOrderMatch refunds', () => {
  it('links refund credit to returned order and marks purchase txn', () => {
    const orders: MerchantOrderRecord[] = [
      {
        orderId: 'BBY01-807146090954',
        orderDate: 'February 14, 2026',
        orderTotal: '$287.42',
        status: 'Returned',
        statusDate: 'February 15, 2026',
        returnInfo: {
          status: 'returned',
          label: 'Returned',
          eventDate: '2026-02-15',
          refundAmount: 287.42,
        },
      },
    ]
    const txns = [
      {
        id: 'purchase-1',
        date: '2026-02-14',
        amount: 287.42,
        merchant: 'Best Buy',
      },
      {
        id: 'refund-1',
        date: '2026-02-16',
        amount: -287.42,
        merchant: 'Best Buy',
        flow: 'refund_or_reversal',
      },
    ]

    const purchases = matchOrdersToPurchaseTxns('bestbuy', orders, txns, {
      merchantRe: /best\s*buy|bestbuy/i,
      maxDayDiff: 10,
    })
    expect(purchases).toHaveLength(1)

    const refunds = matchRefundCreditsToOrders(
      'bestbuy',
      orders,
      txns,
      purchases,
      {
        merchantRe: /best\s*buy|bestbuy/i,
      },
    )
    expect(refunds).toHaveLength(1)
    expect(refunds[0].refundTxnId).toBe('refund-1')
    expect(refunds[0].purchaseTxnId).toBe('purchase-1')
    expect(refunds[0].refundEnrichment.returnInfo?.isRefundCredit).toBe(true)
    expect(refunds[0].purchaseEnrichment.returnInfo?.relatedTxnId).toBe(
      'refund-1',
    )
  })

  it('embeds returnInfo on purchase enrichment from order', () => {
    const e = enrichmentFromOrder(
      'bestbuy',
      {
        orderId: 'BBY01-1',
        orderTotal: '$10.00',
        status: 'Returned',
        statusDate: 'January 1, 2026',
      },
      'high',
    )
    expect(e.returnInfo?.status).toBe('returned')
  })
})

describe('mergePurchaseEnrichment returnInfo', () => {
  const falseExisting: PurchaseEnrichment = {
    source: 'amazon',
    orderId: '114-3407542-8223433',
    status: 'Delivered today',
    lineItems: [{ title: 'Widget', imageStoragePath: 'user/amazon/x.jpg' }],
    returnInfo: {
      status: 'returned',
      label: 'Delivered today',
      refundAmount: 55.34,
    },
  }

  it('clears false Amazon returnInfo when incoming is absent_verified', () => {
    const incoming: PurchaseEnrichment = {
      source: 'amazon',
      orderId: '114-3407542-8223433',
      status: 'Delivered today',
      returnInfoDecision: 'absent_verified',
    }
    const merged = mergePurchaseEnrichment(falseExisting, incoming)
    expect(merged.returnInfo).toBeUndefined()
    expect(merged.lineItems?.[0]?.imageStoragePath).toBe('user/amazon/x.jpg')
    expect(merged.orderId).toBe('114-3407542-8223433')
  })

  it('updates Amazon returnInfo when incoming is present', () => {
    const incoming: PurchaseEnrichment = {
      source: 'amazon',
      orderId: '114-4156975-2220238',
      returnInfoDecision: 'present',
      returnInfo: {
        status: 'returned',
        label: 'Return complete',
        refundAmount: 30.94,
      },
    }
    const merged = mergePurchaseEnrichment(falseExisting, incoming)
    expect(merged.returnInfo?.status).toBe('returned')
    expect(merged.returnInfo?.refundAmount).toBe(30.94)
  })

  it('preserves Amazon returnInfo when incoming is unknown', () => {
    const incoming: PurchaseEnrichment = {
      source: 'amazon',
      orderId: '114-3407542-8223433',
      returnInfoDecision: 'unknown',
    }
    const merged = mergePurchaseEnrichment(falseExisting, incoming)
    expect(merged.returnInfo?.status).toBe('returned')
  })

  it('preserves Best Buy returnInfo without absence decision', () => {
    const existing: PurchaseEnrichment = {
      source: 'bestbuy',
      returnInfo: { status: 'returned', refundAmount: 10 },
      lineItems: [{ title: 'TV' }],
    }
    const incoming: PurchaseEnrichment = {
      source: 'bestbuy',
      status: 'Delivered',
      lineItems: [{ title: 'TV', price: 10 }],
    }
    const merged = mergePurchaseEnrichment(existing, incoming)
    expect(merged.returnInfo?.status).toBe('returned')
    expect(merged.lineItems?.[0]?.price).toBe(10)
  })

  it('classifies clear/update/preserve actions', () => {
    expect(
      classifyReturnInfoMerge(falseExisting, {
        source: 'amazon',
        returnInfoDecision: 'absent_verified',
      }),
    ).toBe('clear')
    expect(
      classifyReturnInfoMerge(falseExisting, {
        source: 'amazon',
        returnInfoDecision: 'present',
        returnInfo: { status: 'returned', refundAmount: 1 },
      }),
    ).toBe('update')
    expect(
      classifyReturnInfoMerge(falseExisting, {
        source: 'amazon',
        returnInfoDecision: 'unknown',
      }),
    ).toBe('preserve')
  })
})

describe('targeted stale returnInfo repair', () => {
  const falseExisting: PurchaseEnrichment = {
    source: 'amazon',
    orderId: '114-3407542-8223433',
    status: 'Delivered today',
    lineItems: [{ title: 'Widget', imageStoragePath: 'user/amazon/x.jpg' }],
    returnInfo: {
      status: 'returned',
      label: 'Delivered today',
      refundAmount: 55.34,
    },
  }

  const orderDecisions = new Map([
    ['114-3407542-8223433', 'absent_verified' as const],
    ['114-4156975-2220238', 'present' as const],
  ])

  it('updates-only blocks new enrichment insert', () => {
    expect(wouldWriteEnrichmentUpdate(undefined, true)).toBe(false)
    expect(wouldWriteEnrichmentUpdate(falseExisting, true)).toBe(true)
  })

  it('only-transaction-ids restricts repair plan rows', () => {
    const txns = [
      { id: 'txn-a', userId: 'user-1', purchaseEnrichment: falseExisting },
      { id: 'txn-b', userId: 'user-1', purchaseEnrichment: { ...falseExisting, orderId: 'other' } },
    ]
    const plan = buildTargetedStaleReturnInfoRepairPlan(txns, orderDecisions, {
      updatesOnly: true,
      clearStaleReturnInfoOnly: true,
      onlyTxnIds: ['txn-a'],
      scopedUserId: 'user-1',
    })
    expect(plan).toHaveLength(1)
    expect(plan[0].txnId).toBe('txn-a')
  })

  it('explicit txn ID with matching user_id is repairable', () => {
    const plan = buildTargetedStaleReturnInfoRepairPlan(
      [
        {
          id: 'txn-a',
          userId: 'c2831538-94b0-4a57-b034-5e873a53c42e',
          purchaseEnrichment: falseExisting,
        },
      ],
      orderDecisions,
      {
        updatesOnly: true,
        clearStaleReturnInfoOnly: true,
        onlyTxnIds: ['txn-a'],
        scopedUserId: 'c2831538-94b0-4a57-b034-5e873a53c42e',
      },
    )
    expect(plan[0].action).toBe('clear')
  })

  it('explicit txn ID with different user_id is skipped by default', () => {
    const crossUserLookup = new Map([
      ['638322c3-b28e-4ecf-b7c6-0b8360d38f98', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    ])
    const plan = buildTargetedStaleReturnInfoRepairPlan(
      [],
      orderDecisions,
      {
        updatesOnly: true,
        clearStaleReturnInfoOnly: true,
        onlyTxnIds: ['638322c3-b28e-4ecf-b7c6-0b8360d38f98'],
        scopedUserId: 'c2831538-94b0-4a57-b034-5e873a53c42e',
      },
      crossUserLookup,
    )
    expect(plan[0].action).toBe('skip_cross_user')
    expect(plan[0].actualUserId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(plan.filter((p) => p.action === 'clear')).toHaveLength(0)
  })

  it('cross-user skipped row does not count as proposed clear', () => {
    const plan = buildTargetedStaleReturnInfoRepairPlan(
      [
        {
          id: 'txn-a',
          userId: 'c2831538-94b0-4a57-b034-5e873a53c42e',
          purchaseEnrichment: falseExisting,
        },
      ],
      orderDecisions,
      {
        updatesOnly: true,
        clearStaleReturnInfoOnly: true,
        onlyTxnIds: [
          'txn-a',
          '638322c3-b28e-4ecf-b7c6-0b8360d38f98',
        ],
        scopedUserId: 'c2831538-94b0-4a57-b034-5e873a53c42e',
      },
      new Map([
        ['638322c3-b28e-4ecf-b7c6-0b8360d38f98', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
      ]),
    )
    expect(plan.filter((p) => p.action === 'clear')).toHaveLength(1)
    expect(plan.filter((p) => p.action === 'skip_cross_user')).toHaveLength(1)
  })

  it('override flag allows cross-user repair when explicitly enabled', () => {
    const plan = buildTargetedStaleReturnInfoRepairPlan(
      [
        {
          id: '638322c3-b28e-4ecf-b7c6-0b8360d38f98',
          userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          purchaseEnrichment: falseExisting,
        },
      ],
      orderDecisions,
      {
        updatesOnly: true,
        clearStaleReturnInfoOnly: true,
        onlyTxnIds: ['638322c3-b28e-4ecf-b7c6-0b8360d38f98'],
        scopedUserId: 'c2831538-94b0-4a57-b034-5e873a53c42e',
        allowCrossUserExplicitRepair: true,
      },
    )
    expect(plan[0].action).toBe('clear')
  })

  it('clear-stale-return-info-only only clears returnInfo', () => {
    const after = repairStaleReturnInfoOnly(falseExisting, 'absent_verified')
    expect(after?.returnInfo).toBeUndefined()
    expect(after?.lineItems?.[0]?.imageStoragePath).toBe('user/amazon/x.jpg')
    expect(after?.status).toBe('Delivered today')
    expect(enrichmentFieldChanges(falseExisting, after!)).toEqual(['returnInfo'])
  })

  it('repairs existing enrichment not selected by matcher', () => {
    const unmatchedTxn = {
      id: '638322c3-b28e-4ecf-b7c6-0b8360d38f98',
      userId: 'c2831538-94b0-4a57-b034-5e873a53c42e',
      purchaseEnrichment: falseExisting,
    }
    const plan = buildTargetedStaleReturnInfoRepairPlan(
      [unmatchedTxn],
      orderDecisions,
      {
        updatesOnly: true,
        clearStaleReturnInfoOnly: true,
        onlyTxnIds: ['638322c3-b28e-4ecf-b7c6-0b8360d38f98'],
        scopedUserId: 'c2831538-94b0-4a57-b034-5e873a53c42e',
      },
    )
    expect(plan[0].action).toBe('clear')
    expect(plan[0].fieldsChanged).toEqual(['returnInfo'])
  })

  it('does not clear valid returnInfo when decision is present', () => {
    const validExisting: PurchaseEnrichment = {
      source: 'amazon',
      orderId: '114-4156975-2220238',
      status: 'Return complete',
      returnInfo: { status: 'returned', refundAmount: 30.94 },
    }
    expect(repairStaleReturnInfoOnly(validExisting, 'present')).toBeNull()
    const plan = buildTargetedStaleReturnInfoRepairPlan(
      [{ id: 'txn-1', userId: 'user-1', purchaseEnrichment: validExisting }],
      orderDecisions,
      {
        updatesOnly: true,
        clearStaleReturnInfoOnly: true,
        onlyTxnIds: ['txn-1'],
        scopedUserId: 'user-1',
      },
    )
    expect(plan[0].action).toBe('skip_decision')
  })

  it('unknown decision preserves existing returnInfo via merge', () => {
    const merged = mergePurchaseEnrichment(falseExisting, {
      source: 'amazon',
      returnInfoDecision: 'unknown',
    })
    expect(merged.returnInfo?.status).toBe('returned')
    expect(repairStaleReturnInfoOnly(falseExisting, 'unknown')).toBeNull()
  })
})
