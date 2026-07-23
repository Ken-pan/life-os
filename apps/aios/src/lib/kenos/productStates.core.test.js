import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PRODUCT_COPY,
  formatLastSyncedLabel,
  sanitizeContinueDetail,
} from './productStates.core.js'

describe('productStates.core', () => {
  it('exposes honest empty / expired copy without demo language', () => {
    assert.match(PRODUCT_COPY.continueEmptyRecent.title, /继续/)
    assert.match(PRODUCT_COPY.todayEmptyUrgent.title, /没有需要处理/)
    assert.match(PRODUCT_COPY.permissionDenied.title, /连接 Korben 账户/)
    assert.doesNotMatch(JSON.stringify(PRODUCT_COPY), /demo|mock|descriptor/i)
    assert.doesNotMatch(JSON.stringify(PRODUCT_COPY), /Cookie|Keychain|Token/i)
  })

  it('sanitizes Continue detail leaks', () => {
    assert.equal(sanitizeContinueDetail('已选 · demo-overdue-task'), '有未完成项')
    assert.equal(sanitizeContinueDetail('c_fly'), '有未完成项')
    assert.equal(sanitizeContinueDetail('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), '')
    assert.equal(sanitizeContinueDetail('Cable fly · Set 2 of 4'), 'Cable fly · Set 2 of 4')
    assert.equal(sanitizeContinueDetail('https://training.kenos.space/x'), '继续上次位置')
  })

  it('formats last-synced labels', () => {
    const now = Date.parse('2026-07-20T20:00:00.000Z')
    assert.equal(formatLastSyncedLabel(now - 12 * 60_000, now), '最后更新：12 分钟前')
    assert.equal(formatLastSyncedLabel(now - 30_000, now), '最后更新：刚刚')
  })
})
