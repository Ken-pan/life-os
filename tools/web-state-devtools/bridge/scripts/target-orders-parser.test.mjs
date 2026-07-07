#!/usr/bin/env node
/**
 * Fixture-based tests for Target order parser helpers + export integrity.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  canonicalSourceView,
  cleanProductTitle,
  isGenericTitle,
  isInStoreSourceView,
  isInstoreOrderId,
  mergeKeyFromOrder,
  normalizeOrderStatus,
  parseQuantityFromText,
  SOURCE_VIEW_IN_STORE,
  toIsoDate,
} from '../lib/target-orders-parser.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_RAW = path.join(
  __dirname,
  '..',
  'data',
  'target-export',
  'target-orders-2024-07-01_to_2026-07-07-raw.json',
)

test('in-store item with quantity badge in alt text', () => {
  const raw = 'Lactose Free 2% Milk - 0.5gal - Good & Gather™ - quantity: 4'
  const { quantity, quantityRaw } = parseQuantityFromText(raw)
  assert.equal(quantity, 4)
  assert.match(quantityRaw, /quantity:\s*4/i)
  assert.equal(cleanProductTitle(raw), 'Lactose Free 2% Milk - 0.5gal - Good & Gather™')
})

test('in-store returned item status normalization', () => {
  const a = normalizeOrderStatus('Return complete')
  assert.equal(a.status, 'returned')
  assert.equal(a.statusRaw, 'Return complete')

  const b = normalizeOrderStatus('Return started')
  assert.equal(b.status, 'return_in_progress')
})

test('in-store order id format', () => {
  assert.equal(isInstoreOrderId('6187-0338-0172-8891'), true)
  assert.equal(isInstoreOrderId('912003497949320'), false)
})

test('online order id still distinct from in-store', () => {
  assert.equal(isInstoreOrderId('912003497949320'), false)
  assert.equal(toIsoDate('Jun 22, 2026'), '2026-06-22')
})

test('does not parse dimensions as quantity x84', () => {
  const raw =
    '40"x84" Sun Zero Doucet Thermal Blackout Rod Pocket Curtain Panel Black'
  const { quantity } = parseQuantityFromText(raw)
  assert.equal(quantity, 1)
})

test('rejects generic/button titles', () => {
  assert.equal(isGenericTitle('View details'), true)
  assert.equal(isGenericTitle('Get top deals, latest trends, and more.'), true)
  assert.equal(isGenericTitle('About Us'), true)
  assert.equal(isGenericTitle('Fresh Bananas - each'), false)
})

test('load-more export has no duplicate order ids', () => {
  if (!fs.existsSync(EXPORT_RAW)) {
    console.log('skip: export file not present')
    return
  }
  const data = JSON.parse(fs.readFileSync(EXPORT_RAW, 'utf8'))
  const orders = data.orders || []
  const ids = orders.map((o) => o.orderId).filter(Boolean)
  assert.equal(ids.length, new Set(ids).size, 'duplicate orderId found')

  const keys = orders.map(mergeKeyFromOrder).filter(Boolean)
  assert.equal(keys.length, new Set(keys).size, 'duplicate mergeKey found')
})

test('canonical sourceView normalizes legacy instore', () => {
  assert.equal(canonicalSourceView('instore'), SOURCE_VIEW_IN_STORE)
  assert.equal(canonicalSourceView('in_store'), SOURCE_VIEW_IN_STORE)
  assert.equal(canonicalSourceView('online'), 'online')
  assert.equal(isInStoreSourceView('instore'), true)
  assert.equal(isInStoreSourceView('in_store'), true)
  assert.equal(isInStoreSourceView('online'), false)
})

test('export contains online and in_store views', () => {
  if (!fs.existsSync(EXPORT_RAW)) return
  const data = JSON.parse(fs.readFileSync(EXPORT_RAW, 'utf8'))
  const views = (data.summary.viewsCaptured || []).map((v) =>
    v === 'instore' ? 'in_store' : v,
  )
  assert.deepEqual(views, ['online', 'in_store'])
  const instore = data.orders.filter(
    (o) => isInStoreSourceView(o.sourceView) || isInstoreOrderId(o.orderId),
  )
  const online = data.orders.filter(
    (o) => o.sourceView === 'online' && !isInstoreOrderId(o.orderId),
  )
  assert.ok(instore.length > 0, 'expected in-store orders')
  assert.ok(online.length > 0, 'expected online orders')
})
