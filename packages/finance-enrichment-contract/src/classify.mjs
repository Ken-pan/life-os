/**
 * Single source of truth for clean vs review classification.
 * Consumed by:
 * - apps/finance/src/engine/purchaseEnrichmentDisplay.ts (UI)
 * - tools/web-state-devtools/bridge/scripts/merchant-read-model-v1.mjs (read model)
 */

export const SUPPORTED_SOURCES = new Set(['amazon', 'bestbuy', 'target'])

export const CLEAN_STATUSES = new Set([
  'purchased',
  'delivered',
  'shipped',
  'completed',
  'picked_up',
  'ready_for_pickup',
])

export const RETURN_STATUSES = /return|refund|cancel/i
export const AMOUNT_TOLERANCE_CENTS = 1

export function isCleanPurchaseStatus(status) {
  const s = String(status || '').toLowerCase().trim()
  if (!s) return true
  if (RETURN_STATUSES.test(s)) return false
  if (CLEAN_STATUSES.has(s)) return true
  if (/deliver|shipped|ship|purchas|arrived|complete/.test(s) && !RETURN_STATUSES.test(s)) {
    return true
  }
  return false
}

export function inferSourceView(source, e) {
  if (e.sourceView) return e.sourceView
  const url = e.detailUrl || ''
  if (source === 'target' && /\/orders\/stores\//.test(url)) return 'in_store'
  if (source === 'target' && e.orderId && /^\d{3}-\d{2}-\d{4}-\d{6}$/.test(e.orderId)) {
    return 'in_store'
  }
  if (source === 'bestbuy' && /in store/i.test(e.channel || '')) return 'in_store'
  if (source === 'bestbuy' && e.orderId && /^\d{3}-\d{2}-\d{4}-\d{6}$/.test(e.orderId)) {
    return 'receipt'
  }
  if (source === 'bestbuy' && e.orderId && /^BBY/i.test(e.orderId)) return 'online'
  if (source === 'amazon' && e.dataExport) return 'data_export'
  if (source === 'amazon') return 'online'
  if (source === 'target' || source === 'bestbuy') return 'online'
  return 'unknown'
}

export function mergeKeyFor(source, e) {
  return (
    e.detailUrl ||
    (source === 'target' && e.orderId?.match(/^\d{3}-\d{2}-\d{4}-\d{6}$/)
      ? `target:in_store:${e.orderId}`
      : `${source}:${e.orderId || 'unknown'}`)
  )
}

export function isReturnedOrCancelled(order) {
  if (order.hasReturnInfo) return true
  if (RETURN_STATUSES.test(order.status || '')) return true
  return false
}

/**
 * @param {object} order normalized order row
 * @param {object} dupMaps { dupTxnIds: Set, dupOrderIdCounts: Map, dupMergeKeyCounts: Map }
 * @param {object} [opts]
 * @param {boolean} [opts.checkCrossUser] read-model only
 * @param {string} [opts.canonicalUserId]
 * @param {string} [opts.placeholderUserId]
 */
export function classifyCleanReasons(order, dupMaps, opts = {}) {
  const reasons = []
  const {
    checkCrossUser = false,
    canonicalUserId = '',
    placeholderUserId = '',
  } = opts

  if (checkCrossUser) {
    if (order.userId !== canonicalUserId) reasons.push('cross_user_or_placeholder')
    if (order.userId === placeholderUserId) reasons.push('cross_user_or_placeholder')
  }

  if (!order.source || !SUPPORTED_SOURCES.has(order.source)) {
    reasons.push('invalid_source')
  }
  if (order.merchantAccount === 'Unknown') reasons.push('unknown_account')
  if (isReturnedOrCancelled(order)) reasons.push('returned_or_refund_excluded')
  if (!isCleanPurchaseStatus(order.status)) {
    if (RETURN_STATUSES.test(order.status || '')) {
      reasons.push('returned_or_refund_excluded')
    } else {
      reasons.push('non_clean_status')
    }
  }
  const conf = order.matchConfidence
  if (conf !== 'high' && !order.qualityPass) reasons.push('low_or_medium_confidence')
  if (order.transactionId && dupMaps.dupTxnIds?.has(order.transactionId)) {
    reasons.push('duplicate_risk')
  }
  const oidKey = `${order.source}:${order.sourceOrderId || order.sourceReceiptId || ''}`
  if (order.sourceOrderId || order.sourceReceiptId) {
    if ((dupMaps.dupOrderIdCounts?.get(oidKey) ?? 0) > 1) reasons.push('duplicate_risk')
  }
  if (order.mergeKey && (dupMaps.dupMergeKeyCounts?.get(order.mergeKey) ?? 0) > 1) {
    reasons.push('duplicate_risk')
  }
  if (order.itemCount <= 0 || order.missingTitles > 0 || order.missingQty > 0) {
    reasons.push('missing_items')
  }
  if (order.totalCents == null) reasons.push('missing_total')
  if (
    order.amountDiffCents != null &&
    Math.abs(order.amountDiffCents) > AMOUNT_TOLERANCE_CENTS
  ) {
    reasons.push('amount_mismatch')
  }
  if (order.sourceView === 'unknown') reasons.push('source_coverage_gap')

  return [...new Set(reasons)]
}

/**
 * @returns {'clean_enriched'|'matched_review'|'return_refund'|'merchant_only'|'unsupported_source'}
 */
export function resolveDisplayState(order, reasons) {
  if (!order.source) return 'merchant_only'
  if (!SUPPORTED_SOURCES.has(order.source)) return 'unsupported_source'

  const isReturn =
    reasons.includes('returned_or_refund_excluded') || isReturnedOrCancelled(order)

  if (isReturn) return 'return_refund'
  if (reasons.length === 0) return 'clean_enriched'
  return 'matched_review'
}

export function buildDuplicateMaps(orders) {
  const txnIdCounts = new Map()
  const dupOrderIdCounts = new Map()
  const dupMergeKeyCounts = new Map()

  for (const o of orders) {
    if (!o.source) continue
    if (o.transactionId) {
      txnIdCounts.set(o.transactionId, (txnIdCounts.get(o.transactionId) ?? 0) + 1)
    }
    const oidKey = `${o.source}:${o.sourceOrderId || o.sourceReceiptId || ''}`
    if (o.sourceOrderId || o.sourceReceiptId) {
      dupOrderIdCounts.set(oidKey, (dupOrderIdCounts.get(oidKey) ?? 0) + 1)
    }
    if (o.mergeKey) {
      dupMergeKeyCounts.set(o.mergeKey, (dupMergeKeyCounts.get(o.mergeKey) ?? 0) + 1)
    }
  }

  const dupTxnIds = new Set()
  for (const [id, count] of txnIdCounts) {
    if (count > 1) dupTxnIds.add(id)
  }

  return { dupTxnIds, dupOrderIdCounts, dupMergeKeyCounts }
}
