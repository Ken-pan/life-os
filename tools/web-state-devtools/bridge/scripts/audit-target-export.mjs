#!/usr/bin/env node
/**
 * Audit a Target orders export for data quality.
 *
 * Usage:
 *   node scripts/audit-target-export.mjs [--file path/to/raw.json] [--sample 20] [--seed 20260707]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOrdersRawPath } from '../lib/orders-export.mjs'
import {
  canonicalSourceView,
  isInStoreSourceView,
  isInstoreOrderId,
} from '../lib/target-orders-parser.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_EXPORT_DIR = path.join(__dirname, '..', 'data', 'target-export')

function argVal(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const sampleN = Number(argVal('--sample') || 20)
const seed = Number(argVal('--seed') || 20260707)
const fileArg = argVal('--file')

/** Deterministic seeded PRNG (mulberry32). */
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

const INSTORE_ID_RE = /^\d{4}-\d{4}-\d{4}-\d{4}$/
const GENERIC_TITLE_RE =
  /^(item|product|view details|details|buy again|add to cart|return complete)$/i
const QTY_IN_TITLE_RE = /\b(?:quantity|qty)\s*[:]\s*(\d+)/i
const QTY_BADGE_RE = /\b(?:qty|quantity)\s*[:.]?\s*(\d+)\b|(?:^|\s)x(\d+)(?:\s|$)/i
const DIMENSION_RE = /\d["']?\s*x\s*\d+/i

function parseMoney(v) {
  if (v == null || v === '') return NaN
  return parseFloat(String(v).replace(/[^0-9.-]/g, ''))
}

function parseOrderDate(raw) {
  if (!raw) return NaN
  const t = Date.parse(String(raw))
  if (!Number.isNaN(t)) return t
  const m = String(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return NaN
  let year = Number(m[3])
  if (year < 100) year += 2000
  return Date.parse(`${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`)
}

function toIsoDate(raw) {
  const t = parseOrderDate(raw)
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString().slice(0, 10)
}

function isOnline(order) {
  return (
    order.sourceView === 'online' ||
    (!INSTORE_ID_RE.test(order.orderId || '') && !order.sourceView)
  )
}

function isInstore(order) {
  return isInStoreSourceView(order.sourceView) || isInstoreOrderId(order.orderId)
}

function mergeKey(order) {
  return order.detailUrl || order.orderId || null
}

function normalizedStatus(order) {
  const s = (order.status || '').trim()
  const ri = order.returnInfo?.status
  if (ri) return ri
  if (/^return complete$/i.test(s)) return 'returned'
  if (/^return(ed)?$/i.test(s)) return 'returned'
  if (/^refund(ed)?$/i.test(s)) return 'refunded'
  if (/^cancel(l)?ed$/i.test(s)) return 'cancelled'
  if (/return (started|requested|in progress)/i.test(s)) return 'return_in_progress'
  if (/pickup expired|unable to fulfill/i.test(s)) return 'cancelled_or_unfulfilled'
  return s.toLowerCase() || null
}

function isReturned(order) {
  const ns = normalizedStatus(order)
  return ns === 'returned' || ns === 'return_complete' || ns === 'refunded'
}

function isCancelled(order) {
  const ns = normalizedStatus(order)
  return ns === 'cancelled' || ns === 'cancelled_or_unfulfilled'
}

function isPartialReturn(order) {
  const items = order.lineItems || []
  const statuses = items.map((li) => (li.status || '').toLowerCase())
  const hasReturn = statuses.some((s) => /return|refund/.test(s))
  const hasNonReturn = statuses.some((s) => s && !/return|refund/.test(s))
  return hasReturn && hasNonReturn
}

function auditOrder(order, index) {
  const warnings = []
  const id = order.orderId || `index:${index}`

  if (!order.sourceView) {
    warnings.push({ code: 'missing_sourceView', orderId: id })
  }

  if (isInstore(order) && !order.orderId && !mergeKey(order)) {
    warnings.push({ code: 'instore_missing_id', orderId: id })
  }

  const iso = toIsoDate(order.orderDate)
  if (!order.orderDate || !iso) {
    warnings.push({
      code: 'date_missing_or_invalid',
      orderId: id,
      rawDateText: order.orderDate,
    })
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

    const qtyInTitle = title.match(QTY_IN_TITLE_RE)
    if (qtyInTitle && Number(qtyInTitle[1]) > 1 && qty === 1) {
      warnings.push({
        code: 'quantity_badge_mismatch',
        orderId: id,
        title,
        parsedQuantity: qty,
        quantityRaw: qtyInTitle[0],
      })
    }

    const qtyRaw = li.quantityRaw || ''
    const badgeMatch =
      !DIMENSION_RE.test(title) &&
      (qtyRaw.match(QTY_BADGE_RE) || title.match(QTY_IN_TITLE_RE))
    if (badgeMatch && qty === 1 && QTY_IN_TITLE_RE.test(title)) {
      const badgeQty = Number(
        qtyInTitle?.[1] || badgeMatch[1] || badgeMatch[2],
      )
      if (badgeQty > 1) {
        warnings.push({
          code: 'quantity_badge_text_mismatch',
          orderId: id,
          title,
          parsedQuantity: qty,
          quantityRaw: qtyRaw || badgeMatch[0],
        })
      }
    }
  }

  const rawStatus = order.status || ''
  if (/return complete|returned|refunded|cancel/i.test(rawStatus)) {
    const ns = normalizedStatus(order)
    if (
      ns === rawStatus.toLowerCase() &&
      /return complete|cancelled|refunded/i.test(rawStatus) &&
      !['returned', 'refunded', 'cancelled', 'return_in_progress', 'cancelled_or_unfulfilled'].includes(ns)
    ) {
      warnings.push({
        code: 'status_not_normalized',
        orderId: id,
        statusRaw: rawStatus,
        normalized: ns,
      })
    }
  }

  const itemCount = (order.lineItems || []).length
  if (
    Number.isFinite(totalNum) &&
    itemCount > 0 &&
    totalNum === itemCount &&
    totalNum < 50
  ) {
    warnings.push({
      code: 'total_may_be_item_count',
      orderId: id,
      orderTotal: order.orderTotal,
      itemCount,
    })
  }

  return warnings
}

function buildSummary(file, data) {
  const summary = data.summary || {}
  const orders = data.orders || []

  const online = orders.filter(isOnline)
  const instore = orders.filter(isInstore)
  const returned = orders.filter(isReturned)
  const cancelled = orders.filter(isCancelled)
  const partialReturn = orders.filter(isPartialReturn)

  let itemsTotal = 0
  let missingTitle = 0
  let missingImage = 0
  let missingQty = 0
  let qtyGt1 = 0
  let ordersWithItems = 0
  let ordersMissingItems = 0

  for (const o of orders) {
    const items = o.lineItems || []
    if (items.length) ordersWithItems++
    else ordersMissingItems++
    for (const li of items) {
      itemsTotal++
      if (!li.title?.trim() || GENERIC_TITLE_RE.test(li.title.trim()))
        missingTitle++
      if (!li.imageUrl) missingImage++
      if (li.quantity == null || li.quantity < 1) missingQty++
      if (li.quantity > 1) qtyGt1++
    }
  }

  const mergeKeys = orders.map(mergeKey).filter(Boolean)
  const orderIds = orders.map((o) => o.orderId).filter(Boolean)
  const receiptIds = orders.filter(isInstore).map((o) => o.orderId).filter(Boolean)
  const dupMerge = mergeKeys.length - new Set(mergeKeys).size
  const dupOrderId = orderIds.length - new Set(orderIds).size
  const dupReceiptId = receiptIds.length - new Set(receiptIds).size

  const sourceViewCounts = {}
  for (const o of orders) {
    const sv = canonicalSourceView(o.sourceView) || '(missing)'
    sourceViewCounts[sv] = (sourceViewCounts[sv] || 0) + 1
  }

  const collisionBuckets = new Map()
  for (const o of instore) {
    const key = `${toIsoDate(o.orderDate)}|${o.storeName || ''}|${o.orderTotal || ''}`
    collisionBuckets.set(key, (collisionBuckets.get(key) || 0) + 1)
  }
  const sameDateStoreTotalCollisionCount = [...collisionBuckets.values()].filter(
    (n) => n > 1,
  ).length

  const returnCompleteCount = orders.filter(
    (o) =>
      (o.statusRaw || o.status || '').toLowerCase() === 'return complete' ||
      o.returnInfo?.status === 'returned',
  ).length

  const dates = orders
    .map((o) => toIsoDate(o.orderDate))
    .filter(Boolean)
    .sort()
  const dateMin = dates[0] || null
  const dateMax = dates[dates.length - 1] || null

  const storeCounts = new Map()
  for (const o of instore) {
    const s = o.storeName || '(unknown)'
    storeCounts.set(s, (storeCounts.get(s) || 0) + 1)
  }
  const topStores = [...storeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  return {
    file,
    source: summary.source || 'target',
    harvestSince: summary.harvestSince || summary.pastYearCutoff,
    harvestUntil: summary.harvestUntil,
    viewsCaptured: (summary.viewsCaptured || []).map((v) =>
      v === 'instore' ? 'in_store' : v,
    ),
    sourceViewCounts,
    totalOrders: orders.length,
    onlineCount: online.length,
    inStoreCount: instore.length,
    instoreCount: instore.length,
    returnedCount: returned.length,
    returnCompleteCount,
    cancelledCount: cancelled.length,
    partialReturnCount: partialReturn.length,
    ordersWithItemsCount: ordersWithItems,
    ordersMissingItemsCount: ordersMissingItems,
    itemsTotalCount: itemsTotal,
    itemsMissingTitleCount: missingTitle,
    itemsMissingImageCount: missingImage,
    itemsMissingQuantityCount: missingQty,
    itemsWithQuantityGt1Count: qtyGt1,
    duplicateMergeKeyCount: dupMerge,
    duplicateOrderIdCount: dupOrderId,
    duplicateReceiptIdCount: dupReceiptId,
    sameDateStoreTotalCollisionCount,
    dateRangeMin: dateMin,
    dateRangeMax: dateMax,
    storesCount: storeCounts.size,
    topStores,
  }
}

function sampleRecord(order, index) {
  const items = order.lineItems || []
  return {
    index,
    sourceView: order.sourceView,
    orderId: order.orderId,
    receiptId: INSTORE_ID_RE.test(order.orderId || '') ? order.orderId : undefined,
    mergeKey: mergeKey(order),
    date: order.orderDate,
    storeName: order.storeName,
    total: order.orderTotal,
    status: order.status,
    itemCount: items.length,
    first3Titles: items.slice(0, 3).map((li) => li.title),
    first3Quantities: items.slice(0, 3).map((li) => li.quantity),
    first3Images: items.slice(0, 3).map((li) => li.imageUrl || '(missing)'),
    rawStatusText: order.statusRaw || order.status,
    rawQuantityText: items.slice(0, 3).map((li) => li.quantityRaw || null),
  }
}

function main() {
  const file =
    fileArg ||
    resolveOrdersRawPath(DEFAULT_EXPORT_DIR, 'target') ||
    (() => {
      throw new Error('No export file found. Pass --file <path>')
    })()

  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const orders = data.orders || []
  const rng = mulberry32(seed)

  const auditSummary = buildSummary(file, data)

  const allWarnings = []
  for (let i = 0; i < orders.length; i++) {
    allWarnings.push(...auditOrder(orders[i], i))
  }

  const warningCounts = {}
  for (const w of allWarnings) {
    warningCounts[w.code] = (warningCounts[w.code] || 0) + 1
  }

  const sampled = seededShuffle(
    orders.map((o, i) => ({ order: o, index: i })),
    rng,
  )
    .slice(0, sampleN)
    .map(({ order, index }) => sampleRecord(order, index))

  const qaReport = {
    generatedAt: new Date().toISOString(),
    seed,
    sampleSize: sampleN,
    summary: auditSummary,
    warningCounts,
    warnings: allWarnings,
    samples: sampled,
  }

  const qaPath = file.replace(/-raw\.json$/, '-qa.json')
  fs.writeFileSync(qaPath, JSON.stringify(qaReport, null, 2))

  console.log('\n=== A. Summary ===')
  console.log(JSON.stringify(auditSummary, null, 2))
  console.log('\n=== A2. Key metrics ===')
  console.log('viewsCaptured:', auditSummary.viewsCaptured)
  console.log('sourceViewCounts:', auditSummary.sourceViewCounts)
  console.log('totalOrders:', auditSummary.totalOrders)
  console.log('onlineCount:', auditSummary.onlineCount)
  console.log('in_store count:', auditSummary.inStoreCount)
  console.log('itemsTotalCount:', auditSummary.itemsTotalCount)
  console.log('itemsMissingTitleCount:', auditSummary.itemsMissingTitleCount)
  console.log('itemsMissingImageCount:', auditSummary.itemsMissingImageCount)
  console.log('itemsMissingQuantityCount:', auditSummary.itemsMissingQuantityCount)
  console.log('itemsWithQuantityGt1Count:', auditSummary.itemsWithQuantityGt1Count)
  console.log('returnedCount:', auditSummary.returnedCount)
  console.log('returnCompleteCount:', auditSummary.returnCompleteCount)
  console.log('cancelledCount:', auditSummary.cancelledCount)
  console.log('duplicateOrderIdCount:', auditSummary.duplicateOrderIdCount)
  console.log('duplicateReceiptIdCount:', auditSummary.duplicateReceiptIdCount)
  console.log('duplicateMergeKeyCount:', auditSummary.duplicateMergeKeyCount)
  console.log(
    'sameDateStoreTotalCollisionCount:',
    auditSummary.sameDateStoreTotalCollisionCount,
  )

  console.log('\n=== B. Data quality warnings ===')
  console.log(`Total warnings: ${allWarnings.length}`)
  console.log(JSON.stringify(warningCounts, null, 2))
  for (const w of allWarnings.slice(0, 15)) {
    console.log(`  - ${w.code}: ${w.orderId}${w.title ? ` "${w.title.slice(0, 50)}"` : ''}`)
  }
  if (allWarnings.length > 15) {
    console.log(`  ... and ${allWarnings.length - 15} more`)
  }

  console.log(`\n=== C. Randomized spot-check (seed=${seed}, n=${sampleN}) ===`)
  for (const s of sampled) {
    console.log(JSON.stringify(s, null, 2))
    console.log('---')
  }

  console.log(`\n=== D. QA report saved ===`)
  console.log(qaPath)

  return qaReport
}

main()
