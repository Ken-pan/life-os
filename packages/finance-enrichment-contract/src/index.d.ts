export type PurchaseEnrichmentSource = 'amazon' | 'bestbuy' | 'target'

export type SourceView =
  | 'data_export'
  | 'in_store'
  | 'online'
  | 'receipt'
  | 'unknown'

export type DisplayState =
  | 'clean_enriched'
  | 'matched_review'
  | 'return_refund'
  | 'merchant_only'
  | 'unsupported_source'

export type CleanReason =
  | 'amount_mismatch'
  | 'cross_user_or_placeholder'
  | 'duplicate_risk'
  | 'invalid_source'
  | 'low_or_medium_confidence'
  | 'missing_items'
  | 'missing_total'
  | 'non_clean_status'
  | 'returned_or_refund_excluded'
  | 'source_coverage_gap'
  | 'unknown_account'

export interface NormalizedPurchaseOrder {
  transactionId?: string | null
  userId?: string | null
  source?: PurchaseEnrichmentSource | string | null
  sourceView?: SourceView | string | null
  merchantAccount?: string | null
  sourceOrderId?: string | null
  sourceReceiptId?: string | null
  mergeKey?: string | null
  status?: string | null
  matchConfidence?: string | null
  qualityPass?: boolean
  itemCount?: number
  missingTitles?: number
  missingQty?: number
  totalCents?: number | null
  amountDiffCents?: number | null
  hasReturnInfo?: boolean
}

export interface DuplicateMaps {
  dupTxnIds: Set<string>
  dupOrderIdCounts: Map<string, number>
  dupMergeKeyCounts: Map<string, number>
}

export interface ClassifyOptions {
  checkCrossUser?: boolean
  canonicalUserId?: string
  placeholderUserId?: string
}

export const SUPPORTED_SOURCES: Set<PurchaseEnrichmentSource>
export const CLEAN_STATUSES: Set<string>
export const RETURN_STATUSES: RegExp
export const AMOUNT_TOLERANCE_CENTS: 1

export function isCleanPurchaseStatus(status: unknown): boolean
export function inferSourceView(
  source: string,
  enrichment: object,
): SourceView | string
export function mergeKeyFor(
  source: string,
  enrichment: object,
): string
export function isReturnedOrCancelled(order: NormalizedPurchaseOrder): boolean
export function classifyCleanReasons(
  order: NormalizedPurchaseOrder,
  dupMaps: DuplicateMaps,
  opts?: ClassifyOptions,
): CleanReason[]
export function resolveDisplayState(
  order: NormalizedPurchaseOrder,
  reasons: readonly string[],
): DisplayState
export function buildDuplicateMaps(
  orders: readonly NormalizedPurchaseOrder[],
): DuplicateMaps
