import { describe, expect, it } from 'vitest'
import {
  isBestBuyAggregatePayment,
  isDirectMerchantPurchaseTxn,
  isTargetAggregatePayment,
} from './merchantChargeFilters'

describe('merchantChargeFilters', () => {
  it('detects Target RedCard statement payments', () => {
    expect(isTargetAggregatePayment('Target Card')).toBe(true)
    expect(isTargetAggregatePayment('Target Credit Card')).toBe(true)
    expect(isTargetAggregatePayment('TARGET 1284 SEATTLE WA')).toBe(false)
    expect(isTargetAggregatePayment('Target')).toBe(false)
  })

  it('allows direct Target store charges only', () => {
    expect(
      isDirectMerchantPurchaseTxn('target', {
        id: '1',
        date: '2026-06-06',
        amount: 40.95,
        merchant: 'Target',
      }),
    ).toBe(true)
    expect(
      isDirectMerchantPurchaseTxn('target', {
        id: '2',
        date: '2026-06-26',
        amount: 289.06,
        merchant: 'Target Card',
      }),
    ).toBe(false)
  })

  it('detects Best Buy card payments', () => {
    expect(isBestBuyAggregatePayment('Best Buy Credit Card')).toBe(true)
    expect(isBestBuyAggregatePayment('Best Buy')).toBe(false)
  })
})
