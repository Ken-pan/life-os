import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isProdMoneyReadEnabled,
  projectMoneyFromTodayFinance,
} from './moneyReadSource.core.js'

describe('moneyReadSource.core', () => {
  it('defaults money read Off', () => {
    assert.equal(isProdMoneyReadEnabled({}), false)
    assert.equal(isProdMoneyReadEnabled({ VITE_KENOS_PROD_READ_MONEY: '1' }), true)
  })

  it('projects finance summary without inventing ledger rows', () => {
    const projected = projectMoneyFromTodayFinance({
      spent_today: 42,
      currency: 'CAD',
      pending_bills: 2,
    })
    assert.equal(projected.spentToday, 42)
    assert.equal(projected.pendingBills, 2)
    assert.equal(projected.deepLink, 'https://finance.kenos.space')
  })
})
