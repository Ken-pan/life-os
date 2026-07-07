#!/usr/bin/env node
/**
 * Build read-only Merchant Order Audit Bundle (Amazon / Best Buy / Target).
 * Usage: node scripts/build-merchant-order-audit-bundle.mjs [--bundle-dir path]
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { resolveOrdersRawPath } from '../lib/orders-export.mjs'
import {
  canonicalSourceView,
  isInStoreSourceView,
  isInstoreOrderId,
} from '../lib/target-orders-parser.mjs'
import {
  isFalsePositiveReturnInfo,
} from '../lib/amazon-orders-parser.mjs'
import {
  buildEnhancedReconciliation,
  buildQualityReport,
  buildReadModelV1,
  spotCheckSamples,
  writeReadModelBundle,
  CANONICAL_USER,
} from './merchant-read-model-v1.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../../..')
const DATA_ROOT = path.join(__dirname, '..', 'data')
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'
const SEED = 20260707
const SAMPLE_N = 30

const SCRIPT_PATHS = [
  ['tools/web-state-devtools/bridge/scripts/amazon-harvest-2026.mjs', 'amazon_harvest'],
  ['tools/web-state-devtools/bridge/scripts/bestbuy-harvest-past-year.mjs', 'bestbuy_harvest'],
  ['tools/web-state-devtools/bridge/scripts/target-harvest-past-year.mjs', 'target_harvest'],
  ['tools/web-state-devtools/bridge/scripts/audit-target-export.mjs', 'qa'],
  ['tools/web-state-devtools/bridge/scripts/verify-amazon-sample.mjs', 'qa'],
  ['tools/web-state-devtools/bridge/scripts/verify-bestbuy-sample.mjs', 'qa'],
  ['tools/web-state-devtools/bridge/scripts/verify-target-sample.mjs', 'qa'],
  ['tools/web-state-devtools/bridge/scripts/refollow-order-gaps.mjs', 'shared_export'],
  ['tools/web-state-devtools/bridge/scripts/run-recipe.mjs', 'shared_export'],
  ['tools/web-state-devtools/bridge/lib/orders-export.mjs', 'shared_export'],
  ['tools/web-state-devtools/bridge/lib/store.mjs', 'shared_export'],
  ['tools/web-state-devtools/bridge/lib/privacy.mjs', 'shared_export'],
  ['tools/web-state-devtools/bridge/lib/harvest-tab.mjs', 'shared_export'],
  ['tools/web-state-devtools/bridge/lib/target-orders-parser.mjs', 'target_harvest'],
  ['tools/web-state-devtools/bridge/lib/amazon-orders-parser.mjs', 'amazon_harvest'],
  ['tools/web-state-devtools/bridge/scripts/reparse-amazon-export.mjs', 'amazon_harvest'],
  ['tools/web-state-devtools/bridge/scripts/audit-amazon-export.mjs', 'qa'],
  ['tools/web-state-devtools/bridge/scripts/amazon-orders-parser.test.mjs', 'test'],
  ['tools/web-state-devtools/bridge/recipes/amazon-orders.yaml', 'amazon_harvest'],
  ['tools/web-state-devtools/bridge/recipes/bestbuy-orders.yaml', 'bestbuy_harvest'],
  ['tools/web-state-devtools/bridge/recipes/target-orders.yaml', 'target_harvest'],
  ['tools/web-state-devtools/extension/adapters/amazon-orders.js', 'amazon_harvest'],
  ['tools/web-state-devtools/extension/adapters/bestbuy-orders.js', 'bestbuy_harvest'],
  ['tools/web-state-devtools/extension/adapters/target-orders.js', 'target_harvest'],
  ['tools/web-state-devtools/extension/lib/action-runner.js', 'shared_export'],
  ['apps/finance/scripts/link-purchase-orders.mjs', 'db_upload'],
  ['apps/finance/scripts/audit-purchase-data.mjs', 'qa'],
  ['apps/finance/scripts/target-link-dry-run-report.mjs', 'qa'],
  ['apps/finance/scripts/lib/purchaseImageStorage.mjs', 'db_upload'],
  ['apps/finance/src/engine/purchaseOrderMatch.ts', 'matcher'],
  ['apps/finance/src/engine/amazonOrderMatch.ts', 'matcher'],
  ['apps/finance/src/engine/bestbuyOrderMatch.ts', 'matcher'],
  ['apps/finance/src/engine/targetOrderMatch.ts', 'matcher'],
  ['apps/finance/src/engine/merchantChargeFilters.ts', 'matcher'],
  ['apps/finance/src/engine/purchaseEnrichment.ts', 'matcher'],
  ['apps/finance/src/engine/purchaseReturnStatus.ts', 'matcher'],
  ['tools/web-state-devtools/bridge/scripts/target-orders-parser.test.mjs', 'test'],
  ['apps/finance/src/engine/bestbuyOrderMatch.test.ts', 'test'],
]

function argVal(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
}

function sha256Buf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function mkdirp(d) {
  fs.mkdirSync(d, { recursive: true })
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest))
  fs.copyFileSync(src, dest)
}

function redactText(s) {
  if (!s) return s
  return String(s)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[redacted-phone]')
    .replace(/\b(?:ending in|last four|xxxx|••••)\s*\d{4}\b/gi, '[redacted-last4]')
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[redacted-card]')
}

function parseMoneyCents(v) {
  if (v == null || v === '') return null
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function parseIsoDate(raw) {
  if (!raw) return null
  const t = Date.parse(String(raw))
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  const m = String(raw).match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s*(\d{4})?/i,
  )
  if (m) {
    const year = m[3] || new Date().getFullYear()
    const parsed = Date.parse(`${m[1]} ${m[2]}, ${year}`)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10)
  }
  return null
}

const GENERIC_TITLE_RE =
  /^(item|product|view details|details|buy again|add to cart|return complete|track|help)$/i

function normalizeStatus(raw, returnInfo) {
  const statusRaw = raw ? String(raw).trim() : null
  let status = 'unknown'
  const s = (statusRaw || '').toLowerCase()
  if (/return complete|returned/.test(s)) status = 'returned'
  else if (/refund/.test(s)) status = 'refunded'
  else if (/cancel/.test(s)) status = 'cancelled'
  else if (/partial return/.test(s)) status = 'partial_return'
  else if (/deliver/.test(s)) status = 'delivered'
  else if (/arriv|ship/.test(s)) status = 'shipped'
  else if (/pickup|picked up/.test(s)) status = 'delivered'
  else if (/purchas/.test(s)) status = 'purchased'
  else if (!statusRaw && returnInfo?.status) status = returnInfo.status
  else if (statusRaw) status = 'unknown'
  return { status, statusRaw }
}

function inferSourceView(source, order) {
  const sv = order.sourceView
  if (sv) {
    const c = canonicalSourceView(sv)
    if (c === 'in_store') return 'in_store'
    if (c === 'online') return 'online'
    return c
  }
  if (source === 'target' && isInstoreOrderId(order.orderId)) return 'in_store'
  if (source === 'bestbuy') {
    if (/in store/i.test(order.channel || '')) return 'in_store'
    if (/^\d{3}-\d{2}-\d{4}-\d{6}$/.test(order.orderId || '')) return 'receipt'
    if (/^BBY/i.test(order.orderId || '')) return 'online'
  }
  if (source === 'amazon') {
    if (order.dataExport) return 'data_export'
    return 'online'
  }
  return 'unknown'
}

function mergeKeyFor(source, order) {
  return (
    order.detailUrl ||
    (source === 'target' && isInstoreOrderId(order.orderId)
      ? `target:in_store:${order.orderId}`
      : `${source}:${order.orderId}`)
  )
}

function coverageWarningsFor(source, summary, order) {
  const w = []
  if (source === 'target' && summary?.coverageWarnings?.length) {
    w.push(...summary.coverageWarnings)
  }
  if (source === 'bestbuy' && summary?.viewsCaptured?.length === 1 && summary.viewsCaptured[0] === 'online') {
    w.push('bestbuy_export_online_only_no_instore_view')
  }
  if (source === 'amazon' && !summary?.harvestSince) {
    w.push('amazon_export_missing_harvestSince_use_year_field')
  }
  if (!order.lineItems?.length) w.push('order_missing_line_items')
  return w
}

function normalizeOrder(source, order, sourceFile, summary) {
  const parserWarnings = []
  const { status, statusRaw } = normalizeStatus(order.status, order.returnInfo)
  const sourceView = inferSourceView(source, order)
  if (!order.sourceView && sourceView === 'unknown') {
    parserWarnings.push('sourceView_inferred_unknown')
  }
  const orderDateIso = parseIsoDate(order.orderDateIso || order.orderDate)
  if (order.orderDate && !orderDateIso) parserWarnings.push('invalid_order_date')
  const merchantTotalCents = parseMoneyCents(order.orderTotal)
  if (order.orderTotal && merchantTotalCents == null) parserWarnings.push('invalid_order_total')
  if (source === 'amazon' && isFalsePositiveReturnInfo(order)) {
    parserWarnings.push('amazon_return_info_false_positive')
  }
  if (order.parserWarnings?.length) parserWarnings.push(...order.parserWarnings)

  const receiptId =
    source === 'target' && isInstoreOrderId(order.orderId)
      ? order.orderId
      : source === 'bestbuy' && /^\d{3}-\d{2}-\d{4}-\d{6}$/.test(order.orderId || '')
        ? order.orderId
        : null

  return {
    source,
    sourceView,
    sourceFile: path.basename(sourceFile),
    sourceOrderId: receiptId ? null : order.orderId || null,
    sourceReceiptId: receiptId,
    mergeKey: mergeKeyFor(source, order),
    orderDate: orderDateIso,
    orderDateRaw: order.rawDateText || order.orderDate || null,
    merchantTotalCents,
    merchantTotalRaw: order.totalRaw || order.orderTotal || null,
    status,
    statusRaw,
    returnInfo: order.returnInfo || null,
    returnEvidenceText: order.returnEvidenceText || null,
    returnInfoRaw: order.returnInfoRaw || null,
    storeName: order.storeName ? redactText(order.storeName) : null,
    storeId: null,
    paymentLast4: null,
    itemCount: (order.lineItems || []).length,
    coverageWarnings: coverageWarningsFor(source, summary, order),
    parserWarnings,
  }
}

function normalizeItem(source, orderNorm, item, lineIndex) {
  const title = item.title ? redactText(item.title) : null
  const titleRaw = item.title || null
  const parserWarnings = []
  if (!title || GENERIC_TITLE_RE.test(title.trim())) parserWarnings.push('generic_or_missing_title')
  if (!item.imageUrl) parserWarnings.push('missing_image')
  if (item.quantity == null || item.quantity < 1) parserWarnings.push('missing_quantity')

  return {
    source,
    mergeKey: orderNorm.mergeKey,
    sourceOrderId: orderNorm.sourceOrderId,
    sourceReceiptId: orderNorm.sourceReceiptId,
    lineIndex,
    title,
    titleRaw: titleRaw ? redactText(titleRaw) : null,
    quantity: item.quantity > 0 ? item.quantity : 1,
    quantityRaw: item.quantityRaw || null,
    imageUrl: item.imageUrl || null,
    imageAlt: item.imageAlt ? redactText(item.imageAlt) : null,
    unitPriceCents: parseMoneyCents(item.price),
    lineTotalCents: null,
    status: item.status || null,
    statusRaw: item.statusRaw || item.status || null,
    productUrl: item.detailUrl || null,
    sku: item.sku || null,
    upc: item.upc || null,
    tcin: item.tcin || null,
    asin: item.asin || null,
    bestbuySku: item.bestbuySku || item.sku || null,
    parserWarnings,
  }
}

function mulberry32(a) {
  return function next() {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededSample(arr, n, seed) {
  const rng = mulberry32(seed)
  const idx = [...arr.keys()]
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx.slice(0, Math.min(n, idx.length)).map((i) => arr[i])
}

function buildMerchantQA(source, sourceFiles, orders, items, warnings) {
  const statusCounts = {}
  const sourceViewCounts = {}
  for (const o of orders) {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
    sourceViewCounts[o.sourceView] = (sourceViewCounts[o.sourceView] || 0) + 1
  }
  const dates = orders.map((o) => o.orderDate).filter(Boolean).sort()
  const dup = (arr) => arr.length - new Set(arr).size
  const mergeKeys = orders.map((o) => o.mergeKey)
  const orderIds = orders.map((o) => o.sourceOrderId).filter(Boolean)
  const receiptIds = orders.map((o) => o.sourceReceiptId).filter(Boolean)

  const collisionBuckets = new Map()
  for (const o of orders) {
    const k = `${o.orderDate}|${o.merchantTotalCents}|${o.storeName || ''}`
    collisionBuckets.set(k, (collisionBuckets.get(k) || 0) + 1)
  }

  const fieldCoverage = {
    orders: {
      sourceOrderId: orders.filter((o) => o.sourceOrderId).length / Math.max(orders.length, 1),
      sourceReceiptId: orders.filter((o) => o.sourceReceiptId).length / Math.max(orders.length, 1),
      mergeKey: orders.filter((o) => o.mergeKey).length / Math.max(orders.length, 1),
      orderDate: orders.filter((o) => o.orderDate).length / Math.max(orders.length, 1),
      total: orders.filter((o) => o.merchantTotalCents != null).length / Math.max(orders.length, 1),
      status: orders.filter((o) => o.status !== 'unknown').length / Math.max(orders.length, 1),
      sourceView: orders.filter((o) => o.sourceView !== 'unknown').length / Math.max(orders.length, 1),
      itemCount: orders.filter((o) => o.itemCount > 0).length / Math.max(orders.length, 1),
    },
    items: {
      title: items.filter((i) => i.title).length / Math.max(items.length, 1),
      imageUrl: items.filter((i) => i.imageUrl).length / Math.max(items.length, 1),
      quantity: items.filter((i) => i.quantity >= 1).length / Math.max(items.length, 1),
      price: items.filter((i) => i.unitPriceCents != null).length / Math.max(items.length, 1),
      productUrl: items.filter((i) => i.productUrl).length / Math.max(items.length, 1),
      skuId: items.filter((i) => i.asin || i.bestbuySku || i.tcin || i.sku).length / Math.max(items.length, 1),
    },
  }

  const warningSamples = {}
  for (const w of warnings.slice(0, 50)) {
    const code = w.code || w.type || 'unknown'
    if (!warningSamples[code]) warningSamples[code] = []
    if (warningSamples[code].length < 50) warningSamples[code].push(w)
  }

  const samples = seededSample(orders, SAMPLE_N, SEED + source.length).map((o) => {
    const oItems = items.filter((i) => i.mergeKey === o.mergeKey)
    return {
      source: o.source,
      sourceView: o.sourceView,
      date: o.orderDate,
      orderId: o.sourceOrderId,
      receiptId: o.sourceReceiptId,
      mergeKey: o.mergeKey,
      total: o.merchantTotalCents,
      status: o.status,
      statusRaw: o.statusRaw,
      itemCount: o.itemCount,
      first5Titles: oItems.slice(0, 5).map((i) => i.title),
      first5Quantities: oItems.slice(0, 5).map((i) => i.quantity),
      first5ImageUrls: oItems.slice(0, 5).map((i) => i.imageUrl || '(missing)'),
      parserWarnings: [...o.parserWarnings, ...o.coverageWarnings],
    }
  })

  return {
    summary: {
      source,
      sourceFiles,
      totalOrders: orders.length,
      totalItems: items.length,
      dateMin: dates[0] || null,
      dateMax: dates[dates.length - 1] || null,
      sourceViewCounts,
      statusCounts,
      returnedCount: orders.filter((o) => /return|refund/.test(o.status)).length,
      cancelledCount: orders.filter((o) => o.status === 'cancelled').length,
      returnInfoCount: orders.filter((o) => o.returnInfo).length,
      falsePositiveReturnInfoCount:
        source === 'amazon' ? orders.filter((o) => isFalsePositiveReturnInfo(o)).length : 0,
      ordersWithItems: orders.filter((o) => o.itemCount > 0).length,
      ordersMissingItems: orders.filter((o) => o.itemCount === 0).length,
      quantityGt1Count: items.filter((i) => i.quantity > 1).length,
      missingTitleCount: items.filter((i) => !i.title).length,
      genericTitleCount: items.filter((i) => i.title && GENERIC_TITLE_RE.test(i.title)).length,
      missingImageCount: items.filter((i) => !i.imageUrl).length,
      missingQuantityCount: items.filter((i) => !i.quantity || i.quantity < 1).length,
      missingTotalCount: orders.filter((o) => o.merchantTotalCents == null).length,
      duplicateSourceOrderIdCount: dup(orderIds),
      duplicateSourceReceiptIdCount: dup(receiptIds),
      duplicateMergeKeyCount: dup(mergeKeys),
      sameDateTotalCollisionCount: [...collisionBuckets.values()].filter((n) => n > 1).length,
    },
    fieldCoverage,
    warningSamples,
    warningCount: warnings.length,
    samples,
  }
}

function collectWarnings(orders, items) {
  const warnings = []
  for (const o of orders) {
    if (!o.sourceView || o.sourceView === 'unknown')
      warnings.push({ code: 'missing_sourceView', mergeKey: o.mergeKey })
    if (!o.orderDate) warnings.push({ code: 'invalid_date', mergeKey: o.mergeKey })
    if (o.merchantTotalCents == null)
      warnings.push({ code: 'missing_total', mergeKey: o.mergeKey })
    if (o.statusRaw && o.status === 'unknown')
      warnings.push({ code: 'status_not_normalized', mergeKey: o.mergeKey, statusRaw: o.statusRaw })
    if (/return|refund/.test(o.status) && o.status === 'purchased')
      warnings.push({ code: 'returned_with_purchase_status', mergeKey: o.mergeKey })
  }
  for (const i of items) {
    if (!i.title) warnings.push({ code: 'missing_title', mergeKey: i.mergeKey, lineIndex: i.lineIndex })
    if (i.title && GENERIC_TITLE_RE.test(i.title))
      warnings.push({ code: 'generic_title', mergeKey: i.mergeKey, title: i.title })
    if (!i.imageUrl) warnings.push({ code: 'missing_image', mergeKey: i.mergeKey })
    if (!i.quantity || i.quantity < 1)
      warnings.push({ code: 'missing_quantity', mergeKey: i.mergeKey })
  }
  const mergeKeys = orders.map((o) => o.mergeKey)
  const seen = new Set()
  for (const k of mergeKeys) {
    if (seen.has(k)) warnings.push({ code: 'duplicate_mergeKey', mergeKey: k })
    seen.add(k)
  }
  return warnings
}

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  try {
    return execSync('security find-generic-password -s "Supabase CLI" -w', {
      encoding: 'utf8',
    }).trim()
  } catch {
    return ''
  }
}

async function runSql(query) {
  const token = getToken()
  if (!token) throw new Error('Missing Supabase access token')
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) },
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`)
  return JSON.parse(text)
}

function writeJsonl(file, rows) {
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''))
}

function inventoryExport(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const orders = raw.orders || []
  let items = 0
  const dates = []
  for (const o of orders) {
    items += (o.lineItems || []).length
    const d = parseIsoDate(o.orderDateIso || o.orderDate)
    if (d) dates.push(d)
  }
  dates.sort()
  return {
    path: filePath,
    basename: path.basename(filePath),
    harvestSince: raw.summary?.harvestSince || raw.summary?.pastYearCutoff || null,
    harvestUntil: raw.summary?.harvestUntil || null,
    viewsCaptured: raw.summary?.viewsCaptured || [],
    hasSourceView: orders.some((o) => o.sourceView),
    orderCount: orders.length,
    itemCount: items,
    dateMin: dates[0] || null,
    dateMax: dates[dates.length - 1] || null,
    mtime: fs.statSync(filePath).mtime.toISOString(),
  }
}

async function exportDb(bundleDir) {
  const dbDir = path.join(bundleDir, 'db_exports')
  mkdirp(dbDir)
  const token = getToken()
  if (!token) {
    fs.writeFileSync(
      path.join(dbDir, 'DB_NOT_EXPORTED.md'),
      `# DB Not Exported\n\nReason: SUPABASE_ACCESS_TOKEN not available (supabase login required).\n\n## Suggested read-only queries\n\n\`\`\`sql\nselect purchase_enrichment->>'source' as source, count(*)\nfrom finance_transactions\nwhere purchase_enrichment->>'source' in ('amazon','bestbuy','target')\ngroup by 1 order by 1;\n\`\`\`\n`,
    )
    return { exported: false, reason: 'missing_token' }
  }

  try {
    const schema = await runSql(`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('finance_transactions', 'finance_user_settings')
      order by table_name, ordinal_position;
    `)
    fs.writeFileSync(path.join(dbDir, 'schema.txt'), JSON.stringify(schema, null, 2))

    const enrichRows = await runSql(`
      select id, user_id, txn_date, coalesce(source_amount, amount) as amount,
             merchant_name, account, source_account_label,
             purchase_enrichment, created_at, updated_at
      from finance_transactions
      where purchase_enrichment->>'source' in ('amazon','bestbuy','target')
      order by txn_date desc;
    `)

    const sanitized = (enrichRows || []).map((r) => ({
      id: r.id,
      user_id: r.user_id ? '[redacted-uuid]' : null,
      txn_date: r.txn_date,
      amount: r.amount,
      merchant_name: r.merchant_name,
      account: r.account,
      source_account_label: r.source_account_label,
      purchase_enrichment: r.purchase_enrichment,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))

    fs.writeFileSync(path.join(dbDir, 'finance_transactions_enrichment.json'), JSON.stringify(sanitized, null, 2))

    const canonicalRows = (enrichRows || []).filter((r) => r.user_id === CANONICAL_USER)
    fs.writeFileSync(
      path.join(dbDir, 'finance_transactions_enrichment_canonical_user.json'),
      JSON.stringify(
        canonicalRows.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          txn_date: r.txn_date,
          amount: r.amount,
          merchant_name: r.merchant_name,
          account: r.account,
          source_account_label: r.source_account_label,
          purchase_enrichment: r.purchase_enrichment,
          created_at: r.created_at,
          updated_at: r.updated_at,
        })),
        null,
        2,
      ),
    )

    const snapshot = await runSql(`
      with enriched as (
        select t.id, t.user_id, t.account, t.txn_date,
               coalesce(t.source_amount, t.amount) as amount,
               t.purchase_enrichment as pe, t.updated_at
        from finance_transactions t
        where t.purchase_enrichment->>'source' in ('amazon','bestbuy','target')
          and t.user_id = '${CANONICAL_USER}'
      )
      select
        count(*) filter (where pe->>'source'='amazon') as amazon_rows,
        count(*) filter (where pe->>'source'='bestbuy') as bestbuy_rows,
        count(*) filter (where pe->>'source'='target') as target_rows,
        count(*) filter (where account='Unknown') as unknown_account,
        count(*) filter (where pe->'returnInfo' is not null) as with_return_info,
        count(*) filter (where jsonb_array_length(coalesce(pe->'lineItems','[]'::jsonb))=0) as missing_item_count,
        count(*) filter (where (pe->>'orderTotal') is null) as missing_total
      from enriched;
    `)
    fs.writeFileSync(path.join(dbDir, 'db_snapshot_summary.json'), JSON.stringify(snapshot[0] || {}, null, 2))

    const summary = {
      rowCount: sanitized.length,
      sourceCounts: {},
      nullOrderId: 0,
      nullMergeKey: 0,
      duplicateOrderIds: {},
      minTxnDate: null,
      maxTxnDate: null,
      minCreatedAt: null,
      maxCreatedAt: null,
    }
    const orderIdKeys = new Map()
    for (const r of sanitized) {
      const src = r.purchase_enrichment?.source || 'unknown'
      summary.sourceCounts[src] = (summary.sourceCounts[src] || 0) + 1
      const oid = r.purchase_enrichment?.orderId
      if (!oid) summary.nullOrderId++
      else {
        const k = `${src}:${oid}`
        orderIdKeys.set(k, (orderIdKeys.get(k) || 0) + 1)
      }
      const td = String(r.txn_date || '').slice(0, 10)
      if (td) {
        if (!summary.minTxnDate || td < summary.minTxnDate) summary.minTxnDate = td
        if (!summary.maxTxnDate || td > summary.maxTxnDate) summary.maxTxnDate = td
      }
      const ca = r.created_at
      if (ca) {
        if (!summary.minCreatedAt || ca < summary.minCreatedAt) summary.minCreatedAt = ca
        if (!summary.maxCreatedAt || ca > summary.maxCreatedAt) summary.maxCreatedAt = ca
      }
    }
    summary.duplicateOrderIds = Object.fromEntries(
      [...orderIdKeys.entries()].filter(([, c]) => c > 1).slice(0, 100),
    )
    fs.writeFileSync(path.join(dbDir, 'finance_transactions_enrichment_summary.json'), JSON.stringify(summary, null, 2))

    const catalog = await runSql(`
      select user_id, merchant_order_catalog, updated_at
      from finance_user_settings
      where merchant_order_catalog is not null
        and merchant_order_catalog != '{}'::jsonb
      limit 5;
    `)
    fs.writeFileSync(
      path.join(dbDir, 'merchant_order_catalog.json'),
      JSON.stringify(
        (catalog || []).map((r) => ({
          user_id: '[redacted-uuid]',
          merchant_order_catalog: r.merchant_order_catalog,
          updated_at: r.updated_at,
        })),
        null,
        2,
      ),
    )

    return { exported: true, rowCount: sanitized.length, summary }
  } catch (e) {
    fs.writeFileSync(
      path.join(dbDir, 'DB_NOT_EXPORTED.md'),
      `# DB Not Exported\n\nReason: ${e.message}\n`,
    )
    return { exported: false, reason: e.message }
  }
}

function titleHash(title) {
  if (!title) return ''
  return String(title).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)
}

function fingerprintFor(source, order) {
  const firstTitle = order.lineItems?.[0]?.title || ''
  return `${source}|${order.orderDate || ''}|${order.merchantTotalCents ?? ''}|${titleHash(firstTitle)}`
}

function reconcile(rawBySource, dbRows) {
  const dbOrders = []
  for (const r of dbRows || []) {
    const e = r.purchase_enrichment
    if (!e?.source || !e?.orderId) continue
    dbOrders.push({
      source: e.source,
      orderId: e.orderId,
      orderDate: e.orderDate,
      orderTotal: e.orderTotal,
      itemCount: e.lineItems?.length || 0,
      status: e.status,
      returnInfo: e.returnInfo,
      mergeKey: e.detailUrl || `${e.source}:${e.orderId}`,
      txnId: r.id,
    })
  }

  const rawFlat = []
  for (const [source, { orders }] of Object.entries(rawBySource)) {
    for (const o of orders) rawFlat.push({ source, ...o })
  }

  const dbByOrderId = new Map()
  const dbByMergeKey = new Map()
  for (const d of dbOrders) {
    dbByOrderId.set(`${d.source}:${d.orderId}`, d)
    dbByMergeKey.set(`${d.source}:${d.mergeKey}`, d)
  }

  const rawNotUploaded = []
  const dbWithoutRaw = []
  const amountMismatches = []
  const dateMismatches = []
  const itemCountMismatches = []
  const statusMismatches = []
  const returnInfoMismatches = []
  const falseAmazonDbRows = []

  for (const raw of rawFlat) {
    const id = raw.sourceOrderId || raw.sourceReceiptId
    const db =
      (id && dbByOrderId.get(`${raw.source}:${id}`)) ||
      dbByMergeKey.get(`${raw.source}:${raw.mergeKey}`) ||
      null
    if (!db) {
      rawNotUploaded.push(raw)
      continue
    }
    const rawTotal = raw.merchantTotalCents
    const dbTotal = db.orderTotal != null ? Math.round(Number(db.orderTotal) * 100) : null
    if (rawTotal != null && dbTotal != null && rawTotal !== dbTotal) {
      amountMismatches.push({
        source: raw.source,
        orderId: id,
        rawTotal,
        dbTotal,
        txnId: db.txnId,
      })
    }
    if (raw.orderDate && db.orderDate && raw.orderDate !== db.orderDate) {
      dateMismatches.push({
        source: raw.source,
        orderId: id,
        rawDate: raw.orderDate,
        dbDate: db.orderDate,
        txnId: db.txnId,
      })
    }
    if (raw.itemCount != null && db.itemCount != null && raw.itemCount !== db.itemCount) {
      itemCountMismatches.push({
        source: raw.source,
        orderId: id,
        rawItemCount: raw.itemCount,
        dbItemCount: db.itemCount,
        txnId: db.txnId,
      })
    }
    if (raw.statusRaw && db.status && raw.status !== db.status) {
      statusMismatches.push({
        source: raw.source,
        orderId: id,
        rawStatus: raw.status,
        dbStatus: db.status,
        txnId: db.txnId,
      })
    }
    const rawRi = raw.returnInfo?.status
    const dbRi = db.returnInfo?.status
    if (rawRi !== dbRi && (rawRi || dbRi)) {
      returnInfoMismatches.push({
        source: raw.source,
        orderId: id,
        rawReturnInfo: raw.returnInfo,
        dbReturnInfo: db.returnInfo,
        txnId: db.txnId,
      })
    }
  }

  const rawKeys = new Set(
    rawFlat.map((o) => `${o.source}:${o.sourceOrderId || o.sourceReceiptId || o.mergeKey}`),
  )
  for (const d of dbOrders) {
    const key = `${d.source}:${d.orderId}`
    if (!rawKeys.has(key) && !rawFlat.some((r) => r.mergeKey === d.mergeKey)) {
      dbWithoutRaw.push(d)
    }
    if (
      d.source === 'amazon' &&
      /deliver|arriv|ship|purchas/i.test(d.status || '') &&
      d.returnInfo?.status &&
      /return|refund|cancel/i.test(d.returnInfo.status)
    ) {
      falseAmazonDbRows.push({
        orderId: d.orderId,
        txnId: d.txnId,
        status: d.status,
        returnInfo: d.returnInfo,
        remediation:
          'Re-link after fixed Amazon export; do not apply until returnInfo verified',
      })
    }
  }

  const dupOrderId = new Map()
  const dupMergeKey = new Map()
  for (const d of dbOrders) {
    const ok = `${d.source}:${d.orderId}`
    dupOrderId.set(ok, (dupOrderId.get(ok) || 0) + 1)
    dupMergeKey.set(d.mergeKey, (dupMergeKey.get(d.mergeKey) || 0) + 1)
  }

  return {
    rawOrdersBySource: Object.fromEntries(
      Object.entries(rawBySource).map(([s, v]) => [s, v.orders.length]),
    ),
    dbEnrichedRowCount: dbOrders.length,
    rawNotUploadedCount: rawNotUploaded.length,
    dbWithoutRawCount: dbWithoutRaw.length,
    duplicateDbSourceOrderIdCount: [...dupOrderId.values()].filter((c) => c > 1).length,
    duplicateDbMergeKeyCount: [...dupMergeKey.values()].filter((c) => c > 1).length,
    amountMismatchCount: amountMismatches.length,
    dateMismatchCount: dateMismatches.length,
    itemCountMismatchCount: itemCountMismatches.length,
    statusMismatchCount: statusMismatches.length,
    returnInfoMismatchCount: returnInfoMismatches.length,
    falseAmazonDbRowCount: falseAmazonDbRows.length,
    rawNotUploadedSamples: rawNotUploaded.slice(0, 50).map((o) => ({
      source: o.source,
      mergeKey: o.mergeKey,
      orderDate: o.orderDate,
      total: o.merchantTotalCents,
    })),
    dbWithoutRawSamples: dbWithoutRaw.slice(0, 50),
    amountMismatchSamples: amountMismatches.slice(0, 50),
    dateMismatchSamples: dateMismatches.slice(0, 50),
    itemCountMismatchSamples: itemCountMismatches.slice(0, 50),
    statusMismatchSamples: statusMismatches.slice(0, 50),
    returnInfoMismatchSamples: returnInfoMismatches.slice(0, 50),
    falseAmazonDbRows,
    dbComparisonSkipped: !dbRows?.length,
  }
}

function crossMerchantMd(qa) {
  const lines = ['# Cross-Merchant Consistency\n']
  const fields = [
    ['orderDate canonical', qa.amazon?.summary?.dateMin ? 'yes' : 'partial', qa.bestbuy?.summary?.dateMin ? 'yes' : 'partial', qa.target?.summary?.dateMin ? 'yes' : 'yes', 'ISO YYYY-MM-DD + rawDate', ''],
    ['sourceView', 'sparse', qa.bestbuy?.summary?.sourceViewCounts?.online ? 'online only' : 'partial', JSON.stringify(qa.target?.summary?.sourceViewCounts || {}), 'online|in_store|receipt|data_export', 'bestbuy in-store coverage'],
    ['mergeKey', 'detailUrl/orderId', 'detailUrl/orderId', 'detailUrl/receiptId', 'source-prefixed stable key', ''],
    ['quantity parsing', 'from export', 'mostly 1', 'badge in alt', 'quantityRaw preserved', ''],
    ['return status', 'returnInfo', 'returnInfo', 'returned normalized', 'status + statusRaw', ''],
  ]
  lines.push('| field | amazon | bestbuy | target | canonical recommendation | blocker? |')
  lines.push('|-------|--------|---------|--------|------------------------|----------|')
  for (const row of fields) {
    lines.push(`| ${row.join(' | ')} |`)
  }
  return lines.join('\n')
}

async function main() {
  const ts = argVal('--bundle-dir') || path.join(DATA_ROOT, `merchant-order-audit-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').slice(0, 13)}`)
  const bundleDir = path.isAbsolute(ts) ? ts : path.join(DATA_ROOT, ts)
  mkdirp(bundleDir)

  const commandsRun = []
  const filesIncluded = []

  // Phase 1 — scripts snapshot
  const snapDir = path.join(bundleDir, 'scripts_snapshot')
  mkdirp(snapDir)
  const manifestEntries = []
  for (const [rel, role] of SCRIPT_PATHS) {
    const abs = path.join(REPO_ROOT, rel)
    const exists = fs.existsSync(abs)
    let entry = { path: rel, exists, role }
    if (exists) {
      const dest = path.join(snapDir, rel)
      copyFile(abs, dest)
      const st = fs.statSync(abs)
      entry = {
        ...entry,
        sha256: sha256File(abs),
        lineCount: fs.readFileSync(abs, 'utf8').split('\n').length,
        lastModified: st.mtime.toISOString(),
      }
      filesIncluded.push(dest)
    }
    manifestEntries.push(entry)
  }
  const manifestPath = path.join(bundleDir, 'scripts_snapshot_manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), files: manifestEntries }, null, 2))

  // Phase 2 — export inventory
  const findOut = execSync(
    `find tools apps -type f \\( -name "*amazon*orders*.json" -o -name "*bestbuy*orders*.json" -o -name "*target*orders*.json" -o -name "*purchase*enrichment*.json" \\) -print 2>/dev/null | sort`,
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  fs.writeFileSync(path.join(bundleDir, '10_export_file_inventory.txt'), findOut)
  commandsRun.push('find tools apps ... orders*.json')

  const merchants = {
    amazon: resolveOrdersRawPath(path.join(DATA_ROOT, 'amazon-export'), 'amazon'),
    bestbuy: resolveOrdersRawPath(path.join(DATA_ROOT, 'bestbuy-export'), 'bestbuy'),
    target: resolveOrdersRawPath(path.join(DATA_ROOT, 'target-export'), 'target'),
  }

  const exportInventory = {}
  const rawDir = path.join(bundleDir, 'raw_exports')
  mkdirp(rawDir)
  for (const [source, filePath] of Object.entries(merchants)) {
    if (!filePath || !fs.existsSync(filePath)) {
      exportInventory[source] = { error: 'not_found' }
      continue
    }
    const inv = inventoryExport(filePath)
    exportInventory[source] = inv
    const dest = path.join(rawDir, path.basename(filePath))
    copyFile(filePath, dest)
    filesIncluded.push(dest)
  }
  fs.writeFileSync(path.join(bundleDir, '10_export_inventory.json'), JSON.stringify(exportInventory, null, 2))

  // Phase 3 — normalize
  const normDir = path.join(bundleDir, 'normalized')
  mkdirp(normDir)
  const allOrders = []
  const allItems = []
  const rawBySource = {}
  const qaDir = path.join(bundleDir, 'qa')
  mkdirp(qaDir)

  for (const [source, filePath] of Object.entries(merchants)) {
    if (!filePath || !fs.existsSync(filePath)) continue
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const orders = []
    const items = []
    for (const o of raw.orders || []) {
      const norm = normalizeOrder(source, o, filePath, raw.summary)
      orders.push(norm)
      for (let i = 0; i < (o.lineItems || []).length; i++) {
        items.push(normalizeItem(source, norm, o.lineItems[i], i))
      }
    }
    rawBySource[source] = { orders, items, filePath }
    allOrders.push(...orders)
    allItems.push(...items)
    writeJsonl(path.join(normDir, `${source}.orders.jsonl`), orders)
    writeJsonl(path.join(normDir, `${source}.items.jsonl`), items)

    const warnings = collectWarnings(orders, items)
    const qa = buildMerchantQA(source, [path.basename(filePath)], orders, items, warnings)
    fs.writeFileSync(path.join(qaDir, `${source}.qa.json`), JSON.stringify(qa, null, 2))
    fs.writeFileSync(path.join(qaDir, `${source}.sample.json`), JSON.stringify(qa.samples, null, 2))
  }

  writeJsonl(path.join(normDir, 'all.orders.jsonl'), allOrders)
  writeJsonl(path.join(normDir, 'all.items.jsonl'), allItems)

  const qaAll = {
    generatedAt: new Date().toISOString(),
    merchants: Object.keys(rawBySource),
    totalOrders: allOrders.length,
    totalItems: allItems.length,
    perSource: Object.fromEntries(
      Object.entries(rawBySource).map(([s, v]) => [s, { orders: v.orders.length, items: v.items.length }]),
    ),
  }
  fs.writeFileSync(path.join(qaDir, 'all_merchants_consistency.qa.json'), JSON.stringify(qaAll, null, 2))

  const perMerchantQa = {}
  for (const s of ['amazon', 'bestbuy', 'target']) {
    const p = path.join(qaDir, `${s}.qa.json`)
    if (fs.existsSync(p)) perMerchantQa[s] = JSON.parse(fs.readFileSync(p, 'utf8'))
  }
  fs.writeFileSync(path.join(qaDir, 'all_merchants_consistency.md'), crossMerchantMd(perMerchantQa))
  fs.writeFileSync(path.join(qaDir, 'cross_merchant_consistency.md'), fs.readFileSync(path.join(qaDir, 'all_merchants_consistency.md')))

  // Phase 6 — DB
  const dbResult = await exportDb(bundleDir)
  commandsRun.push('supabase read-only SELECT finance_transactions.purchase_enrichment')

  // Phase 7 — reconciliation
  let dbRows = []
  const dbJson = path.join(bundleDir, 'db_exports/finance_transactions_enrichment.json')
  if (fs.existsSync(dbJson)) dbRows = JSON.parse(fs.readFileSync(dbJson, 'utf8'))
  const recon = reconcile(rawBySource, dbRows)
  fs.writeFileSync(path.join(qaDir, 'upload_vs_raw_reconciliation.json'), JSON.stringify(recon, null, 2))
  fs.writeFileSync(
    path.join(qaDir, 'upload_vs_raw_reconciliation.md'),
    `# Upload vs Raw Reconciliation\n\n${JSON.stringify(recon, null, 2)}\n`,
  )

  let dbRowsFull = []
  const dbCanonicalPath = path.join(bundleDir, 'db_exports/finance_transactions_enrichment_canonical_user.json')
  if (fs.existsSync(dbCanonicalPath)) {
    dbRowsFull = JSON.parse(fs.readFileSync(dbCanonicalPath, 'utf8'))
  }

  const enhancedRecon = buildEnhancedReconciliation(rawBySource, dbRowsFull, recon)
  const readModel = buildReadModelV1(dbRowsFull, rawBySource)
  const qualityReport = buildQualityReport(readModel, enhancedRecon, exportInventory)
  writeReadModelBundle(bundleDir, readModel, enhancedRecon, qualityReport, exportInventory)
  const spotCheck = spotCheckSamples(readModel)
  fs.writeFileSync(path.join(bundleDir, 'read_model', 'spot_check_samples.json'), JSON.stringify(spotCheck, null, 2))
  commandsRun.push('buildReadModelV1 (read-only, no apply)')

  // Phase 8 — manifest + zip
  const gitHead = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  const gitStatus = execSync('git status --short', { cwd: REPO_ROOT, encoding: 'utf8' }).trim()

  function walk(dir) {
    const out = []
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) out.push(...walk(p))
      else out.push(p)
    }
    return out
  }

  const allFiles = walk(bundleDir).filter((f) => !f.endsWith('manifest.json') && !f.endsWith('.zip'))
  const fileHashes = allFiles.map((f) => ({
    path: path.relative(bundleDir, f),
    sha256: sha256File(f),
    bytes: fs.statSync(f).size,
  }))

  const manifest = {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    gitHead,
    gitStatusShort: gitStatus,
    commandsRun,
    rawExportFiles: exportInventory,
    normalizedFiles: ['normalized/amazon.orders.jsonl', 'normalized/bestbuy.orders.jsonl', 'normalized/target.orders.jsonl', 'normalized/all.orders.jsonl', 'normalized/all.items.jsonl'],
    qaFiles: walk(qaDir).map((f) => path.relative(bundleDir, f)),
    readModelFiles: walk(path.join(bundleDir, 'read_model')).map((f) => path.relative(bundleDir, f)),
    reconciliationFiles: walk(path.join(bundleDir, 'reconciliation')).map((f) => path.relative(bundleDir, f)),
    dbExport: dbResult,
    readModelStats: readModel.stats,
    spotCheckCounts: { clean: spotCheck.cleanSamples.length, review: spotCheck.reviewSamples.length },
    fileHashes,
    knownLimitations: [
      'Amazon export may lack harvestSince/harvestUntil; year-based window assumed.',
      'Best Buy export viewsCaptured may be online-only; in-store/receipt coverage not guaranteed.',
      'Target in-store depends on account association; empty in_store is a coverage signal.',
      'DB enrichment lives on finance_transactions.purchase_enrichment JSONB, not a separate table.',
      'user_id redacted in DB exports.',
    ],
    confirmations: {
      noDbWrites: true,
      noMigrations: true,
      noLinkApply: true,
      noDataDeletion: true,
      unrelatedFilesUntouched: true,
    },
  }
  fs.writeFileSync(path.join(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  const zipPath = `${bundleDir}.zip`
  execSync(`cd "${path.dirname(bundleDir)}" && zip -r "${path.basename(zipPath)}" "${path.basename(bundleDir)}"`, {
    stdio: 'pipe',
  })

  console.log(
    JSON.stringify(
      {
        bundleDir,
        zipPath,
        manifest: {
          totalOrders: allOrders.length,
          totalItems: allItems.length,
          perSource: qaAll.perSource,
          dbResult,
          readModelStats: readModel.stats,
          qualityOverall: qualityReport.overallScore,
        },
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error('FATAL', e.message)
  process.exit(1)
})
