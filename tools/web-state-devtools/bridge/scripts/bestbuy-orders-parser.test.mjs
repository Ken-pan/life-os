#!/usr/bin/env node
/**
 * Tests for Best Buy order date normalization.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyBestBuyOrderDateNormalization,
  bestBuyReceiptIdEncodedDate,
  isPollutedInStoreReturnDate,
  normalizeBestBuyOrderDate,
  parseVisibleDateText,
} from '../lib/bestbuy-orders-parser.mjs'
import { enrichmentFromOrder } from '../../../../apps/finance/src/engine/bestbuyOrderMatch.ts'

test('receipt ID 470-70-6673-041526 parses to 2026-04-15', () => {
  assert.equal(bestBuyReceiptIdEncodedDate('470-70-6673-041526'), '2026-04-15')
})

test('invalid receipt suffix does not produce fake date', () => {
  assert.equal(bestBuyReceiptIdEncodedDate('470-70-6673-991326'), undefined)
  assert.equal(bestBuyReceiptIdEncodedDate('BBY01-807200460563'), undefined)
  assert.equal(bestBuyReceiptIdEncodedDate('470-70-6673'), undefined)
})

test('visible date wins over receipt ID', () => {
  const order = {
    orderId: '470-70-6673-041526',
    orderDate: 'March 10, 2026',
    channel: 'In store',
    status: 'Delivered',
  }
  const normalized = normalizeBestBuyOrderDate(order)
  assert.equal(normalized.orderDateSource, 'visible_text')
  assert.equal(normalized.orderDateIso, '2026-03-10')
  assert.equal(normalized.orderDate, 'March 10, 2026')
})

test('returned in-store order does not default to harvest/status date', () => {
  const order = {
    orderId: '470-70-6673-041526',
    orderDate: 'July 6, 2026',
    statusDate: 'July 6, 2026',
    status: 'Returned',
    channel: 'In store',
  }
  assert.equal(isPollutedInStoreReturnDate(order), true)
  const normalized = normalizeBestBuyOrderDate(order)
  assert.equal(normalized.orderDateSource, 'receipt_id')
  assert.equal(normalized.orderDateIso, '2026-04-15')
  assert.notEqual(normalized.orderDate, 'July 6, 2026')
})

test('matcher and normalized export agree on date source', () => {
  const order = applyBestBuyOrderDateNormalization({
    orderId: '470-70-6673-041526',
    orderDate: 'July 6, 2026',
    statusDate: 'July 6, 2026',
    status: 'Returned',
    channel: 'In store',
    orderTotal: '$159.24',
  })
  const enrichment = enrichmentFromOrder(order, 'high')
  assert.equal(order.orderDateIso, '2026-04-15')
  assert.equal(enrichment.orderDate, '2026-04-15')
})

test('parseVisibleDateText handles Best Buy list header dates', () => {
  assert.equal(parseVisibleDateText('June 20, 2026'), '2026-06-20')
})
