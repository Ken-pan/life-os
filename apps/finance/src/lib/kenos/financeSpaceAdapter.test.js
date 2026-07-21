import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MONEY_SPACE_ID,
  sanitizeMoneySubtitle,
  suspendMoneySpace,
} from './financeSpaceAdapter.js'

describe('financeSpaceAdapter (Money)', () => {
  it('uses frozen money space id', () => {
    assert.equal(MONEY_SPACE_ID, 'money')
  })

  it('sanitizes amounts from resume subtitles', () => {
    assert.equal(sanitizeMoneySubtitle('Spent ¥1,234.50 today'), 'Spent [amount] today')
    assert.equal(sanitizeMoneySubtitle('Today'), 'Today')
  })

  it('suspends without balance amounts in descriptor', () => {
    const d = suspendMoneySpace({
      pathname: '/home/today',
      sectionLabel: 'Balance $12,345',
    })
    assert.equal(d.spaceId, 'money')
    assert.equal(d.displaySubtitle, 'Balance [amount]')
    assert.ok(!/\$12/.test(JSON.stringify(d)))
  })
})
