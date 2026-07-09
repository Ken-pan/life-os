import { describe, expect, it } from 'vitest'
import {
  enrichmentFromOrder,
  isBestBuyMerchant,
  matchBestBuyOrdersToTxns,
} from './bestbuyOrderMatch'
import type { MerchantOrderRecord } from './purchaseOrderMatch'

describe('bestbuyOrderMatch', () => {
  it('detects best buy merchants', () => {
    expect(isBestBuyMerchant('Best Buy')).toBe(true)
    expect(isBestBuyMerchant('BESTBUY.COM')).toBe(true)
    expect(isBestBuyMerchant('Target')).toBe(false)
  })

  it('matches txn to order by amount and nearby date', () => {
    const orders = [
      {
        orderId: 'BBY01-807200460563',
        orderDate: 'June 20, 2026',
        orderTotal: '$119.87',
        status: 'Delivered',
        lineItems: [{ title: 'USB Hub' }],
      },
    ]
    const txns = [
      { id: 'txn-1', date: '2026-06-21', amount: 119.87, merchant: 'Best Buy' },
      { id: 'txn-2', date: '2026-06-21', amount: 50, merchant: 'Best Buy' },
    ]
    const matches = matchBestBuyOrdersToTxns(orders, txns)
    expect(matches).toHaveLength(1)
    expect(matches[0].txnId).toBe('txn-1')
    expect(matches[0].orderId).toBe('BBY01-807200460563')
    expect(matches[0].enrichment.source).toBe('bestbuy')
  })

  it('builds enrichment payload', () => {
    const e = enrichmentFromOrder(
      { orderId: 'BBY01-1', orderTotal: '$10.00', status: 'Delivered' },
      'high',
    )
    expect(e.source).toBe('bestbuy')
    expect(e.orderTotal).toBe(10)
    expect(e.matchConfidence).toBe('high')
  })

  it('matches in-store order via date encoded in order id, ignoring polluted orderDate', () => {
    // In-store id tail `-041526` → 2026-04-15; scraped dates fall back to harvest day.
    const orders = [
      {
        orderId: '470-70-6673-041526',
        orderDate: 'July 6, 2026',
        statusDate: 'July 6, 2026',
        status: 'Returned',
        channel: 'In store',
        orderTotal: '$159.24',
        lineItems: [{ title: 'Cable' }],
      },
    ]
    const txns = [
      { id: 'txn-1', date: '2026-04-15', amount: 159.24, merchant: 'Best Buy' },
      {
        id: 'txn-far',
        date: '2026-07-06',
        amount: 159.24,
        merchant: 'Best Buy',
      },
    ]
    const matches = matchBestBuyOrdersToTxns(orders, txns)
    expect(matches).toHaveLength(1)
    expect(matches[0].txnId).toBe('txn-1')
    expect(matches[0].enrichment.orderDate).toBe('2026-04-15')
  })

  it('does not misread online BBY order ids as encoded dates', () => {
    const e = enrichmentFromOrder(
      {
        orderId: 'BBY01-807200460563',
        orderDate: 'June 20, 2026',
        orderTotal: '$119.87',
        status: 'Delivered',
      },
      'high',
    )
    expect(e.orderDate).toBe('2026-06-20')
  })

  it('matcher and normalized export agree on date source', () => {
    const order = {
      orderId: '470-70-6673-041526',
      orderDate: 'April 15, 2026',
      orderDateIso: '2026-04-15',
      orderDateSource: 'receipt_id',
      statusDate: 'July 6, 2026',
      status: 'Returned',
      channel: 'In store',
      orderTotal: '$159.24',
      lineItems: [{ title: 'Cable' }],
    } satisfies MerchantOrderRecord
    const e = enrichmentFromOrder(order, 'high')
    expect(e.orderDate).toBe('2026-04-15')
  })
})
