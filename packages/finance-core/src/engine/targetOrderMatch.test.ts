import { describe, expect, it } from 'vitest'
import {
  enrichmentFromOrder,
  isTargetMerchant,
  matchTargetOrdersToTxns,
} from './targetOrderMatch'

describe('targetOrderMatch', () => {
  it('detects target merchants', () => {
    expect(isTargetMerchant('Target')).toBe(true)
    expect(isTargetMerchant('TARGET STORE T-1234')).toBe(true)
    expect(isTargetMerchant('Amazon')).toBe(false)
  })

  it('matches txn to order by amount and nearby date', () => {
    const orders = [
      {
        orderId: '12345678901234',
        orderDate: 'June 15, 2026',
        orderTotal: '$42.18',
        status: 'Delivered',
        lineItems: [{ title: 'Dish Soap' }],
      },
    ]
    const txns = [
      { id: 'txn-1', date: '2026-06-16', amount: 42.18, merchant: 'Target' },
    ]
    const matches = matchTargetOrdersToTxns(orders, txns)
    expect(matches).toHaveLength(1)
    expect(matches[0].enrichment.source).toBe('target')
  })

  it('skips Target Card statement payments', () => {
    const orders = [
      {
        orderId: '912003515221488',
        orderDate: 'June 5, 2026',
        orderTotal: '$120.94',
        status: 'Delivered',
        lineItems: [{ title: 'Cabinet' }],
      },
    ]
    const txns = [
      {
        id: 'stmt',
        date: '2026-06-26',
        amount: 289.06,
        merchant: 'Target Card',
      },
      {
        id: 'store',
        date: '2026-06-06',
        amount: 16.92,
        merchant: 'Target',
      },
    ]
    const matches = matchTargetOrdersToTxns(orders, txns)
    expect(matches).toHaveLength(0)
  })

  it('builds enrichment payload', () => {
    const e = enrichmentFromOrder(
      { orderId: 'T-1', orderTotal: '$5.00', status: 'Picked up' },
      'medium',
    )
    expect(e.source).toBe('target')
    expect(e.orderTotal).toBe(5)
  })
})
