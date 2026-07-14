#!/usr/bin/env node
/**
 * Match merchant order exports to finance_transactions (purchase + refund credits).
 *
 * Usage:
 *   node scripts/link-purchase-orders.mjs --source amazon|bestbuy|target [--user-id UUID] [--orders path] [--dry-run] [--apply]
 *   Batch insert controls (dry-run + apply):
 *     --max-inserts <n> --only-high-confidence --exclude-returned --inserts-only
 *     --only-transaction-ids id1,id2,...
 *   Targeted stale returnInfo repair (Amazon):
 *     --updates-only --clear-stale-return-info-only --only-transaction-ids id1,id2,...
 *   Dangerous override (requires both flags): --allow-cross-user-explicit-repair
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import {
  matchAmazonOrdersToTxns,
  matchAmazonRefundsToOrders,
} from '../src/engine/amazonOrderMatch.ts'
import {
  matchTargetOrdersToTxns,
  matchTargetRefundsToOrders,
  enrichmentFromOrder as targetEnrichmentFromOrder,
} from '../src/engine/targetOrderMatch.ts'
import {
  matchBestBuyOrdersToTxns,
  matchBestBuyRefundsToOrders,
  enrichmentFromOrder as bestbuyEnrichmentFromOrder,
} from '../src/engine/bestbuyOrderMatch.ts'
import {
  startApplyRun,
  logApplyRunItem,
  finishApplyRun,
} from './lib/purchaseEnrichmentApplyLedger.mjs'
import {
  uploadPurchaseEnrichmentImages,
  resolveServiceRoleKey,
} from './lib/purchaseImageStorage.mjs'
import {
  mergePurchaseEnrichment,
  stripLinkMetadata,
  classifyReturnInfoMerge,
  buildTargetedStaleReturnInfoRepairPlan,
  repairStaleReturnInfoOnly,
  wouldWriteEnrichmentUpdate,
  enrichmentFieldChanges,
} from '../src/engine/purchaseEnrichment.ts'
import { deriveAmazonReturnInfoDecision } from '../../../../web-state-devtools/bridge/lib/amazon-orders-parser.mjs'
import { parseVisibleDateText } from '../../../../web-state-devtools/bridge/lib/bestbuy-orders-parser.mjs'
import { isRefundCreditTxn } from '../src/engine/purchaseReturnStatus.ts'
import { purchaseReviewAutomationGate } from '../src/engine/purchaseReviewDecision.ts'
import {
  resolveOrdersRawPath,
  summaryHarvestSince,
  summaryHarvestUntil,
} from '../../../../web-state-devtools/bridge/lib/orders-export.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'

const SOURCE_CONFIG = {
  amazon: {
    label: 'amazon',
    merchantSql: `(merchant_name ilike '%amazon%' or merchant ilike '%amazon%')`,
    defaultOrders: path.resolve(
      __dirname,
      '../../../../web-state-devtools/bridge/data/amazon-export/amazon-orders-2026-raw.json',
    ),
    matchOrders: matchAmazonOrdersToTxns,
    matchRefunds: matchAmazonRefundsToOrders,
  },
  bestbuy: {
    label: 'bestbuy',
    merchantSql: `(merchant_name ilike '%best buy%' or merchant_name ilike '%bestbuy%' or merchant ilike '%best buy%' or merchant ilike '%bestbuy%')`,
    defaultOrders: path.resolve(
      __dirname,
      '../../../../web-state-devtools/bridge/data/bestbuy-export/bestbuy-orders-past-year-raw.json',
    ),
    matchOrders: matchBestBuyOrdersToTxns,
    matchRefunds: matchBestBuyRefundsToOrders,
  },
  target: {
    label: 'target',
    merchantSql: `(merchant_name ilike '%target%' or merchant ilike '%target%')`,
    defaultOrders: path.resolve(
      __dirname,
      '../../../../web-state-devtools/bridge/data/target-export/target-orders-past-year-raw.json',
    ),
    matchOrders: matchTargetOrdersToTxns,
    matchRefunds: matchTargetRefundsToOrders,
  },
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN)
    return process.env.SUPABASE_ACCESS_TOKEN
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
  if (!token)
    throw new Error('Missing Supabase access token. Run: supabase login')
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function escSql(s) {
  return String(s).replace(/'/g, "''")
}

function parseOnlyTxnIds(raw) {
  if (!raw) return null
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return ids.length ? ids : null
}

function parseMaxInserts(raw) {
  if (raw == null || raw === '') return null
  const n = Number.parseInt(String(raw), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function isReturnedOrCancelledOrder(order) {
  if (!order) return false
  const s = (order.status || '').toLowerCase()
  const ri = order.returnInfo?.status
  if (ri === 'returned' || ri === 'refunded' || ri === 'cancelled') return true
  return /return complete|returned|refunded|cancelled|canceled|partial_return/i.test(
    s,
  )
}

function hasBatchInsertFilters(opts) {
  return Boolean(
    opts.onlyHighConfidence ||
    opts.excludeReturned ||
    opts.insertsOnly ||
    opts.maxInserts != null ||
    opts.onlyTxnIds?.length,
  )
}

function filterPurchaseMatchesForBatch(
  purchaseMatches,
  txns,
  orders,
  refundLinks,
  opts,
) {
  const {
    onlyHighConfidence,
    excludeReturned,
    insertsOnly,
    maxInserts,
    onlyTxnIds,
  } = opts

  const orderById = new Map(
    orders.filter((o) => o.orderId).map((o) => [o.orderId, o]),
  )
  const refundLinkedOrderIds = new Set(
    (refundLinks ?? []).map((r) => r.orderId),
  )
  const refundLinkedTxnIds = new Set(
    (refundLinks ?? []).flatMap((r) =>
      [r.purchaseTxnId, r.refundTxnId].filter(Boolean),
    ),
  )

  const dbOrderIdCounts = txns.reduce((acc, t) => {
    const oid = t.purchaseEnrichment?.orderId
    if (oid) acc[oid] = (acc[oid] ?? 0) + 1
    return acc
  }, /** @type {Record<string, number>} */ ({}))

  const skipped = {
    skippedDueToMaxInserts: 0,
    skippedDueToReturned: 0,
    skippedDueToConfidence: 0,
    skippedDueToExistingEnrichment: 0,
    skippedDueToDuplicateRisk: 0,
    skippedDueToOnlyTxnIds: 0,
  }

  const confRank = { high: 3, medium: 2, low: 1 }
  const sorted = [...purchaseMatches].sort((a, b) => {
    if (confRank[b.confidence] !== confRank[a.confidence]) {
      return confRank[b.confidence] - confRank[a.confidence]
    }
    const txnA = txns.find((t) => t.id === a.txnId)
    const txnB = txns.find((t) => t.id === b.txnId)
    if (txnA?.date !== txnB?.date) {
      return (txnB?.date || '').localeCompare(txnA?.date || '')
    }
    return a.dayDiff - b.dayDiff || a.amountDiff - b.amountDiff
  })

  let insertCount = 0
  const allowed = []
  const usedOrderIds = new Set()
  const usedTxnIds = new Set()

  for (const m of sorted) {
    if (onlyTxnIds?.length && !onlyTxnIds.includes(m.txnId)) {
      skipped.skippedDueToOnlyTxnIds++
      continue
    }

    if (onlyHighConfidence && m.confidence !== 'high') {
      skipped.skippedDueToConfidence++
      continue
    }

    const order = orderById.get(m.orderId)
    if (excludeReturned) {
      if (
        isReturnedOrCancelledOrder(order) ||
        m.enrichment.returnInfo ||
        refundLinkedOrderIds.has(m.orderId) ||
        refundLinkedTxnIds.has(m.txnId)
      ) {
        skipped.skippedDueToReturned++
        continue
      }
    }

    const existing = txns.find((t) => t.id === m.txnId)?.purchaseEnrichment
    const isNewInsert = !existing?.source

    if (insertsOnly && !isNewInsert) {
      skipped.skippedDueToExistingEnrichment++
      continue
    }

    if (isNewInsert && (dbOrderIdCounts[m.orderId] ?? 0) >= 1) {
      skipped.skippedDueToDuplicateRisk++
      continue
    }

    if (usedOrderIds.has(m.orderId) || usedTxnIds.has(m.txnId)) {
      skipped.skippedDueToDuplicateRisk++
      continue
    }

    if (isNewInsert) {
      if (maxInserts != null && insertCount >= maxInserts) {
        skipped.skippedDueToMaxInserts++
        continue
      }
      insertCount++
    }

    usedOrderIds.add(m.orderId)
    usedTxnIds.add(m.txnId)
    allowed.push(m)
  }

  return { allowed, skipped, proposedNewEnrichmentRows: insertCount }
}

function reportBatchFilterSkips(tag, skipped) {
  if (!skipped) return
  console.log('\n' + tag, 'batch filter skips:')
  for (const [key, count] of Object.entries(skipped)) {
    if (count > 0) console.log(' ', key + ':', count)
  }
}

async function fetchTxnsByIds(ids, userId, { scopedToUser = true } = {}) {
  if (!ids.length) return []
  const inClause = ids.map((id) => `'${escSql(id)}'`).join(', ')
  const rows = await runSql(`
    select id, user_id, txn_date, coalesce(source_amount, amount) as amount, merchant_name, merchant, flow, account, purchase_enrichment
    from finance_transactions
    where id in (${inClause})
      ${scopedToUser && userId ? `and user_id = '${escSql(userId)}'` : ''}
    order by txn_date desc;
  `)
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    date: String(r.txn_date).slice(0, 10),
    amount: Number(r.amount),
    merchant: String(r.merchant_name ?? r.merchant ?? ''),
    flow: r.flow ? String(r.flow) : undefined,
    account: r.account ? String(r.account) : '',
    purchaseEnrichment: r.purchase_enrichment,
  }))
}

function mergeTxnLists(primary, extra) {
  const byId = new Map(primary.map((t) => [t.id, t]))
  for (const t of extra) byId.set(t.id, t)
  return [...byId.values()]
}

// FINC.PURCHASE.6.a — build the manual-decision precedence index for a set of
// transactions. Manual Confirm/Reject (purchase_associations) outranks automated
// enrichment: `purchaseReviewAutomationGate` uses this to skip identity writes to
// confirmed transactions and refuse resurfacing rejected candidates.
// Defensive: if the table is absent (pre-migration env) it returns an empty index
// so the matcher keeps working with no gating.
async function fetchReviewPrecedence(ids, userId) {
  const uniq = [...new Set((ids ?? []).filter(Boolean))]
  const index = new Map()
  if (!uniq.length) return index
  const inClause = uniq.map((id) => `'${escSql(id)}'`).join(', ')
  let rows
  try {
    rows = await runSql(`
      select transaction_id, source, external_order_id, state
      from public.purchase_associations
      where state in ('confirmed', 'rejected')
        and transaction_id in (${inClause})
        ${userId ? `and user_id = '${escSql(userId)}'` : ''};
    `)
  } catch (err) {
    const msg = String(err?.message ?? err)
    if (/purchase_associations/.test(msg) && /exist|relation/i.test(msg)) {
      console.warn(
        '  review precedence: purchase_associations not found — skipping gating (pre-migration env)',
      )
      return index
    }
    throw err
  }
  for (const r of rows ?? []) {
    const txnId = String(r.transaction_id)
    const entry = {
      state: String(r.state),
      source: String(r.source),
      externalOrderId: String(r.external_order_id),
    }
    const list = index.get(txnId)
    if (list) list.push(entry)
    else index.set(txnId, [entry])
  }
  return index
}

function buildOrderDecisionMap(orders) {
  const map = new Map()
  for (const o of orders) {
    if (!o.orderId) continue
    map.set(
      o.orderId,
      o.returnInfoDecision ?? deriveAmazonReturnInfoDecision(o),
    )
  }
  return map
}

function reportTargetedRepairDryRun(plan, tag, updatesOnly) {
  const clears = plan.filter((p) => p.action === 'clear')
  const crossUserSkipped = plan.filter((p) => p.action === 'skip_cross_user')
  const userScopedIds = plan.filter((p) => p.action !== 'skip_cross_user')
  const skipInserts = plan.filter((p) => p.action === 'skip_insert')
  const staleStillPresent = userScopedIds.filter(
    (p) =>
      p.action !== 'clear' &&
      p.before?.returnInfo &&
      /deliver|arriv|ship|purchas/i.test(p.before.status || ''),
  )

  console.log(tag, 'targeted stale returnInfo repair:')
  console.log(' ', 'targetedTransactionIds:', plan.length)
  console.log(' ', 'userScopedTargetedTransactionIds:', userScopedIds.length)
  console.log(' ', 'crossUserSkipped:', crossUserSkipped.length)
  console.log(' ', 'proposedReturnInfoClears:', clears.length)
  console.log(' ', 'staleReturnInfoStillPresent:', staleStillPresent.length)
  console.log(' ', 'proposedNewEnrichmentRows: 0')
  console.log(
    ' ',
    'skippedNewEnrichmentRowsDueToUpdatesOnly:',
    skipInserts.length,
  )
  console.log(' ', 'proposedDuplicateOrderIdCreates: 0')
  console.log(' ', 'insertsBlocked: yes (updates-only repair mode)')

  if (clears.length) {
    console.log(' ', 'affected rows:')
    for (const row of clears) {
      console.log(
        '   ',
        row.orderId,
        row.txnId,
        '| fieldsChanged:',
        (row.fieldsChanged || []).join(', ') || '(none)',
        '| returnInfo:',
        row.before?.returnInfo?.status,
        '→',
        row.after?.returnInfo?.status ?? 'cleared',
      )
    }
  }

  if (crossUserSkipped.length) {
    console.log(' ', 'cross-user skipped:')
    for (const row of crossUserSkipped) {
      console.log(
        '   ',
        row.txnId,
        row.orderId || '(no orderId)',
        '| actual user_id:',
        row.actualUserId ?? '(unknown)',
      )
    }
  }

  if (staleStillPresent.length) {
    console.log(' ', 'stale still present (not cleared):')
    for (const row of staleStillPresent) {
      console.log('   ', row.orderId, row.txnId, row.action)
    }
  }

  return {
    targetedTransactionIds: plan.length,
    userScopedTargetedTransactionIds: userScopedIds.length,
    crossUserSkipped: crossUserSkipped.length,
    proposedReturnInfoClears: clears.length,
    staleReturnInfoStillPresent: staleStillPresent.length,
    proposedNewEnrichmentRows: 0,
    skippedNewEnrichmentRowsDueToUpdatesOnly: skipInserts.length,
    proposedDuplicateOrderIdCreates: 0,
    clears,
    crossUserSkippedRows: crossUserSkipped,
  }
}

function mergeEnrichment(existing, incoming) {
  return mergePurchaseEnrichment(existing, incoming)
}

function wouldUpdateEnrichment(
  existing,
  incoming,
  replace,
  refreshImages,
  sourceLabel,
) {
  if (replace) return true
  if (refreshImages && existing?.source === sourceLabel) return true
  if (existing?.source !== sourceLabel) return true
  const action = classifyReturnInfoMerge(existing, incoming, false)
  return action === 'clear' || action === 'update'
}

function buildScopedPurchaseWritePlan(
  purchaseMatches,
  txns,
  { onlyTxnIds, userId, updatesOnly, replace, refreshImages, sourceLabel },
) {
  const targetedSet = new Set(onlyTxnIds)
  const plan = []
  let crossUserSkipped = 0

  for (const m of purchaseMatches) {
    if (!targetedSet.has(m.txnId)) continue
    const txn = txns.find((t) => t.id === m.txnId)
    if (userId && txn?.userId && txn.userId !== userId) {
      crossUserSkipped++
      continue
    }
    const existing = txn?.purchaseEnrichment
    if (!wouldWriteEnrichmentUpdate(existing, updatesOnly)) {
      plan.push({
        txnId: m.txnId,
        orderId: m.orderId,
        action: 'skip_insert',
        userId: txn?.userId,
        account: txn?.account,
      })
      continue
    }
    if (
      !wouldUpdateEnrichment(
        existing,
        m.enrichment,
        replace,
        refreshImages,
        sourceLabel,
      )
    ) {
      plan.push({
        txnId: m.txnId,
        orderId: m.orderId,
        action: 'skip_no_change',
        userId: txn?.userId,
        account: txn?.account,
      })
      continue
    }
    const merged = replace
      ? m.enrichment
      : mergePurchaseEnrichment(existing, m.enrichment)
    plan.push({
      txnId: m.txnId,
      orderId: m.orderId,
      action: 'update',
      userId: txn?.userId,
      account: txn?.account,
      confidence: m.confidence,
      dayDiff: m.dayDiff,
      amountDiff: m.amountDiff,
      before: existing,
      after: merged,
      returnInfoAction: classifyReturnInfoMerge(
        existing,
        m.enrichment,
        replace,
      ),
      fieldsChanged: enrichmentFieldChanges(existing ?? {}, merged),
    })
  }

  for (const id of onlyTxnIds) {
    if (!plan.some((p) => p.txnId === id)) {
      const txn = txns.find((t) => t.id === id)
      if (userId && txn?.userId && txn.userId !== userId) {
        crossUserSkipped++
      }
      plan.push({
        txnId: id,
        orderId: txn?.purchaseEnrichment?.orderId,
        action: txn ? 'skip_not_matched' : 'skip_not_in_txns',
        userId: txn?.userId,
        account: txn?.account,
      })
    }
  }

  return { plan, crossUserSkipped }
}

function reportScopedUpdatesOnlyDryRun({
  tag,
  onlyTxnIds,
  userId,
  purchaseMatches,
  txns,
  sourceLabel,
  replace,
  refreshImages,
}) {
  const { plan, crossUserSkipped } = buildScopedPurchaseWritePlan(
    purchaseMatches,
    txns,
    {
      onlyTxnIds,
      userId,
      updatesOnly: true,
      replace,
      refreshImages,
      sourceLabel,
    },
  )
  const writes = plan.filter((p) => p.action === 'update')
  const returnInfoUpdates = writes.filter(
    (p) => p.returnInfoAction === 'update',
  ).length
  const userScoped = onlyTxnIds.filter((id) => {
    const txn = txns.find((t) => t.id === id)
    return !userId || !txn?.userId || txn.userId === userId
  }).length

  console.log(tag, 'scoped updates-only dry-run:')
  console.log(' ', 'targetedTransactionIds:', onlyTxnIds.length)
  console.log(' ', 'userScopedTargetedTransactionIds:', userScoped)
  console.log(' ', 'crossUserSkipped:', crossUserSkipped)
  console.log(' ', 'affectedRows:', writes.length)
  console.log(' ', 'proposedReturnInfoUpdates:', returnInfoUpdates)
  console.log(' ', 'proposedNewEnrichmentRows: 0')
  console.log(' ', 'proposedDuplicateOrderIdCreates: 0')
  console.log(' ', 'refundLinksSkipped: yes (scoped txn repair)')
  console.log(' ', 'insertsBlocked: yes (updates-only mode)')

  if (writes.length) {
    console.log(' ', 'affected rows:')
    for (const row of writes) {
      console.log(
        '   ',
        row.txnId,
        row.orderId,
        '| fieldsChanged:',
        (row.fieldsChanged || []).join(', ') || '(none)',
        '| returnInfo:',
        row.before?.returnInfo?.status ?? '(absent)',
        '→',
        row.after?.returnInfo?.status ?? '(absent)',
        '| confidence:',
        row.confidence,
        '| dayDiff:',
        row.dayDiff,
        '| lowConfidence:',
        row.confidence === 'low',
        '| dateMismatchGt3d:',
        row.dayDiff > 3,
      )
    }
  }

  const skipped = plan.filter((p) => p.action !== 'update')
  if (skipped.length) {
    console.log(' ', 'skipped targeted ids:')
    for (const row of skipped) {
      console.log('   ', row.txnId, row.action, row.orderId || '')
    }
  }

  return {
    targetedTransactionIds: onlyTxnIds.length,
    userScopedTargetedTransactionIds: userScoped,
    crossUserSkipped,
    affectedRows: writes.length,
    proposedReturnInfoUpdates: returnInfoUpdates,
    proposedNewEnrichmentRows: 0,
    proposedDuplicateOrderIdCreates: 0,
    writes,
    plan,
  }
}

function reportDryRunMergeImpact(
  purchaseMatches,
  txns,
  replace,
  tag,
  updatesOnly = false,
  orders = [],
  insertsOnly = false,
) {
  let proposedReturnInfoClears = 0
  let proposedReturnInfoUpdates = 0
  let proposedReturnInfoPreserves = 0
  const clearDetails = []
  const updateDetails = []
  const staleReturnInfoStillPresent = []
  let skippedNewEnrichmentRowsDueToUpdatesOnly = 0
  let skippedUpdatesDueToInsertsOnly = 0
  const orderById = new Map(
    orders.filter((o) => o.orderId).map((o) => [o.orderId, o]),
  )

  for (const m of purchaseMatches) {
    const txn = txns.find((t) => t.id === m.txnId)
    const existing = txn?.purchaseEnrichment
    if (!wouldWriteEnrichmentUpdate(existing, updatesOnly)) {
      skippedNewEnrichmentRowsDueToUpdatesOnly++
      continue
    }
    if (insertsOnly && existing?.source) {
      skippedUpdatesDueToInsertsOnly++
      continue
    }
    if (
      existing?.source &&
      existing.source !== m.enrichment.source &&
      !replace
    ) {
      continue
    }

    const action = classifyReturnInfoMerge(existing, m.enrichment, replace)
    if (action === 'clear') {
      proposedReturnInfoClears++
      clearDetails.push({
        orderId: m.orderId,
        txnId: m.txnId,
        previousReturnInfo: existing?.returnInfo,
      })
    } else if (action === 'update') {
      proposedReturnInfoUpdates++
      const merged = replace
        ? m.enrichment
        : mergePurchaseEnrichment(existing, m.enrichment)
      const exportOrder = orderById.get(m.orderId)
      updateDetails.push({
        matchKind: 'purchase',
        txnId: m.txnId,
        userId: txn?.userId,
        account: txn?.account,
        orderId: m.orderId,
        receiptId: exportOrder?.storeTransactionId || exportOrder?.orderId,
        mergeKey: exportOrder?.detailUrl || m.orderId,
        orderDate:
          exportOrder?.orderDateIso ||
          parseVisibleDateText(exportOrder?.orderDate) ||
          exportOrder?.orderDate,
        orderDateSource: exportOrder?.orderDateSource,
        txnDate: txn?.date,
        dateDiff: m.dayDiff,
        orderTotal: exportOrder?.orderTotal ?? m.enrichment.orderTotal,
        txnAmount: txn?.amount,
        confidence: m.confidence,
        amountDiff: m.amountDiff,
        returnInfoBefore: existing?.returnInfo,
        returnInfoAfter: merged.returnInfo,
        status: exportOrder?.status ?? m.enrichment.status,
        statusRaw: exportOrder?.statusDate ?? exportOrder?.status,
        fieldsChanged: enrichmentFieldChanges(existing ?? {}, merged),
        lowConfidence: m.confidence === 'low',
        dateMismatchGt3d: m.dayDiff > 3,
      })
    } else if (action === 'preserve') {
      proposedReturnInfoPreserves++
    }

    const merged = replace
      ? m.enrichment
      : mergePurchaseEnrichment(existing, m.enrichment)
    const hadFalseStale =
      existing?.returnInfo &&
      /deliver|arriv|ship|purchas/i.test(existing?.status || '') &&
      merged.returnInfo
    if (hadFalseStale) {
      staleReturnInfoStillPresent.push({
        orderId: m.orderId,
        txnId: m.txnId,
        returnInfo: merged.returnInfo,
      })
    }
  }

  const dbOrderIdCounts = txns.reduce((acc, t) => {
    const oid = t.purchaseEnrichment?.orderId
    if (oid) acc[oid] = (acc[oid] ?? 0) + 1
    return acc
  }, /** @type {Record<string, number>} */ ({}))

  const proposedNewOrderIds = purchaseMatches
    .filter((m) => {
      const existing = txns.find((t) => t.id === m.txnId)?.purchaseEnrichment
      if (updatesOnly && !existing?.source) return false
      return !existing?.source
    })
    .map((m) => m.orderId)

  let proposedDuplicateCreates = 0
  for (const oid of proposedNewOrderIds) {
    if ((dbOrderIdCounts[oid] ?? 0) >= 1) proposedDuplicateCreates++
  }

  console.log(tag, 'dry-run returnInfo merge:')
  console.log(
    ' ',
    'proposedReturnInfoClears:',
    proposedReturnInfoClears,
    '| proposedReturnInfoUpdates:',
    proposedReturnInfoUpdates,
    '| proposedReturnInfoPreserves:',
    proposedReturnInfoPreserves,
  )
  console.log(
    ' ',
    'staleReturnInfoStillPresent:',
    staleReturnInfoStillPresent.length,
  )
  if (clearDetails.length) {
    console.log(' ', 'returnInfo clears:')
    for (const row of clearDetails.slice(0, 20)) {
      console.log(
        '   ',
        row.orderId,
        row.txnId.slice(0, 8) + '…',
        'was',
        row.previousReturnInfo?.status,
      )
    }
    if (clearDetails.length > 20)
      console.log('   …', clearDetails.length - 20, 'more clears')
  }
  if (updateDetails.length) {
    console.log(' ', 'proposed returnInfo updates:')
    for (const row of updateDetails) {
      console.log(
        JSON.stringify(
          {
            matchKind: row.matchKind,
            txnId: row.txnId,
            userId: row.userId,
            account: row.account,
            orderId: row.orderId,
            receiptId: row.receiptId,
            mergeKey: row.mergeKey,
            orderDate: row.orderDate,
            orderDateSource: row.orderDateSource,
            txnDate: row.txnDate,
            dateDiff: row.dateDiff,
            orderTotal: row.orderTotal,
            txnAmount: row.txnAmount,
            confidence: row.confidence,
            amountDiff: row.amountDiff,
            returnInfoBefore: row.returnInfoBefore,
            returnInfoAfter: row.returnInfoAfter,
            status: row.status,
            statusRaw: row.statusRaw,
            fieldsChanged: row.fieldsChanged,
            lowConfidence: row.lowConfidence,
            dateMismatchGt3d: row.dateMismatchGt3d,
          },
          null,
          2,
        ),
      )
    }
  }
  if (staleReturnInfoStillPresent.length) {
    console.log(' ', 'stale still present:')
    for (const row of staleReturnInfoStillPresent) {
      console.log('   ', row.orderId, row.txnId.slice(0, 8) + '…')
    }
  }
  console.log(
    ' ',
    'proposedNewEnrichmentRows:',
    proposedNewOrderIds.length,
    '| proposedDuplicateOrderIdCreates:',
    proposedDuplicateCreates,
  )
  if (updatesOnly) {
    console.log(
      ' ',
      'skippedNewEnrichmentRowsDueToUpdatesOnly:',
      skippedNewEnrichmentRowsDueToUpdatesOnly,
    )
  }
  if (insertsOnly) {
    console.log(
      ' ',
      'skippedUpdatesDueToInsertsOnly:',
      skippedUpdatesDueToInsertsOnly,
    )
  }

  return {
    proposedReturnInfoClears,
    proposedReturnInfoUpdates,
    proposedReturnInfoPreserves,
    staleReturnInfoStillPresent,
    clearDetails,
    updateDetails,
    proposedDuplicateCreates,
    skippedNewEnrichmentRowsDueToUpdatesOnly,
    skippedUpdatesDueToInsertsOnly,
    proposedNewOrderIds,
  }
}

function reportBestBuyDryRunSummary({
  tag,
  orders,
  txns,
  purchaseMatches,
  refundLinks,
  mergeImpact,
}) {
  const matchedOrderIds = new Set(purchaseMatches.map((m) => m.orderId))
  const matchedTxnIds = new Set(purchaseMatches.map((m) => m.txnId))
  const purchaseTxns = txns.filter((t) => t.amount > 0 && !isRefundCreditTxn(t))
  const unmatchedOrders = orders.filter(
    (o) => o.orderId && !matchedOrderIds.has(o.orderId),
  )
  const unmatchedPurchaseTxns = purchaseTxns.filter(
    (t) => !matchedTxnIds.has(t.id),
  )
  const lowConfidence = purchaseMatches.filter((m) => m.confidence === 'low')
  const dateMismatchGt3d = purchaseMatches.filter((m) => m.dayDiff > 3)
  const unknownAccountTxns = txns.filter(
    (t) => !t.account || t.account === 'Unknown',
  )

  console.log('\n' + tag, 'Best Buy dry-run summary:')
  console.log(' ', 'orders read:', orders.length)
  console.log(' ', 'candidate txns:', txns.length)
  console.log(' ', 'matched purchases:', purchaseMatches.length)
  console.log(' ', 'matched refunds:', refundLinks.length)
  console.log(' ', 'unmatched orders:', unmatchedOrders.length)
  console.log(' ', 'unmatched transactions:', unmatchedPurchaseTxns.length)
  console.log(
    ' ',
    'Unknown account candidate count:',
    unknownAccountTxns.length,
  )
  console.log(' ', 'low confidence matches:', lowConfidence.length)
  console.log(' ', 'date mismatch >3d:', dateMismatchGt3d.length)
  console.log(
    ' ',
    'proposedNewEnrichmentRows:',
    mergeImpact.proposedNewOrderIds?.length ?? 0,
  )
  console.log(
    ' ',
    'proposedUpdates:',
    (mergeImpact.proposedReturnInfoUpdates ?? 0) +
      (mergeImpact.proposedReturnInfoClears ?? 0),
  )
  console.log(
    ' ',
    'proposedDuplicateOrderIdCreates:',
    mergeImpact.proposedDuplicateCreates ?? 0,
  )
  console.log(
    ' ',
    'returnInfo updates/preserves/clears:',
    mergeImpact.proposedReturnInfoUpdates ?? 0,
    '/',
    mergeImpact.proposedReturnInfoPreserves ?? 0,
    '/',
    mergeImpact.proposedReturnInfoClears ?? 0,
  )

  console.log('\n' + tag, 'top 20 proposed matches:')
  for (const m of purchaseMatches.slice(0, 20)) {
    const txn = txns.find((t) => t.id === m.txnId)
    const order = orders.find((o) => o.orderId === m.orderId)
    console.log(
      ' ',
      txn?.date,
      '$' + txn?.amount,
      '→',
      m.orderId,
      order?.orderDate,
      order?.orderDateSource ? `(${order.orderDateSource})` : '',
      `(${m.confidence}, Δ${m.dayDiff.toFixed(1)}d)`,
    )
  }

  console.log('\n' + tag, 'top 20 unmatched orders:')
  for (const o of unmatchedOrders.slice(0, 20)) {
    console.log(
      ' ',
      o.orderId,
      o.orderDate,
      o.orderDateSource ? `(${o.orderDateSource})` : '',
      o.orderTotal,
      o.status,
    )
  }

  console.log('\n' + tag, 'top 20 unmatched txns:')
  for (const t of unmatchedPurchaseTxns.slice(0, 20)) {
    console.log(' ', t.date, '$' + t.amount, t.account || '(blank)', t.merchant)
  }

  if (lowConfidence.length) {
    console.log('\n' + tag, 'low confidence detail:')
    for (const m of lowConfidence) {
      const txn = txns.find((t) => t.id === m.txnId)
      const order = orders.find((o) => o.orderId === m.orderId)
      console.log(
        ' ',
        m.orderId,
        'txn',
        txn?.date,
        'order',
        order?.orderDateIso || parseVisibleDateText(order?.orderDate),
        'Δ$' + m.amountDiff.toFixed(2),
        'Δ' + m.dayDiff.toFixed(1) + 'd',
      )
    }
  }
}

function summarizeLineItems(order) {
  const items = (order?.lineItems ?? []).filter(
    (li) => li.title && li.title.length > 2,
  )
  const titles = items.slice(0, 3).map((li) => String(li.title).slice(0, 60))
  const qtySum = items.reduce((acc, li) => acc + (li.quantity ?? 1), 0)
  const withImage = items.filter((li) => li.imageUrl).length
  const missingTitle = items.filter((li) => !li.title).length
  const missingQty = items.filter(
    (li) => li.quantity == null || li.quantity <= 0,
  ).length
  return {
    itemCount: items.length,
    titles,
    qtySum,
    imageCoverage: items.length ? `${withImage}/${items.length}` : '0/0',
    missingTitle,
    missingQty,
  }
}

function reportTargetDryRunSummary({
  tag,
  orders,
  txns,
  purchaseMatches,
  refundLinks,
  mergeImpact,
  batchFilter,
}) {
  const matchedOrderIds = new Set(purchaseMatches.map((m) => m.orderId))
  const matchedTxnIds = new Set(purchaseMatches.map((m) => m.txnId))
  const purchaseTxns = txns.filter((t) => t.amount > 0 && !isRefundCreditTxn(t))
  const unmatchedOrders = orders.filter(
    (o) => o.orderId && !matchedOrderIds.has(o.orderId),
  )
  const unmatchedPurchaseTxns = purchaseTxns.filter(
    (t) => !matchedTxnIds.has(t.id),
  )
  const lowConfidence = purchaseMatches.filter((m) => m.confidence === 'low')
  const mediumConfidence = purchaseMatches.filter(
    (m) => m.confidence === 'medium',
  )
  const returnedMatched = purchaseMatches.filter((m) => {
    const order = orders.find((o) => o.orderId === m.orderId)
    return isReturnedOrCancelledOrder(order) || m.enrichment.returnInfo
  })
  const unknownAccountTxns = txns.filter(
    (t) => !t.account || t.account === 'Unknown',
  )

  const proposedInserts = purchaseMatches.filter((m) => {
    const existing = txns.find((t) => t.id === m.txnId)?.purchaseEnrichment
    return !existing?.source
  })

  console.log('\n' + tag, 'Target dry-run summary:')
  console.log(' ', 'orders read:', orders.length)
  console.log(
    ' ',
    'online / in_store:',
    orders.filter((o) => o.sourceView === 'online').length,
    '/',
    orders.filter(
      (o) => o.sourceView === 'in_store' || o.sourceView === 'instore',
    ).length,
  )
  console.log(' ', 'candidate txns:', txns.length)
  console.log(' ', 'matched purchases:', purchaseMatches.length)
  console.log(' ', 'matched refunds:', refundLinks.length)
  console.log(' ', 'unmatched orders:', unmatchedOrders.length)
  console.log(' ', 'unmatched transactions:', unmatchedPurchaseTxns.length)
  console.log(
    ' ',
    'Unknown account candidate count:',
    unknownAccountTxns.length,
  )
  console.log(' ', 'low confidence matches:', lowConfidence.length)
  console.log(' ', 'medium confidence matches:', mediumConfidence.length)
  console.log(' ', 'returned matched as purchase:', returnedMatched.length)
  console.log(' ', 'proposedNewEnrichmentRows:', proposedInserts.length)
  console.log(
    ' ',
    'proposedUpdates:',
    (mergeImpact.proposedReturnInfoUpdates ?? 0) +
      (mergeImpact.proposedReturnInfoClears ?? 0),
  )
  console.log(
    ' ',
    'proposedDuplicateOrderIdCreates:',
    mergeImpact.proposedDuplicateCreates ?? 0,
  )
  if (batchFilter) {
    reportBatchFilterSkips(tag, batchFilter.skipped)
    console.log(
      ' ',
      'batch allowed inserts:',
      batchFilter.proposedNewEnrichmentRows,
    )
  }

  console.log('\n' + tag, 'top 30 proposed insert rows:')
  for (const m of proposedInserts.slice(0, 30)) {
    const txn = txns.find((t) => t.id === m.txnId)
    const order = orders.find((o) => o.orderId === m.orderId)
    const li = summarizeLineItems(order)
    const returned =
      isReturnedOrCancelledOrder(order) || m.enrichment.returnInfo
    const existing = txn?.purchaseEnrichment?.source
    console.log(
      JSON.stringify(
        {
          txnId: m.txnId,
          orderId: m.orderId,
          receiptId: order?.storeTransactionId || order?.orderId,
          mergeKey: order?.detailUrl || m.orderId,
          sourceView: order?.sourceView,
          orderDate: order?.orderDateIso || order?.orderDate,
          txnDate: txn?.date,
          dateDiff: m.dayDiff,
          total: order?.orderTotal,
          txnAmount: txn?.amount,
          confidence: m.confidence,
          status: order?.status,
          statusRaw: order?.statusDate ?? order?.status,
          itemCount: li.itemCount,
          firstItems: li.titles,
          quantitySummary: li.qtySum,
          imageCoverage: li.imageCoverage,
          returnedOrRefunded: returned,
          existingEnrichment: existing ?? null,
          account: txn?.account,
        },
        null,
        2,
      ),
    )
  }
}

const ENRICHMENT_FROM_ORDER = {
  bestbuy: bestbuyEnrichmentFromOrder,
  target: targetEnrichmentFromOrder,
}

async function resolveCatalogUserId(explicit) {
  if (explicit) return explicit
  const rows = await runSql(
    `select user_id from finance_user_settings order by updated_at desc limit 1`,
  )
  return rows?.[0]?.user_id ? String(rows[0].user_id) : null
}

async function syncMerchantOrderCatalog(
  sourceKey,
  orders,
  purchaseMatches,
  userId,
  tag,
) {
  const build = ENRICHMENT_FROM_ORDER[sourceKey]
  if (!build || !userId) return 0

  const matchedIds = new Set(purchaseMatches.map((m) => m.orderId))
  const unlinked = orders.filter(
    (o) =>
      o.orderId &&
      !matchedIds.has(o.orderId) &&
      (o.lineItems?.length || o.orderTotal),
  )
  if (!unlinked.length) {
    console.log(tag, 'catalog: no unlinked orders to sync')
    return 0
  }

  const entries = unlinked.map((o) => ({
    ...build(o, 'low'),
    unlinked: true,
    unlinkedReason:
      sourceKey === 'target' ? 'redcard_or_no_bank_match' : 'no_bank_match',
  }))

  const patch = escSql(
    JSON.stringify({
      [sourceKey]: { orders: entries, syncedAt: new Date().toISOString() },
    }),
  )

  await runSql(`
    update finance_user_settings
    set merchant_order_catalog = coalesce(merchant_order_catalog, '{}'::jsonb)
      || '${patch}'::jsonb
      || jsonb_build_object('updatedAt', to_jsonb(now()::text)),
        updated_at = now()
    where user_id = '${escSql(userId)}';
  `)

  console.log(tag, 'catalog: synced', entries.length, 'unlinked orders')
  return entries.length
}

async function main() {
  const sourceKey = arg('--source', 'amazon')
  const cfg = SOURCE_CONFIG[sourceKey]
  if (!cfg) {
    console.error(
      '[link-purchase] unknown --source:',
      sourceKey,
      '(amazon|bestbuy|target)',
    )
    process.exit(1)
  }

  const userId = arg('--user-id', process.env.FINANCE_OS_USER_ID ?? null)
  const accountFilter = arg('--account', null)
  const sourceAccountLabel = arg('--source-account-label', null)
  const allowUnscoped = hasFlag('--allow-unscoped')

  const exportDir = path.dirname(cfg.defaultOrders)
  const ordersPath = arg(
    '--orders',
    resolveOrdersRawPath(exportDir, sourceKey) || cfg.defaultOrders,
  )
  const year = arg('--year', '2026')
  const dryRun = hasFlag('--dry-run') || !hasFlag('--apply')
  const replace = hasFlag('--replace')
  const clearStale = replace && !hasFlag('--keep-stale')
  const minConfidence = arg('--min-confidence', 'low')
  const matchOpts = {
    minConfidence:
      minConfidence === 'high' || minConfidence === 'medium'
        ? minConfidence
        : 'low',
  }
  const uploadImages =
    hasFlag('--upload-images') ||
    (hasFlag('--apply') && !hasFlag('--no-upload-images'))
  const refreshImages = hasFlag('--refresh-images')
  const updatesOnly = hasFlag('--updates-only')
  const insertsOnly = hasFlag('--inserts-only')
  const onlyHighConfidence = hasFlag('--only-high-confidence')
  const excludeReturned = hasFlag('--exclude-returned')
  const maxInserts = parseMaxInserts(arg('--max-inserts', null))
  const clearStaleReturnInfoOnly = hasFlag('--clear-stale-return-info-only')
  const allowCrossUserExplicitRepair =
    hasFlag('--allow-cross-user-explicit-repair') && clearStaleReturnInfoOnly
  const onlyTxnIds = parseOnlyTxnIds(arg('--only-transaction-ids', null))
  const scopedTxnRepair =
    updatesOnly && Boolean(onlyTxnIds?.length) && !clearStaleReturnInfoOnly
  const targetedRepairMode =
    sourceKey === 'amazon' &&
    clearStaleReturnInfoOnly &&
    Boolean(onlyTxnIds?.length)
  const tag = `[link-${cfg.label}]`

  if (
    hasFlag('--allow-cross-user-explicit-repair') &&
    !clearStaleReturnInfoOnly
  ) {
    console.error(
      tag,
      '--allow-cross-user-explicit-repair requires --clear-stale-return-info-only',
    )
    process.exit(1)
  }

  if (targetedRepairMode && !userId) {
    console.error(
      tag,
      'targeted repair requires --user-id (explicit txn ids must be user-scoped)',
    )
    process.exit(1)
  }

  if (allowCrossUserExplicitRepair) {
    console.warn(
      tag,
      'DANGEROUS: --allow-cross-user-explicit-repair — explicit txn ids may bypass --user-id',
    )
  }

  if (!userId) {
    console.warn(
      tag,
      'no --user-id / FINANCE_OS_USER_ID — matching across all users (unsafe on multi-tenant DB)',
    )
  }

  if (!fs.existsSync(ordersPath)) {
    console.error(tag, 'orders file not found:', ordersPath)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(ordersPath, 'utf8'))
  const orders = raw.orders ?? raw.items ?? []
  const exportSince =
    summaryHarvestSince(raw.summary) || arg('--since', null) || `${year}-01-01`
  const exportUntil = summaryHarvestUntil(raw.summary)
  const txnSince = arg(
    '--since',
    sourceKey === 'bestbuy' || sourceKey === 'target'
      ? exportSince
      : `${year}-01-01`,
  )
  const txnUntil = arg('--until', exportUntil || `${year}-12-31`)
  console.log(tag, 'loaded', orders.length, 'orders from', ordersPath)
  console.log(tag, 'txn window', txnSince, '→', txnUntil)
  if (accountFilter || sourceAccountLabel) {
    console.log(
      tag,
      'account scope:',
      accountFilter ? `account=${accountFilter}` : '',
      sourceAccountLabel ? `source_account_label=${sourceAccountLabel}` : '',
    )
  }

  const returned = orders.filter(
    (o) =>
      o.returnInfo?.status || /returned|refund|cancel/i.test(o.status ?? ''),
  ).length
  console.log(tag, 'return/cancel flagged orders:', returned)

  // Guardrails: never write across all users, and never let a branded-card
  // reconciliation silently pull in Unknown / other-account transactions.
  const needsAccountScope = sourceKey === 'bestbuy' || sourceKey === 'target'
  const hasAccountScope = Boolean(accountFilter || sourceAccountLabel)
  if (!dryRun) {
    if (!userId) {
      console.error(
        tag,
        '--apply requires --user-id (refusing to write across all users)',
      )
      process.exit(1)
    }
    if (needsAccountScope && !hasAccountScope && !allowUnscoped) {
      console.error(
        tag,
        `--apply for ${cfg.label} requires --account or --source-account-label ` +
          '(prevents Unknown-account pollution). Pass --allow-unscoped to override.',
      )
      process.exit(1)
    }
  } else if (needsAccountScope && !hasAccountScope) {
    console.warn(
      tag,
      `no account scope — matching any '${cfg.label}' merchant txn across accounts ` +
        '(incl. Unknown). Use --account / --source-account-label before --apply.',
    )
  }

  const accountScopeSql = `
      ${accountFilter ? `and account = '${escSql(accountFilter)}'` : ''}
      ${sourceAccountLabel ? `and source_account_label = '${escSql(sourceAccountLabel)}'` : ''}`

  if (targetedRepairMode) {
    console.log(
      tag,
      'targeted repair mode:',
      'updates-only=',
      updatesOnly,
      '| clear-stale-return-info-only | txnIds=',
      onlyTxnIds.length,
    )
  }

  const txnRows = await runSql(`
    select id, user_id, txn_date, coalesce(source_amount, amount) as amount, merchant_name, merchant, flow, account, purchase_enrichment
    from finance_transactions
    where ${cfg.merchantSql}
      and txn_date >= '${escSql(txnSince)}'
      and txn_date <= '${escSql(txnUntil)}'
      ${userId ? `and user_id = '${escSql(userId)}'` : ''}${accountScopeSql}
      -- Never match orders to mirror/duplicate ledger rows. An aggregator (Rocket
      -- Money etc.) re-imports card charges under an aggregate account; those rows
      -- carry an exclude_reason and must not receive enrichment — otherwise one
      -- order links to both the real charge and its shadow.
      and exclude_reason is null
    order by txn_date desc;
  `)

  let txns = (txnRows ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    date: String(r.txn_date).slice(0, 10),
    amount: Number(r.amount),
    merchant: String(r.merchant_name ?? r.merchant ?? ''),
    flow: r.flow ? String(r.flow) : undefined,
    account: r.account ? String(r.account) : '',
    purchaseEnrichment: r.purchase_enrichment,
  }))

  if (onlyTxnIds?.length) {
    const extraTxns = await fetchTxnsByIds(onlyTxnIds, userId, {
      scopedToUser: !allowCrossUserExplicitRepair,
    })
    txns = mergeTxnLists(txns, extraTxns)
  }

  let crossUserLookup = new Map()
  let crossUserOrderLookup = new Map()
  if (targetedRepairMode && onlyTxnIds?.length && userId) {
    const unscopedLookup = await fetchTxnsByIds(onlyTxnIds, null, {
      scopedToUser: false,
    })
    crossUserLookup = new Map(unscopedLookup.map((t) => [t.id, t.userId]))
    crossUserOrderLookup = new Map(
      unscopedLookup.map((t) => [t.id, t.purchaseEnrichment?.orderId || '']),
    )
  }

  const orderDecisionByOrderId = buildOrderDecisionMap(orders)
  const targetedRepairPlan = targetedRepairMode
    ? buildTargetedStaleReturnInfoRepairPlan(
        txns,
        orderDecisionByOrderId,
        {
          updatesOnly,
          clearStaleReturnInfoOnly,
          onlyTxnIds,
          scopedUserId: userId,
          allowCrossUserExplicitRepair,
        },
        crossUserLookup,
        crossUserOrderLookup,
      )
    : []

  console.log(tag, cfg.label, 'txns in window:', txns.length)
  const acctDist = txns.reduce((acc, t) => {
    const key = t.account || '(blank)'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, /** @type {Record<string, number>} */ ({}))
  console.log(tag, 'txns by account:', acctDist)

  const purchaseMatches = cfg.matchOrders(orders, txns, matchOpts)
  const refundLinks = cfg.matchRefunds(orders, txns, purchaseMatches)
  const batchFilterOpts = {
    onlyHighConfidence,
    excludeReturned,
    insertsOnly,
    maxInserts,
    onlyTxnIds,
  }
  const batchFiltersActive =
    hasBatchInsertFilters(batchFilterOpts) &&
    !targetedRepairMode &&
    !scopedTxnRepair
  const batchFilter = batchFiltersActive
    ? filterPurchaseMatchesForBatch(
        purchaseMatches,
        txns,
        orders,
        refundLinks,
        batchFilterOpts,
      )
    : null
  const effectivePurchaseMatches = batchFilter?.allowed ?? purchaseMatches
  const effectiveRefundLinks =
    insertsOnly || batchFiltersActive ? [] : refundLinks
  if (batchFiltersActive) {
    console.log(
      tag,
      'batch filters:',
      [
        onlyHighConfidence ? 'only-high-confidence' : null,
        excludeReturned ? 'exclude-returned' : null,
        insertsOnly ? 'inserts-only' : null,
        maxInserts != null ? `max-inserts=${maxInserts}` : null,
        onlyTxnIds?.length ? `only-transaction-ids=${onlyTxnIds.length}` : null,
      ]
        .filter(Boolean)
        .join(' | ') || '(none)',
    )
  }
  const orderById = new Map(
    orders.filter((o) => o.orderId).map((o) => [o.orderId, o]),
  )
  const syncCatalog =
    (hasFlag('--sync-catalog') || hasFlag('--apply')) &&
    !hasFlag('--no-sync-catalog') &&
    (sourceKey === 'bestbuy' || sourceKey === 'target')

  const already = txns.filter(
    (t) => t.purchaseEnrichment?.source === cfg.label,
  ).length

  console.log(
    tag,
    'purchase matches:',
    purchaseMatches.length,
    batchFiltersActive
      ? `(batch-filtered: ${effectivePurchaseMatches.length})`
      : '',
    '(already enriched:',
    already + ')',
  )
  console.log(
    tag,
    'refund links:',
    refundLinks.length,
    insertsOnly || batchFiltersActive
      ? `(skipped in batch/inserts-only: ${effectiveRefundLinks.length})`
      : '',
  )
  console.log(
    tag,
    'purchase confidence:',
    purchaseMatches.reduce((acc, m) => {
      acc[m.confidence] = (acc[m.confidence] ?? 0) + 1
      return acc
    }, /** @type {Record<string, number>} */ ({})),
  )

  for (const m of purchaseMatches.slice(0, 6)) {
    const txn = txns.find((t) => t.id === m.txnId)
    const ret = m.enrichment.returnInfo?.status
    console.log(
      ' ',
      txn?.date,
      '$' + txn?.amount,
      '→',
      m.orderId,
      `(${m.confidence}, Δ${m.dayDiff.toFixed(1)}d${ret ? ', ' + ret : ''})`,
    )
  }
  if (purchaseMatches.length > 6)
    console.log('  …', purchaseMatches.length - 6, 'more purchase matches')

  for (const r of refundLinks.slice(0, 6)) {
    const refundTxn = txns.find((t) => t.id === r.refundTxnId)
    console.log(
      '  refund',
      refundTxn?.date,
      '$' + refundTxn?.amount,
      '↔ order',
      r.orderId,
      r.purchaseTxnId
        ? `(purchase txn ${r.purchaseTxnId.slice(0, 8)}…)`
        : '(no purchase txn)',
    )
  }
  if (refundLinks.length > 6)
    console.log('  …', refundLinks.length - 6, 'more refund links')

  if (dryRun) {
    console.log(
      '\n' + tag,
      'dry-run — pass --apply to write purchase_enrichment',
    )
    if (targetedRepairMode) {
      reportTargetedRepairDryRun(targetedRepairPlan, tag, updatesOnly)
      return
    }
    if (scopedTxnRepair) {
      reportScopedUpdatesOnlyDryRun({
        tag,
        onlyTxnIds,
        userId,
        purchaseMatches,
        txns,
        sourceLabel: cfg.label,
        replace,
        refreshImages,
      })
      return
    }
    const mergeImpact = reportDryRunMergeImpact(
      effectivePurchaseMatches,
      txns,
      replace,
      tag,
      updatesOnly,
      orders,
      insertsOnly,
    )
    if (sourceKey === 'bestbuy') {
      reportBestBuyDryRunSummary({
        tag,
        orders,
        txns,
        purchaseMatches: effectivePurchaseMatches,
        refundLinks: effectiveRefundLinks,
        mergeImpact,
      })
    }
    if (sourceKey === 'target') {
      reportTargetDryRunSummary({
        tag,
        orders,
        txns,
        purchaseMatches: effectivePurchaseMatches,
        refundLinks: effectiveRefundLinks,
        mergeImpact,
        batchFilter,
      })
    }
    if (syncCatalog) {
      const matchedIds = new Set(purchaseMatches.map((m) => m.orderId))
      const unlinked = orders.filter(
        (o) => o.orderId && !matchedIds.has(o.orderId),
      ).length
      console.log(tag, 'would sync', unlinked, 'unlinked orders to catalog')
    }
    if (uploadImages)
      console.log(tag, 'would upload line-item thumbnails to Supabase Storage')
    if (clearStale)
      console.log(
        tag,
        'would clear stale',
        cfg.label,
        'enrichment in txn window',
      )
    return
  }

  if (targetedRepairMode) {
    let repaired = 0
    for (const item of targetedRepairPlan) {
      if (item.action !== 'clear' || !item.after) continue
      const json = escSql(JSON.stringify(stripLinkMetadata(item.after)))
      await runSql(`
        update finance_transactions
        set purchase_enrichment = '${json}'::jsonb,
            updated_at = now()
        where id = '${escSql(item.txnId)}'
          ${userId && !allowCrossUserExplicitRepair ? `and user_id = '${escSql(userId)}'` : ''};
      `)
      repaired++
    }
    console.log(
      '\n' + tag,
      'targeted repair applied:',
      repaired,
      'returnInfo clears | inserts: 0',
    )
    return
  }

  if (clearStale) {
    const cleared = await runSql(`
      update finance_transactions
      set purchase_enrichment = null,
          updated_at = now()
      where ${cfg.merchantSql}
        and txn_date >= '${escSql(txnSince)}'
        and txn_date <= '${escSql(txnUntil)}'
        ${userId ? `and user_id = '${escSql(userId)}'` : ''}${accountScopeSql}
        and purchase_enrichment is not null
        and purchase_enrichment->>'source' = '${escSql(cfg.label)}';
    `)
    console.log(
      tag,
      'cleared stale enrichment rows in window',
      cleared?.length ?? '',
    )
  }

  let skippedImageUpload = 0
  const serviceRoleKey = uploadImages ? resolveServiceRoleKey() : null
  if (uploadImages && !serviceRoleKey) {
    console.warn(
      tag,
      'SUPABASE_SERVICE_ROLE_KEY missing — skipping image upload (run: supabase login)',
    )
    skippedImageUpload = purchaseMatches.length + refundLinks.length
  } else if (serviceRoleKey && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
  }

  async function finalizeEnrichment(txnId, enrichment) {
    const txn = txns.find((t) => t.id === txnId)
    if (uploadImages && serviceRoleKey && txn?.userId) {
      return uploadPurchaseEnrichmentImages(enrichment, {
        userId: txn.userId,
        source: cfg.label,
      })
    }
    return enrichment
  }

  let updatedPurchase = 0
  let updatedRefund = 0
  let updatedPurchaseReturn = 0
  let uploadedImages = 0
  let skippedByReviewPrecedence = 0

  // FINC.PURCHASE.6.a — manual Confirm/Reject on a transaction outranks automated
  // enrichment. Load the precedence index once for every candidate transaction.
  const reviewPrecedence = await fetchReviewPrecedence(
    effectivePurchaseMatches.map((m) => m.txnId),
    userId,
  )

  let gitHead = ''
  try {
    gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    gitHead = ''
  }

  const applyRunId = await startApplyRun(runSql, escSql, {
    userId,
    mode: onlyTxnIds?.length ? 'scoped' : 'broad',
    scope: {
      source: cfg.label,
      onlyTxnIds: onlyTxnIds ?? null,
      insertsOnly,
      updatesOnly,
      ordersFile: ordersPath,
    },
    gitHead,
  })

  // Cross-run one-order-one-charge guard. matchOrdersToPurchaseTxns enforces a
  // 1:1 order↔txn assignment within a single run, but a later run can still link an
  // order that a prior run already attached to a different transaction (e.g. a
  // shadow row, or a genuine split charge). Track which txn already owns each order
  // (from current DB state) so we never fan one order out across two ledger rows.
  const orderOwner = new Map()
  for (const t of txns) {
    const oid = t.purchaseEnrichment?.orderId
    if (oid && t.purchaseEnrichment?.source === cfg.label) orderOwner.set(oid, t.id)
  }
  let skippedDuplicateOrder = 0

  for (const m of effectivePurchaseMatches) {
    const existing = txns.find((t) => t.id === m.txnId)?.purchaseEnrichment
    if (onlyTxnIds && !onlyTxnIds.includes(m.txnId)) continue
    if (!wouldWriteEnrichmentUpdate(existing, updatesOnly)) continue
    if (insertsOnly && existing?.source) continue
    // Order already linked to a different transaction — do not duplicate the link.
    const owner = orderOwner.get(m.orderId)
    if (owner && owner !== m.txnId) {
      skippedDuplicateOrder++
      continue
    }
    // Manual-decision precedence: never overwrite a confirmed pairing, never
    // silently resurface a rejected candidate.
    const gate = purchaseReviewAutomationGate(
      { transactionId: m.txnId, source: cfg.label, externalOrderId: m.orderId },
      reviewPrecedence,
    )
    if (gate.blocked) {
      skippedByReviewPrecedence++
      continue
    }
    if (
      !wouldUpdateEnrichment(
        existing,
        m.enrichment,
        replace,
        refreshImages,
        cfg.label,
      )
    ) {
      continue
    }
    let enrichment = replace
      ? m.enrichment
      : refreshImages && existing?.source === cfg.label
        ? existing
        : mergeEnrichment(existing, m.enrichment)
    enrichment = await finalizeEnrichment(m.txnId, enrichment)
    if (enrichment.lineItems?.some((li) => li.imageStoragePath))
      uploadedImages++
    const json = escSql(JSON.stringify(stripLinkMetadata(enrichment)))
    await runSql(`
      update finance_transactions
      set purchase_enrichment = '${json}'::jsonb,
          updated_at = now()
      where id = '${escSql(m.txnId)}';
    `)
    await logApplyRunItem(runSql, escSql, applyRunId, {
      transactionId: m.txnId,
      action: existing?.source ? 'update' : 'insert',
      before: existing ?? null,
      after: enrichment,
    })
    orderOwner.set(m.orderId, m.txnId)
    updatedPurchase++
  }
  if (skippedDuplicateOrder > 0) {
    console.log(
      tag,
      'skipped (order already linked to another txn):',
      skippedDuplicateOrder,
    )
  }

  for (const r of effectiveRefundLinks) {
    if (onlyTxnIds?.length) continue
    const existingRefund = txns.find(
      (t) => t.id === r.refundTxnId,
    )?.purchaseEnrichment
    const exportOrder = orderById.get(r.orderId)
    const purchaseLineItems = r.purchaseTxnId
      ? txns.find((t) => t.id === r.purchaseTxnId)?.purchaseEnrichment
          ?.lineItems
      : undefined
    const lineItems = exportOrder?.lineItems?.length
      ? exportOrder.lineItems
      : purchaseLineItems
    let refundPayload = mergeEnrichment(existingRefund, {
      ...r.refundEnrichment,
      ...(lineItems?.length ? { lineItems } : {}),
    })
    refundPayload = await finalizeEnrichment(r.refundTxnId, refundPayload)
    const json = escSql(JSON.stringify(stripLinkMetadata(refundPayload)))
    await runSql(`
      update finance_transactions
      set purchase_enrichment = '${json}'::jsonb,
          updated_at = now()
      where id = '${escSql(r.refundTxnId)}';
    `)
    updatedRefund++

    if (r.purchaseTxnId) {
      const existingPurchase = txns.find(
        (t) => t.id === r.purchaseTxnId,
      )?.purchaseEnrichment
      let purchasePayload = mergeEnrichment(
        existingPurchase,
        r.purchaseEnrichment,
      )
      purchasePayload = await finalizeEnrichment(
        r.purchaseTxnId,
        purchasePayload,
      )
      const pjson = escSql(JSON.stringify(stripLinkMetadata(purchasePayload)))
      await runSql(`
        update finance_transactions
        set purchase_enrichment = '${pjson}'::jsonb,
            updated_at = now()
        where id = '${escSql(r.purchaseTxnId)}';
      `)
      updatedPurchaseReturn++
    }
  }

  await finishApplyRun(runSql, escSql, applyRunId, {
    updatedPurchase,
    updatedRefund,
    updatedPurchaseReturn,
    uploadedImages,
    skippedImageUpload,
  })

  console.log(
    '\n' + tag,
    'updated purchase:',
    updatedPurchase,
    '| refund credits:',
    updatedRefund,
    '| purchase return marks:',
    updatedPurchaseReturn,
    '| rows with stored images:',
    uploadedImages,
    skippedByReviewPrecedence > 0
      ? `| skipped (manual review precedence): ${skippedByReviewPrecedence}`
      : '',
    skippedImageUpload > 0
      ? `| image uploads skipped (no service role): ${skippedImageUpload}`
      : '',
  )

  if (onlyTxnIds?.length) {
    console.log(
      tag,
      'scoped txn repair complete:',
      updatedPurchase,
      'purchase row(s) updated | refund credits:',
      updatedRefund,
      '(skipped) | purchase return marks:',
      updatedPurchaseReturn,
      '(skipped)',
    )
  }

  if (syncCatalog && !onlyTxnIds?.length) {
    const catalogUser = await resolveCatalogUserId(userId)
    if (!catalogUser) {
      console.warn(tag, 'catalog: no user_id — skip sync')
    } else {
      await syncMerchantOrderCatalog(
        sourceKey,
        orders,
        purchaseMatches,
        catalogUser,
        tag,
      )
    }
  }
}

main().catch((e) => {
  console.error('[link-purchase] FATAL', e.message)
  process.exit(1)
})
