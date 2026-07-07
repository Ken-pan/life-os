#!/usr/bin/env node
/**
 * Audit a Best Buy orders export for data quality.
 *
 * Usage:
 *   node scripts/audit-bestbuy-export.mjs [--file path/to/raw.json] [--sample 20] [--seed 20260707]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOrdersRawPath } from '../lib/orders-export.mjs'
import {
  applyBestBuyOrderDateNormalization,
  bestBuyReceiptIdEncodedDate,
  isBestBuyInStoreOrder,
  parseVisibleDateText,
} from '../lib/bestbuy-orders-parser.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_EXPORT_DIR = path.join(__dirname, '..', 'data', 'bestbuy-export')

function argVal(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const sampleN = Number(argVal('--sample') || 20)
const seed = Number(argVal('--seed') || 20260707)
const fileArg = argVal('--file')

function mulberry32(a) {
  return function next() {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle(arr, rng) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const GENERIC_TITLE_RE =
  /^(item|product|view details|details|buy again|add to cart|returned|cancelled|canceled)$/i

function parseMoney(v) {
  if (v == null || v === '') return NaN
  return parseFloat(String(v).replace(/[^0-9.-]/g, ''))
}

function toIsoDate(order) {
  if (order.orderDateIso) return order.orderDateIso
  return parseVisibleDateText(order.orderDate) ?? null
}

function mergeKey(order) {
  return order.detailUrl || order.orderId || null
}

function normalizedStatus(order) {
  const s = (order.status || '').trim()
  const ri = order.returnInfo?.status
  if (ri) return ri
  if (/^returned$/i.test(s)) return 'returned'
  if (/^refund(ed)?$/i.test(s)) return 'refunded'
  if (/^cancel(l)?ed$/i.test(s)) return 'cancelled'
  return s.toLowerCase() || null
}

function isReturned(order) {
  const ns = normalizedStatus(order)
  return ns === 'returned' || ns === 'refunded'
}

function isCancelled(order) {
  const ns = normalizedStatus(order)
  return ns === 'cancelled'
}

function isInStoreReturned(order) {
  return isBestBuyInStoreOrder(order) && isReturned(order)
}

function auditOrder(order, index) {
  const warnings = []
  const id = order.orderId || `index:${index}`

  const iso = toIsoDate(order)
  if (!order.orderDate || !iso) {
    warnings.push({
      code: 'date_missing_or_invalid',
      orderId: id,
      orderDateRaw: order.orderDateRaw || order.orderDate,
      orderDateSource: order.orderDateSource,
    })
  }

  if (isBestBuyInStoreOrder(order) && isReturned(order)) {
    const encoded = bestBuyReceiptIdEncodedDate(order.orderId)
    if (encoded && iso && encoded !== iso) {
      warnings.push({
        code: 'date_mismatch_receipt_vs_orderDate',
        orderId: id,
        receiptIso: encoded,
        orderDateIso: iso,
      })
    }
  }

  const totalNum = parseMoney(order.orderTotal)
  if (!order.orderTotal || !Number.isFinite(totalNum)) {
    warnings.push({
      code: 'total_missing_or_non_numeric',
      orderId: id,
      orderTotal: order.orderTotal,
    })
  }

  for (const li of order.lineItems || []) {
    const title = (li.title || '').trim()
    if (!title || GENERIC_TITLE_RE.test(title)) {
      warnings.push({
        code: 'item_title_empty_or_generic',
        orderId: id,
        title: title || '(empty)',
      })
    }
    if (!li.imageUrl) {
      warnings.push({ code: 'item_missing_image', orderId: id, title })
    }
    const qty = li.quantity
    if (qty == null || qty < 1) {
      warnings.push({
        code: 'item_quantity_missing_or_lt1',
        orderId: id,
        title,
        quantity: qty,
      })
    }
  }

  return warnings
}

function buildSummary(file, data) {
  const orders = (data.orders || []).map((o) =>
    o.orderDateSource ? o : applyBestBuyOrderDateNormalization(o),
  )

  let itemsTotal = 0
  let missingTitle = 0
  let missingImage = 0
  let missingQty = 0
  let missingDate = 0
  let missingTotal = 0
  let ordersWithItems = 0
  let ordersMissingItems = 0

  const orderDateSourceCounts = {}
  const dateMismatchCandidates = []

  for (const o of orders) {
    const src = o.orderDateSource || 'unknown'
    orderDateSourceCounts[src] = (orderDateSourceCounts[src] || 0) + 1

    const iso = toIsoDate(o)
    if (!o.orderDate || !iso) missingDate++

    const totalNum = parseMoney(o.orderTotal)
    if (!o.orderTotal || !Number.isFinite(totalNum)) missingTotal++

    const items = o.lineItems || []
    if (items.length) ordersWithItems++
    else ordersMissingItems++

    for (const li of items) {
      itemsTotal++
      const title = (li.title || '').trim()
      if (!title || GENERIC_TITLE_RE.test(title)) missingTitle++
      if (!li.imageUrl) missingImage++
      if (li.quantity == null || li.quantity < 1) missingQty++
    }

    if (isBestBuyInStoreOrder(o) && isReturned(o)) {
      const encoded = bestBuyReceiptIdEncodedDate(o.orderId)
      if (encoded && iso && encoded !== iso) {
        dateMismatchCandidates.push({
          orderId: o.orderId,
          receiptIso: encoded,
          orderDateIso: iso,
          orderDateSource: o.orderDateSource,
        })
      }
    }
  }

  const returned = orders.filter(isReturned)
  const cancelled = orders.filter(isCancelled)
  const inStoreReturned = orders.filter(isInStoreReturned)
  const inStoreReturnedMissingItems = inStoreReturned.filter(
    (o) => !(o.lineItems || []).length,
  )

  const isos = orders.map(toIsoDate).filter(Boolean).sort()
  const dateRange =
    isos.length >= 2
      ? { min: isos[0], max: isos[isos.length - 1] }
      : isos.length === 1
        ? { min: isos[0], max: isos[0] }
        : null

  const mergeKeys = orders.map(mergeKey).filter(Boolean)
  const orderIds = orders.map((o) => o.orderId).filter(Boolean)
  const receiptIds = orders.filter(isBestBuyInStoreOrder).map((o) => o.orderId)

  return {
    file: path.basename(file),
    orders: orders.length,
    items: itemsTotal,
    ordersWithItems,
    ordersMissingItems,
    missingTitle,
    missingImage,
    missingQuantity: missingQty,
    missingDate,
    missingTotal,
    returned: returned.length,
    refunded: orders.filter((o) => normalizedStatus(o) === 'refunded').length,
    cancelled: cancelled.length,
    inStoreReturned: inStoreReturned.length,
    inStoreReturnedMissingItems: inStoreReturnedMissingItems.length,
    dateRange,
    orderDateSourceCounts,
    dateMismatchCandidates,
    duplicateOrderId: orderIds.length - new Set(orderIds).size,
    duplicateMergeKey: mergeKeys.length - new Set(mergeKeys).size,
    duplicateReceiptId: receiptIds.length - new Set(receiptIds).size,
  }
}

function main() {
  const file =
    fileArg ||
    resolveOrdersRawPath(DEFAULT_EXPORT_DIR, 'bestbuy') ||
    path.join(DEFAULT_EXPORT_DIR, 'bestbuy-orders-past-year-raw.json')

  if (!fs.existsSync(file)) {
    console.error('Export not found:', file)
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const orders = data.orders || []
  const normalizedOrders = orders.map((o) =>
    o.orderDateSource ? o : applyBestBuyOrderDateNormalization(o),
  )

  const allWarnings = []
  for (let i = 0; i < normalizedOrders.length; i++) {
    allWarnings.push(...auditOrder(normalizedOrders[i], i))
  }

  const summary = buildSummary(file, { ...data, orders: normalizedOrders })
  const rng = mulberry32(seed)
  const sample = seededShuffle(normalizedOrders, rng).slice(0, sampleN)

  console.log('=== Best Buy Export QA ===')
  console.log('file:', summary.file)
  console.log('orders:', summary.orders)
  console.log('items:', summary.items)
  console.log(
    'missing title/image/quantity/date/total:',
    summary.missingTitle,
    '/',
    summary.missingImage,
    '/',
    summary.missingQuantity,
    '/',
    summary.missingDate,
    '/',
    summary.missingTotal,
  )
  console.log(
    'returned/refunded/cancelled:',
    summary.returned,
    '/',
    summary.refunded,
    '/',
    summary.cancelled,
  )
  console.log('in-store returned count:', summary.inStoreReturned)
  console.log(
    'in-store returned with missing items:',
    summary.inStoreReturnedMissingItems,
  )
  console.log('date range:', summary.dateRange)
  console.log('orderDateSource counts:', summary.orderDateSourceCounts)
  console.log(
    'date mismatch candidates:',
    summary.dateMismatchCandidates.length,
  )
  if (summary.dateMismatchCandidates.length) {
    for (const row of summary.dateMismatchCandidates.slice(0, 10)) {
      console.log(' ', row)
    }
  }
  console.log(
    'duplicate orderId/mergeKey/receiptId:',
    summary.duplicateOrderId,
    '/',
    summary.duplicateMergeKey,
    '/',
    summary.duplicateReceiptId,
  )
  console.log('warning codes:', [...new Set(allWarnings.map((w) => w.code))])
  console.log('total warnings:', allWarnings.length)
  console.log(
    '\n=== Sample orders (seed',
    seed + ', n=' + sample.length + ') ===',
  )
  for (const o of sample) {
    console.log(
      `- ${o.orderId} | ${o.orderDate || '?'} (${o.orderDateSource || '?'}) | ${o.orderTotal || '?'} | ${o.status || '?'} | items=${(o.lineItems || []).length}`,
    )
  }
}

main()
