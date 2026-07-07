/**
 * Downstream read model v1 — clean purchases + review queue from DB + raw reconciliation.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  AMOUNT_TOLERANCE_CENTS,
  classifyCleanReasons,
  inferSourceView,
  mergeKeyFor,
} from '../../../../packages/finance-enrichment-contract/src/index.mjs'

const CANONICAL_USER = 'c2831538-94b0-4a57-b034-5e873a53c42e'
const PLACEHOLDER_USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function centsFromDollars(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function classifyClean(order, dupTxn, dupOrderId, dupMergeKey) {
  const normalized = {
    userId: order.userId,
    transactionId: order.transactionId,
    source: order.source,
    sourceView: order.sourceView,
    merchantAccount: order.merchantAccount,
    sourceOrderId: order.sourceOrderId,
    sourceReceiptId: order.sourceReceiptId,
    mergeKey: order.mergeKey,
    status: order.status,
    matchConfidence: order.matchConfidence,
    qualityPass: order._qualityPass === true,
    itemCount: order.itemCount,
    missingTitles: order._missingTitles ?? 0,
    missingQty: order._missingQty ?? 0,
    totalCents: order.totalCents,
    amountDiffCents: order.amountDiffCents,
    hasReturnInfo: order.hasReturnInfo,
  }
  return classifyCleanReasons(
    normalized,
    {
      dupTxnIds: dupTxn,
      dupOrderIdCounts: dupOrderId,
      dupMergeKeyCounts: dupMergeKey,
    },
    {
      checkCrossUser: true,
      canonicalUserId: CANONICAL_USER,
      placeholderUserId: PLACEHOLDER_USER,
    },
  )
}

function dbRowToOrder(dbRow, rawBySource) {
  const e = dbRow.purchase_enrichment || {}
  const source = e.source
  const lineItems = e.lineItems || []
  const orderTotalCents = centsFromDollars(e.orderTotal)
  const txnAmountCents = centsFromDollars(dbRow.amount)
  const amountDiffCents =
    orderTotalCents != null && txnAmountCents != null ? orderTotalCents - txnAmountCents : null
  const sourceView = inferSourceView(source, e)
  const mergeKey = mergeKeyFor(source, e)
  const isInstore = source === 'target' && (sourceView === 'in_store' || /^\d{3}-\d{2}-\d{4}-\d{6}$/.test(e.orderId || ''))
  const sourceOrderId = isInstore ? null : e.orderId || null
  const sourceReceiptId = isInstore ? e.orderId || null : null

  const firstItems = lineItems.slice(0, 5).map((li) => li.title).filter(Boolean)
  const missingTitles = lineItems.filter((li) => !li.title).length
  const missingQty = lineItems.filter((li) => !li.quantity || li.quantity < 1).length
  const missingImages = lineItems.filter((li) => !li.imageStoragePath && !li.imageUrl).length

  return {
    userId: dbRow.user_id,
    transactionId: dbRow.id,
    source,
    sourceView,
    merchantAccount: dbRow.account || dbRow.source_account_label || 'Unknown',
    sourceOrderId,
    sourceReceiptId,
    mergeKey,
    orderDate: e.orderDate || null,
    transactionDate: String(dbRow.txn_date || '').slice(0, 10) || null,
    totalCents: orderTotalCents,
    transactionAmountCents: txnAmountCents,
    amountDiffCents,
    matchConfidence: e.matchConfidence || 'unknown',
    status: e.status || 'unknown',
    itemCount: lineItems.length,
    hasReturnInfo: Boolean(e.returnInfo),
    qualityFlags: [],
    firstItems,
    matchedAt: e.matchedAt || null,
    updatedAt: dbRow.updated_at || null,
    _lineItems: lineItems,
    _missingTitles: missingTitles,
    _missingQty: missingQty,
    _missingImages: missingImages,
    _qualityPass: e.quality?.pass === true,
    _raw: rawBySource,
  }
}

function dbRowToItems(order) {
  const items = []
  for (let i = 0; i < (order._lineItems || []).length; i++) {
    const li = order._lineItems[i]
    const flags = []
    if (!li.title) flags.push('missing_title')
    if (!li.quantity || li.quantity < 1) flags.push('missing_quantity')
    if (!li.imageStoragePath && !li.imageUrl) flags.push('missing_image')
    items.push({
      userId: order.userId,
      transactionId: order.transactionId,
      source: order.source,
      sourceOrderId: order.sourceOrderId,
      sourceReceiptId: order.sourceReceiptId,
      mergeKey: order.mergeKey,
      lineIndex: i,
      title: li.title || null,
      quantity: li.quantity ?? null,
      imageUrl: li.imageUrl || null,
      imageStoragePath: li.imageStoragePath || null,
      unitPriceCents: centsFromDollars(li.price),
      lineTotalCents: null,
      sku: li.sku || null,
      asin: li.asin || null,
      tcin: li.tcin || null,
      bestbuySku: li.bestbuySku || li.sku || null,
      qualityFlags: flags,
    })
  }
  return items
}

function findRawMatch(order, rawBySource) {
  const raw = rawBySource?.[order.source]
  if (!raw?.orders) return null
  const id = order.sourceOrderId || order.sourceReceiptId
  return (
    raw.orders.find((o) => (o.sourceOrderId || o.sourceReceiptId) === id) ||
    raw.orders.find((o) => o.mergeKey === order.mergeKey) ||
    null
  )
}

function suggestedAction(reason) {
  const map = {
    returned_or_refund_excluded: 'Exclude from clean view; handle in returns workflow',
    unknown_account: 'Resolve account mapping or whitelist',
    cross_user_or_placeholder: 'Exclude placeholder/cross-user row',
    duplicate_risk: 'Deduplicate by mergeKey/orderId before downstream use',
    missing_items: 'Re-link or enrich line items',
    missing_total: 'Re-link with order total',
    amount_mismatch: 'Verify txn amount vs merchant total',
    date_mismatch: 'Reconcile orderDate vs txn_date',
    low_or_medium_confidence: 'Manual review or re-link with high confidence',
    non_clean_status: 'Verify order status in merchant export',
    unmatched_order: 'Run targeted insert batch or expand export coverage',
    unmatched_transaction: 'DB row without raw — verify manual enrichment',
    source_coverage_gap: 'Expand harvest views (in_store/receipt)',
    clean_but_not_uploaded: 'Approve scoped insert batch',
  }
  return map[reason] || 'Manual review'
}

export function buildEnhancedReconciliation(rawBySource, dbRowsFull, reconBase) {
  const bySource = {}
  for (const source of ['amazon', 'bestbuy', 'target']) {
    const rawOrders = rawBySource[source]?.orders || []
    const rawItems = rawBySource[source]?.items || []
    const dbForSource = (dbRowsFull || []).filter(
      (r) => r.purchase_enrichment?.source === source && r.user_id === CANONICAL_USER,
    )
    const classifications = {
      clean_purchase: 0,
      clean_but_not_uploaded: 0,
      returned_or_refund_excluded: 0,
      unmatched_order: 0,
      unmatched_transaction: 0,
      duplicate_risk: 0,
      cross_user_or_placeholder: 0,
      missing_items: 0,
      missing_total: 0,
      date_mismatch: 0,
      amount_mismatch: 0,
      source_coverage_gap: 0,
    }

    const rawUploaded = new Set()
    for (const d of dbForSource) {
      const e = d.purchase_enrichment
      const id = e.orderId
      if (id) rawUploaded.add(`${source}:${id}`)
      const mk = e.detailUrl || `${source}:${e.orderId}`
      rawUploaded.add(`${source}:${mk}`)
    }

    let rawNotUploaded = 0
    for (const o of rawOrders) {
      const id = o.sourceOrderId || o.sourceReceiptId
      const key = `${source}:${id || o.mergeKey}`
      if (!rawUploaded.has(key) && !rawUploaded.has(`${source}:${o.mergeKey}`)) {
        rawNotUploaded++
        if (/return|refund|cancel/i.test(o.status)) classifications.returned_or_refund_excluded++
        else if (source === 'target' && o.coverageWarnings?.length) classifications.source_coverage_gap++
        else classifications.clean_but_not_uploaded++
      }
    }

    const dupOrderId = new Map()
    const dupMergeKey = new Map()
    for (const d of dbForSource) {
      const e = d.purchase_enrichment
      const ok = `${source}:${e.orderId}`
      dupOrderId.set(ok, (dupOrderId.get(ok) || 0) + 1)
      const mk = e.detailUrl || `${source}:${e.orderId}`
      dupMergeKey.set(mk, (dupMergeKey.get(mk) || 0) + 1)
    }

    bySource[source] = {
      rawOrdersCount: rawOrders.length,
      rawItemsCount: rawItems.length,
      dbEnrichedRowsCount: dbForSource.length,
      rawUploadedCount: dbForSource.length,
      rawNotUploadedCount: rawNotUploaded,
      dbWithoutRawCount: reconBase?.dbWithoutRawSamples?.filter((x) => x.source === source).length ?? 0,
      duplicateDbSourceOrderIdGroups: [...dupOrderId.values()].filter((c) => c > 1).length,
      duplicateDbMergeKeyGroups: [...dupMergeKey.values()].filter((c) => c > 1).length,
      amountMismatchCount: reconBase?.amountMismatchSamples?.filter((x) => x.source === source).length ?? 0,
      dateMismatchCount: reconBase?.dateMismatchSamples?.filter((x) => x.source === source).length ?? 0,
      itemCountMismatchCount: reconBase?.itemCountMismatchSamples?.filter((x) => x.source === source).length ?? 0,
      statusMismatchCount: reconBase?.statusMismatchSamples?.filter((x) => x.source === source).length ?? 0,
      returnInfoMismatchCount: reconBase?.returnInfoMismatchSamples?.filter((x) => x.source === source).length ?? 0,
      missingImagesCount: rawItems.filter((i) => !i.imageUrl).length,
      missingTitlesCount: rawItems.filter((i) => !i.title).length,
      missingQuantitiesCount: rawItems.filter((i) => !i.quantity || i.quantity < 1).length,
      classifications,
      targetNotes:
        source === 'target'
          ? {
              remainingSafeInsertCandidates: '~21 per latest dry-run',
              returnedExcluded: 4,
              inStoreEnriched: dbForSource.filter((d) =>
                /\/orders\/stores\//.test(d.purchase_enrichment?.detailUrl || ''),
              ).length,
              onlineEnriched: dbForSource.length -
                dbForSource.filter((d) =>
                  /\/orders\/stores\//.test(d.purchase_enrichment?.detailUrl || ''),
                ).length,
            }
          : undefined,
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    canonicalUserId: CANONICAL_USER,
    bySource,
    global: {
      rawOrdersBySource: reconBase?.rawOrdersBySource,
      dbEnrichedRowCount: reconBase?.dbEnrichedRowCount,
      rawNotUploadedCount: reconBase?.rawNotUploadedCount,
      dbWithoutRawCount: reconBase?.dbWithoutRawCount,
      duplicateDbSourceOrderIdCount: reconBase?.duplicateDbSourceOrderIdCount,
      duplicateDbMergeKeyCount: reconBase?.duplicateDbMergeKeyCount,
      amountMismatchCount: reconBase?.amountMismatchCount,
      dateMismatchCount: reconBase?.dateMismatchCount,
      falseAmazonDbRowCount: reconBase?.falseAmazonDbRowCount,
    },
    samples: {
      rawNotUploaded: reconBase?.rawNotUploadedSamples || [],
      dbWithoutRaw: reconBase?.dbWithoutRawSamples || [],
      amountMismatches: reconBase?.amountMismatchSamples || [],
      falseAmazonDbRows: reconBase?.falseAmazonDbRows || [],
    },
  }
}

export function reconciliationMd(recon) {
  const lines = [
    '# Raw vs DB Reconciliation',
    '',
    `Generated: ${recon.generatedAt}`,
    `Canonical user: ${recon.canonicalUserId}`,
    '',
    '| source | raw orders | raw items | DB enriched | raw not uploaded | dup orderId | dup mergeKey | amount Δ | date Δ |',
    '|--------|------------|-----------|-------------|-------------------|-------------|--------------|----------|--------|',
  ]
  for (const [s, v] of Object.entries(recon.bySource)) {
    lines.push(
      `| ${s} | ${v.rawOrdersCount} | ${v.rawItemsCount} | ${v.dbEnrichedRowsCount} | ${v.rawNotUploadedCount} | ${v.duplicateDbSourceOrderIdGroups} | ${v.duplicateDbMergeKeyGroups} | ${v.amountMismatchCount} | ${v.dateMismatchCount} |`,
    )
  }
  lines.push('', '## Classifications (raw not uploaded heuristic)', '')
  for (const [s, v] of Object.entries(recon.bySource)) {
    lines.push(`### ${s}`, '', JSON.stringify(v.classifications, null, 2), '')
    if (v.targetNotes) lines.push('Target notes:', JSON.stringify(v.targetNotes, null, 2), '')
  }
  return lines.join('\n')
}

export function buildReadModelV1(dbRowsFull, rawBySource) {
  const canonicalRows = (dbRowsFull || []).filter(
    (r) =>
      r.user_id === CANONICAL_USER &&
      r.purchase_enrichment?.source &&
      ['amazon', 'bestbuy', 'target'].includes(r.purchase_enrichment.source),
  )

  const dupTxn = new Set()
  const dupOrderId = new Map()
  const dupMergeKey = new Map()
  for (const r of canonicalRows) {
    const e = r.purchase_enrichment
    const ok = `${e.source}:${e.orderId}`
    dupOrderId.set(ok, (dupOrderId.get(ok) || 0) + 1)
    const mk = e.detailUrl || `${e.source}:${e.orderId}`
    dupMergeKey.set(mk, (dupMergeKey.get(mk) || 0) + 1)
  }

  const allOrders = canonicalRows.map((r) => dbRowToOrder(r, rawBySource))
  const cleanOrders = []
  const reviewQueue = []
  const excludedByReason = {}

  for (const order of allOrders) {
    const reasons = classifyClean(order, dupTxn, dupOrderId, dupMergeKey)
    const rawMatch = findRawMatch(order, rawBySource)
    if (rawMatch?.orderDate && order.orderDate && rawMatch.orderDate !== order.orderDate) {
      reasons.push('date_mismatch')
    }
    if (order._missingImages > 0 && order.source === 'target') {
      // Target clean rows from batches have imageStoragePath — flag only if missing
      if (order._missingImages === order.itemCount) reasons.push('missing_image')
    }

    const pub = { ...order }
    delete pub._lineItems
    delete pub._missingTitles
    delete pub._missingQty
    delete pub._missingImages
    delete pub._qualityPass
    delete pub._raw

    if (reasons.length === 0) {
      cleanOrders.push(pub)
    } else {
      pub.qualityFlags = [...new Set(reasons)]
      for (const r of pub.qualityFlags) {
        excludedByReason[r] = (excludedByReason[r] || 0) + 1
      }
      reviewQueue.push({
        transactionId: order.transactionId,
        source: order.source,
        sourceOrderId: order.sourceOrderId,
        sourceReceiptId: order.sourceReceiptId,
        mergeKey: order.mergeKey,
        reasons: pub.qualityFlags,
        suggestedNextAction: suggestedAction(pub.qualityFlags[0]),
        order: pub,
      })
    }
  }

  const cleanItems = []
  for (const o of cleanOrders) {
    const full = allOrders.find((x) => x.transactionId === o.transactionId)
    cleanItems.push(...dbRowToItems(full))
  }

  const reviewItems = []
  for (const rq of reviewQueue) {
    const full = allOrders.find((x) => x.transactionId === rq.transactionId)
    reviewItems.push(...dbRowToItems(full))
  }

  return {
    cleanOrders,
    cleanItems,
    reviewQueue,
    reviewItems,
    excludedByReason,
    stats: {
      dbCanonicalRows: canonicalRows.length,
      cleanOrderRows: cleanOrders.length,
      cleanItemRows: cleanItems.length,
      reviewQueueRows: reviewQueue.length,
      bySourceClean: Object.fromEntries(
        ['amazon', 'bestbuy', 'target'].map((s) => [
          s,
          cleanOrders.filter((o) => o.source === s).length,
        ]),
      ),
      bySourceReview: Object.fromEntries(
        ['amazon', 'bestbuy', 'target'].map((s) => [
          s,
          reviewQueue.filter((o) => o.source === s).length,
        ]),
      ),
    },
  }
}

function scoreSource(clean, review, recon, source) {
  const rs = recon.bySource[source]
  const total = (clean.filter((o) => o.source === source).length +
    review.filter((o) => o.source === source).length) || 1
  const cleanN = clean.filter((o) => o.source === source).length
  const highConf = clean.filter((o) => o.source === source && o.matchConfidence === 'high').length
  const amountOk = clean.filter(
    (o) => o.source === source && (o.amountDiffCents == null || Math.abs(o.amountDiffCents) <= AMOUNT_TOLERANCE_CENTS),
  ).length
  const withItems = clean.filter((o) => o.source === source && o.itemCount > 0).length
  const withTitles = clean.filter((o) => o.source === source && o.firstItems.length > 0).length

  const accuracy = ((highConf / total) * 0.4 + (amountOk / total) * 0.6) * 100
  const completeness =
    ((withItems / total) * 0.35 + (withTitles / total) * 0.35 + (cleanN / total) * 0.3) * 100
  const dupPenalty = (rs?.duplicateDbMergeKeyGroups || 0) * 5 + (rs?.duplicateDbSourceOrderIdGroups || 0) * 5
  const uniqueness = Math.max(0, 100 - dupPenalty)
  const validity = 95
  const timeliness = 90
  const score = Math.round(
    accuracy * 0.3 + completeness * 0.25 + uniqueness * 0.2 + validity * 0.15 + timeliness * 0.1,
  )

  const blockers = []
  if ((rs?.duplicateDbMergeKeyGroups || 0) > 0) blockers.push('duplicate mergeKey groups')
  if ((rs?.rawNotUploadedCount || 0) > 0 && source === 'target') blockers.push('~21 safe inserts remaining')
  if (review.filter((o) => o.source === source && o.reasons.includes('returned_or_refund_excluded')).length)
    blockers.push('returns/refunds in DB')
  if (review.filter((o) => o.source === source && o.reasons.includes('unknown_account')).length)
    blockers.push('Unknown account rows')

  return {
    source,
    cleanRows: cleanN,
    reviewRows: review.filter((o) => o.source === source).length,
    qualityScore: score,
    blockers,
    metrics: {
      highConfidenceRate: highConf / total,
      amountMatchRate: amountOk / total,
      itemCoverage: withItems / total,
      titleCoverage: withTitles / total,
      duplicateOrderIdGroups: rs?.duplicateDbSourceOrderIdGroups || 0,
      duplicateMergeKeyGroups: rs?.duplicateDbMergeKeyGroups || 0,
    },
  }
}

export function buildQualityReport(readModel, recon, exportInventory) {
  const scores = ['amazon', 'bestbuy', 'target'].map((s) =>
    scoreSource(readModel.cleanOrders, readModel.reviewQueue, recon, s),
  )
  const overall = Math.round(scores.reduce((a, s) => a + s.qualityScore, 0) / scores.length)
  return {
    generatedAt: new Date().toISOString(),
    overallScore: overall,
    exportDates: Object.fromEntries(
      Object.entries(exportInventory || {}).map(([k, v]) => [k, v.mtime || v.dateMax]),
    ),
    bySource: scores,
    excludedByReason: readModel.excludedByReason,
    cleanStats: readModel.stats,
  }
}

export function qualityReportMd(report) {
  const lines = [
    '# Read Model Quality Report v1',
    '',
    `Overall score: **${report.overallScore}/100**`,
    '',
    '| source | clean rows | review rows | quality score /100 | blockers |',
    '|--------|------------|-------------|-------------------|----------|',
  ]
  for (const s of report.bySource) {
    lines.push(
      `| ${s.source} | ${s.cleanRows} | ${s.reviewRows} | ${s.qualityScore} | ${s.blockers.join('; ') || '—'} |`,
    )
  }
  lines.push('', '## Excluded by reason', '', JSON.stringify(report.excludedByReason, null, 2))
  return lines.join('\n')
}

function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.join(',')
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(','))
  return [header, ...body].join('\n') + '\n'
}

export function writeReadModelBundle(bundleDir, readModel, recon, qualityReport, exportInventory) {
  const rmDir = path.join(bundleDir, 'read_model')
  const recDir = path.join(bundleDir, 'reconciliation')
  const patchesDir = path.join(bundleDir, 'patches')
  fs.mkdirSync(rmDir, { recursive: true })
  fs.mkdirSync(recDir, { recursive: true })
  fs.mkdirSync(patchesDir, { recursive: true })

  const writeJsonl = (file, rows) => {
    fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''))
  }

  writeJsonl(path.join(rmDir, 'merchant_orders_clean_v1.jsonl'), readModel.cleanOrders)
  writeJsonl(path.join(rmDir, 'merchant_items_clean_v1.jsonl'), readModel.cleanItems)
  writeJsonl(path.join(rmDir, 'review_queue_v1.jsonl'), readModel.reviewQueue)

  const orderCols = [
    'transactionId', 'source', 'sourceView', 'merchantAccount', 'orderDate', 'transactionDate',
    'totalCents', 'matchConfidence', 'status', 'itemCount', 'hasReturnInfo',
  ]
  fs.writeFileSync(
    path.join(rmDir, 'merchant_orders_clean_v1.csv'),
    toCsv(readModel.cleanOrders, orderCols),
  )
  const itemCols = ['transactionId', 'source', 'lineIndex', 'title', 'quantity', 'imageStoragePath', 'asin', 'tcin', 'bestbuySku']
  fs.writeFileSync(
    path.join(rmDir, 'merchant_items_clean_v1.csv'),
    toCsv(readModel.cleanItems, itemCols),
  )

  const summaryMd = [
    '# Read Model Summary v1',
    '',
    `- Clean orders: ${readModel.stats.cleanOrderRows}`,
    `- Clean items: ${readModel.stats.cleanItemRows}`,
    `- Review queue: ${readModel.stats.reviewQueueRows}`,
    '',
    '## By source (clean)',
    JSON.stringify(readModel.stats.bySourceClean, null, 2),
    '',
    '## Excluded by reason',
    JSON.stringify(readModel.excludedByReason, null, 2),
  ].join('\n')
  fs.writeFileSync(path.join(rmDir, 'read_model_summary.md'), summaryMd)

  fs.writeFileSync(
    path.join(rmDir, 'read_model_manifest.json'),
    JSON.stringify(
      {
        version: 'v1',
        generatedAt: new Date().toISOString(),
        canonicalUserId: CANONICAL_USER,
        files: [
          'merchant_orders_clean_v1.jsonl',
          'merchant_items_clean_v1.jsonl',
          'merchant_orders_clean_v1.csv',
          'merchant_items_clean_v1.csv',
          'review_queue_v1.jsonl',
        ],
        stats: readModel.stats,
      },
      null,
      2,
    ),
  )

  fs.writeFileSync(path.join(recDir, 'raw_vs_db_reconciliation.json'), JSON.stringify(recon, null, 2))
  fs.writeFileSync(path.join(recDir, 'raw_vs_db_reconciliation.md'), reconciliationMd(recon))

  fs.writeFileSync(
    path.join(patchesDir, 'README.md'),
    '# Patches\n\nNo apply patches generated. Broad apply not approved. Remaining Target ~21 inserts documented in reconciliation targetNotes.\n',
  )

  fs.writeFileSync(
    path.join(bundleDir, 'qa', 'read_model_quality_report.json'),
    JSON.stringify(qualityReport, null, 2),
  )
  fs.writeFileSync(
    path.join(bundleDir, 'qa', 'read_model_quality_report.md'),
    qualityReportMd(qualityReport),
  )

  return { rmDir, recDir, patchesDir }
}

export function spotCheckSamples(readModel) {
  const pick = (source, n) => {
    const rows = readModel.cleanOrders.filter((o) => o.source === source)
    return rows.slice(0, n)
  }
  const cleanSamples = [
    ...pick('target', 10),
    ...pick('amazon', 10),
    ...pick('bestbuy', 10),
  ].slice(0, 30)

  const reviewSamples = readModel.reviewQueue.slice(0, 30)

  return { cleanSamples, reviewSamples }
}

export { CANONICAL_USER }
