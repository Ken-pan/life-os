import { describe, expect, it } from 'vitest'
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
