/**
 * UI adapter for @life-os/finance-enrichment-contract classification rules.
 */
import {
  AMOUNT_TOLERANCE_CENTS,
  buildDuplicateMaps,
  classifyCleanReasons,
  inferSourceView,
  mergeKeyFor,
  resolveDisplayState,
} from '@life-os/finance-enrichment-contract'
import {
  uniqueLineItems,
  type PurchaseEnrichment,
  type PurchaseEnrichmentSource,
} from './purchaseEnrichment'
import { isReturnLikeEnrichment } from './purchaseReturnStatus'
import type { Txn } from './transactions'

export type PurchaseDisplayState =
  | 'clean_enriched'
  | 'matched_review'
  | 'return_refund'
  | 'merchant_only'
  | 'unsupported_source'

export type PurchaseReviewReason =
  | 'unknown_account'
  | 'returned_or_refund_excluded'
  | 'non_clean_status'
  | 'low_or_medium_confidence'
  | 'duplicate_risk'
  | 'missing_items'
  | 'missing_total'
  | 'amount_mismatch'
  | 'source_coverage_gap'
  | 'invalid_source'

export interface EnrichmentDuplicateMaps {
  dupTxnIds: Set<string>
  dupOrderIdCounts: Map<string, number>
  dupMergeKeyCounts: Map<string, number>
}

export interface PurchaseDisplayClassification {
  state: PurchaseDisplayState
  reasons: PurchaseReviewReason[]
}

export interface PurchaseCoverageStats {
  total: number
  enrichedAny: number
  cleanEnriched: number
  cleanItemCount: number
  matchedReview: number
  returnRefund: number
  merchantOnly: number
  cleanBySource: Record<PurchaseEnrichmentSource, number>
}

export interface PurchaseDisplayContext {
  dupMaps: EnrichmentDuplicateMaps
}

function centsFromDollars(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return Math.round(Math.abs(v) * 100)
}

function txnToNormalizedOrder(t: Txn) {
  const e = t.purchaseEnrichment
  if (!e?.source) {
    return {
      transactionId: t.id,
      source: null,
      merchantAccount: t.account || 'Unknown',
    }
  }

  const source = e.source
  const lineItems = e.lineItems || []
  const orderTotalCents = centsFromDollars(e.orderTotal)
  const txnAmountCents = centsFromDollars(t.amount)
  const amountDiffCents =
    orderTotalCents != null && txnAmountCents != null
      ? orderTotalCents - txnAmountCents
      : null
  const sourceView = inferSourceView(
    source,
    e as PurchaseEnrichment & Record<string, unknown>,
  )
  const isInstore =
    source === 'target' &&
    (sourceView === 'in_store' ||
      /^\d{3}-\d{2}-\d{4}-\d{6}$/.test(e.orderId || ''))

  return {
    transactionId: t.id,
    source,
    sourceView,
    merchantAccount: t.account || 'Unknown',
    sourceOrderId: isInstore ? null : e.orderId || null,
    sourceReceiptId: isInstore ? e.orderId || null : null,
    mergeKey: mergeKeyFor(
      source,
      e as PurchaseEnrichment & Record<string, unknown>,
    ),
    status: e.status || 'unknown',
    matchConfidence: e.matchConfidence || 'unknown',
    qualityPass:
      (e as PurchaseEnrichment & { quality?: { pass?: boolean } }).quality
        ?.pass === true,
    itemCount: lineItems.length,
    missingTitles: lineItems.filter((li) => !li.title).length,
    missingQty: lineItems.filter((li) => !li.quantity || li.quantity < 1)
      .length,
    totalCents: orderTotalCents,
    amountDiffCents,
    hasReturnInfo: Boolean(
      e.returnInfo && isReturnLikeEnrichment(e.returnInfo),
    ),
  }
}

/** Build duplicate-detection maps from all loaded transactions. */
export function buildEnrichmentDuplicateMaps(
  txns: Txn[],
): EnrichmentDuplicateMaps {
  const orders = txns
    .filter((t) => t.purchaseEnrichment?.source)
    .map(txnToNormalizedOrder)
  return buildDuplicateMaps(orders) as EnrichmentDuplicateMaps
}

export function buildPurchaseDisplayContext(
  txns: Txn[],
): PurchaseDisplayContext {
  return { dupMaps: buildEnrichmentDuplicateMaps(txns) }
}

export function classifyCleanReasonsForTxn(
  t: Txn,
  dupMaps: EnrichmentDuplicateMaps,
): PurchaseReviewReason[] {
  const order = txnToNormalizedOrder(t)
  if (!order.source) return []
  return classifyCleanReasons(order, dupMaps) as PurchaseReviewReason[]
}

export function classifyPurchaseDisplayState(
  t: Txn,
  context: PurchaseDisplayContext | EnrichmentDuplicateMaps,
): PurchaseDisplayClassification {
  const dupMaps = 'dupMaps' in context ? context.dupMaps : context
  const order = txnToNormalizedOrder(t)

  if (!order.source) {
    return { state: 'merchant_only', reasons: [] }
  }

  // Manual review verdict (FINC.PURCHASE.6.a) is authoritative over the automated
  // classifier: a rejected pairing hides the order entirely; a confirmed pairing is
  // clean (returns stay classified as returns). See hydrateReviewState.
  if (t.reviewState === 'rejected') {
    return { state: 'merchant_only', reasons: [] }
  }

  const reasons = classifyCleanReasons(order, dupMaps) as PurchaseReviewReason[]
  const state = resolveDisplayState(order, reasons) as PurchaseDisplayState

  if (state === 'return_refund') {
    return {
      state,
      reasons: reasons.filter((r) => r !== 'returned_or_refund_excluded'),
    }
  }

  if (t.reviewState === 'confirmed') {
    return { state: 'clean_enriched', reasons: [] }
  }

  return { state, reasons }
}

export function computePurchaseCoverage(
  txns: Txn[],
  context?: PurchaseDisplayContext,
): PurchaseCoverageStats {
  const ctx = context ?? buildPurchaseDisplayContext(txns)
  const stats: PurchaseCoverageStats = {
    total: txns.length,
    enrichedAny: 0,
    cleanEnriched: 0,
    cleanItemCount: 0,
    matchedReview: 0,
    returnRefund: 0,
    merchantOnly: 0,
    cleanBySource: { amazon: 0, bestbuy: 0, target: 0 },
  }

  for (const t of txns) {
    const { state } = classifyPurchaseDisplayState(t, ctx)
    switch (state) {
      case 'clean_enriched':
        stats.cleanEnriched++
        if (t.purchaseEnrichment) {
          stats.cleanItemCount += uniqueLineItems(
            t.purchaseEnrichment.lineItems,
          ).length
          if (t.purchaseEnrichment.source) {
            stats.cleanBySource[t.purchaseEnrichment.source]++
          }
        }
        break
      case 'matched_review':
      case 'unsupported_source':
        stats.matchedReview++
        break
      case 'return_refund':
        stats.returnRefund++
        break
      case 'merchant_only':
        stats.merchantOnly++
        break
    }
    if (t.purchaseEnrichment?.source) stats.enrichedAny++
  }

  return stats
}

/** Stable display order for enrichment sources; also the tie-break order. */
export const COVERAGE_SOURCE_ORDER: readonly PurchaseEnrichmentSource[] = [
  'target',
  'amazon',
  'bestbuy',
]

/** Sources that actually carry item detail, in stable display order. */
export function coveredSources(
  stats: PurchaseCoverageStats,
): PurchaseEnrichmentSource[] {
  return COVERAGE_SOURCE_ORDER.filter((s) => (stats.cleanBySource[s] ?? 0) > 0)
}

/**
 * Sources that actually carry item detail, best-covered first.
 *
 * Callers use this to name the leading merchant in coverage copy. Deriving the
 * ranking beats naming a merchant in the copy itself: the leader changes as
 * coverage shifts, and static copy silently goes stale when it does.
 *
 * Ties fall back to COVERAGE_SOURCE_ORDER so the copy is stable across renders.
 */
export function rankCoverageSources(
  stats: PurchaseCoverageStats,
): PurchaseEnrichmentSource[] {
  return coveredSources(stats).sort(
    (a, b) =>
      (stats.cleanBySource[b] ?? 0) - (stats.cleanBySource[a] ?? 0) ||
      COVERAGE_SOURCE_ORDER.indexOf(a) - COVERAGE_SOURCE_ORDER.indexOf(b),
  )
}

export { AMOUNT_TOLERANCE_CENTS }
