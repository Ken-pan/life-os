#!/usr/bin/env node
/**
 * Fixture-based tests for Amazon order returnInfo parsing.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveAmazonReturnInfoDecision,
  hasExplicitReturnEvidence,
  isFalsePositiveReturnInfo,
  parseAmazonReturnInfo,
  reparseReturnInfoFromStatusOnly,
} from '../lib/amazon-orders-parser.mjs'

test('Delivered order with Return or replace items button — no returnInfo', () => {
  const { returnInfo } = parseAmazonReturnInfo('Delivered today', {
    evidenceText: 'Return or replace items Track package Buy it again',
  })
  assert.equal(returnInfo, undefined)
})

test('Arriving order with generic return eligibility — no returnInfo', () => {
  const { returnInfo } = parseAmazonReturnInfo('Arriving tomorrow', {
    evidenceText: 'Eligible for return until August 1 Return window closed',
  })
  assert.equal(returnInfo, undefined)
})

test('Actual refunded order from detail subtotals', () => {
  const { returnInfo } = parseAmazonReturnInfo('Delivered', {
    evidenceText: 'Refund Total: $33.42 Item(s) Subtotal: $33.42',
  })
  assert.equal(returnInfo?.status, 'refunded')
  assert.equal(returnInfo?.refundAmount, 33.42)
})

test('Actual returned order — Return complete status', () => {
  const { returnInfo } = parseAmazonReturnInfo('Return complete', {
    evidenceText: 'Return complete on July 1, 2026',
  })
  assert.equal(returnInfo?.status, 'returned')
})

test('Cancelled order — status cancelled, no purchase return match shape', () => {
  const { returnInfo } = parseAmazonReturnInfo('Cancelled', {
    evidenceText: 'Cancelled',
  })
  assert.equal(returnInfo?.status, 'cancelled')
  assert.equal(returnInfo?.refundAmount, undefined)
})

test('Refunded status line', () => {
  const { returnInfo } = parseAmazonReturnInfo('Refunded', {
    evidenceText: 'Refunded',
  })
  assert.equal(returnInfo?.status, 'refunded')
})

test('reparse strips delivery status false positive from raw export shape', () => {
  const { returnInfo, warnings } = reparseReturnInfoFromStatusOnly({
    orderId: '111-4978359-1621839',
    status: 'Arriving tomorrow',
    orderTotal: '$66.40',
    returnInfo: {
      status: 'returned',
      label: 'Arriving tomorrow',
      refundAmount: 66.4,
    },
  })
  assert.equal(returnInfo, undefined)
  assert.ok(warnings.includes('amazon_return_info_suppressed_no_explicit_evidence'))
})

test('reparse keeps Return complete orders', () => {
  const { returnInfo } = reparseReturnInfoFromStatusOnly({
    status: 'Return complete',
    orderTotal: '$50.00',
    returnInfo: { status: 'returned', label: 'Return complete', refundAmount: 50 },
  })
  assert.equal(returnInfo?.status, 'returned')
})

test('isFalsePositiveReturnInfo detects delivery + returned mismatch', () => {
  assert.equal(
    isFalsePositiveReturnInfo({
      status: 'Delivered today',
      returnInfo: { status: 'returned', label: 'Delivered today' },
    }),
    true,
  )
  assert.equal(
    isFalsePositiveReturnInfo({
      status: 'Return complete',
      returnInfo: { status: 'returned', label: 'Return complete' },
      returnEvidenceText: 'Return complete',
    }),
    false,
  )
})

test('hasExplicitReturnEvidence rejects generic UI only', () => {
  assert.equal(
    hasExplicitReturnEvidence('Return or replace items View return/refund status', 'Delivered today'),
    false,
  )
  assert.equal(hasExplicitReturnEvidence('Refund Total: $10.00', 'Delivered'), true)
})

test('deriveAmazonReturnInfoDecision distinguishes present/absent/unknown', () => {
  assert.equal(
    deriveAmazonReturnInfoDecision({
      status: 'Delivered today',
      returnInfo: undefined,
    }),
    'absent_verified',
  )
  assert.equal(
    deriveAmazonReturnInfoDecision({
      status: 'Return complete',
      returnInfo: { status: 'returned' },
    }),
    'present',
  )
  assert.equal(
    deriveAmazonReturnInfoDecision({
      status: '',
      returnInfo: undefined,
    }),
    'unknown',
  )
})
