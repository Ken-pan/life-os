/** External purchase context attached to a bank/card transaction (e.g. Amazon order). */

import type { PurchaseReturnInfo } from './purchaseReturnStatus.ts'

export interface PurchaseLineItem {
  title: string
  price?: number
  quantity?: number
  detailUrl?: string
  /** Product thumbnail from merchant order page (Amazon media CDN, etc.) */
  imageUrl?: string
  /** Supabase Storage object path (finance-purchase-images bucket). */
  imageStoragePath?: string
  asin?: string
}

export type PurchaseEnrichmentSource = 'amazon' | 'bestbuy' | 'target'

/** Link-time Amazon returnInfo merge signal; not persisted to DB. */
export type ReturnInfoDecision = 'present' | 'absent_verified' | 'unknown'

export interface PurchaseEnrichment {
  source: PurchaseEnrichmentSource
  orderId?: string
  orderDate?: string
  orderTotal?: number
  status?: string
  detailUrl?: string
  lineItems?: PurchaseLineItem[]
  /** Return / refund linkage parsed from merchant order or matched from card credit. */
  returnInfo?: PurchaseReturnInfo
  /** Amazon-only merge hint; stripped before DB write. */
  returnInfoDecision?: ReturnInfoDecision
  matchConfidence?: 'high' | 'medium' | 'low'
  matchedAt?: string
}

/** Remove link-time metadata before persisting purchase_enrichment JSONB. */
export function stripLinkMetadata(
  enrichment: PurchaseEnrichment,
): PurchaseEnrichment {
  const { returnInfoDecision: _d, ...rest } = enrichment
  return rest
}

/**
 * Merge incoming merchant enrichment into an existing purchase_enrichment row.
 * Amazon uses returnInfoDecision to clear verified-absent stale returnInfo.
 */
export function mergePurchaseEnrichment(
  existing: PurchaseEnrichment | null | undefined,
  incoming: PurchaseEnrichment,
): PurchaseEnrichment {
  if (!existing?.source) return incoming

  const merged: PurchaseEnrichment = {
    ...existing,
    ...incoming,
    lineItems: incoming.lineItems?.length
      ? incoming.lineItems
      : existing.lineItems,
  }

  if (incoming.source === 'amazon' && incoming.returnInfoDecision) {
    switch (incoming.returnInfoDecision) {
      case 'present':
        merged.returnInfo = incoming.returnInfo
        break
      case 'absent_verified':
        merged.returnInfo = undefined
        break
      case 'unknown':
        merged.returnInfo = existing.returnInfo ?? incoming.returnInfo
        break
    }
  } else {
    merged.returnInfo = incoming.returnInfo ?? existing.returnInfo
  }

  return merged
}

export type ReturnInfoMergeAction = 'clear' | 'update' | 'preserve' | 'none'

export function classifyReturnInfoMerge(
  existing: PurchaseEnrichment | null | undefined,
  incoming: PurchaseEnrichment,
  replace = false,
): ReturnInfoMergeAction {
  const merged = replace
    ? incoming
    : mergePurchaseEnrichment(existing, incoming)
  const before = existing?.returnInfo
  const after = merged.returnInfo

  if (before && !after) return 'clear'
  if (
    after &&
    (!before ||
      before.status !== after.status ||
      before.refundAmount !== after.refundAmount)
  ) {
    return 'update'
  }
  if (before && after) return 'preserve'
  return 'none'
}

/** True when Amazon enrichment has delivery-like status plus returnInfo (likely stale). */
export function isStaleFalseAmazonReturnInfo(
  enrichment: PurchaseEnrichment | null | undefined,
): boolean {
  if (enrichment?.source !== 'amazon' || !enrichment.returnInfo) return false
  return /deliver|arriv|ship|purchas/i.test(enrichment.status || '')
}

/**
 * Clear returnInfo only — preserves all other enrichment fields.
 * Returns null when repair should not run.
 */
export function repairStaleReturnInfoOnly(
  existing: PurchaseEnrichment,
  decision: ReturnInfoDecision,
): PurchaseEnrichment | null {
  if (decision !== 'absent_verified') return null
  if (!existing.returnInfo) return null
  return { ...existing, returnInfo: undefined }
}

const ENRICHMENT_COMPARE_FIELDS = [
  'orderId',
  'orderDate',
  'orderTotal',
  'status',
  'detailUrl',
  'lineItems',
  'returnInfo',
  'matchConfidence',
  'matchedAt',
] as const

export function enrichmentFieldChanges(
  before: PurchaseEnrichment,
  after: PurchaseEnrichment,
): string[] {
  const changed: string[] = []
  for (const field of ENRICHMENT_COMPARE_FIELDS) {
    if (
      JSON.stringify(before[field]) !== JSON.stringify(after[field])
    ) {
      changed.push(field)
    }
  }
  return changed
}

export type TargetedRepairAction =
  | 'clear'
  | 'skip_insert'
  | 'skip_no_existing'
  | 'skip_no_raw_order'
  | 'skip_decision'
  | 'skip_no_stale'
  | 'skip_not_in_txns'
  | 'skip_cross_user'

export interface TargetedRepairPlanItem {
  txnId: string
  orderId: string
  action: TargetedRepairAction
  before?: PurchaseEnrichment
  after?: PurchaseEnrichment
  fieldsChanged?: string[]
  decision?: ReturnInfoDecision
  actualUserId?: string
}

export interface TargetedRepairOptions {
  updatesOnly: boolean
  clearStaleReturnInfoOnly: boolean
  onlyTxnIds: string[]
  /** Required user scope; explicit txn ids must belong to this user unless overridden. */
  scopedUserId?: string | null
  allowCrossUserExplicitRepair?: boolean
}

export function buildTargetedStaleReturnInfoRepairPlan(
  txns: Array<{
    id: string
    userId?: string
    purchaseEnrichment?: PurchaseEnrichment | null
  }>,
  orderDecisionByOrderId: Map<string, ReturnInfoDecision>,
  options: TargetedRepairOptions,
  crossUserLookup?: Map<string, string>,
  crossUserOrderLookup?: Map<string, string>,
): TargetedRepairPlanItem[] {
  const {
    updatesOnly,
    clearStaleReturnInfoOnly,
    onlyTxnIds,
    scopedUserId,
    allowCrossUserExplicitRepair = false,
  } = options
  const plans: TargetedRepairPlanItem[] = []

  for (const txnId of onlyTxnIds) {
    const txn = txns.find((t) => t.id === txnId)
    if (!txn) {
      const actualUserId = crossUserLookup?.get(txnId)
      if (scopedUserId && actualUserId && actualUserId !== scopedUserId) {
        plans.push({
          txnId,
          orderId: crossUserOrderLookup?.get(txnId) || '',
          action: 'skip_cross_user',
          actualUserId,
        })
      } else {
        plans.push({
          txnId,
          orderId: '',
          action: 'skip_not_in_txns',
        })
      }
      continue
    }

    if (
      scopedUserId &&
      txn.userId &&
      txn.userId !== scopedUserId &&
      !allowCrossUserExplicitRepair
    ) {
      plans.push({
        txnId,
        orderId: txn.purchaseEnrichment?.orderId || '',
        action: 'skip_cross_user',
        actualUserId: txn.userId,
      })
      continue
    }

    const existing = txn.purchaseEnrichment
    if (!existing?.source) {
      plans.push({
        txnId,
        orderId: '',
        action: updatesOnly ? 'skip_insert' : 'skip_no_existing',
      })
      continue
    }

    if (existing.source !== 'amazon') {
      plans.push({
        txnId,
        orderId: existing.orderId || '',
        action: 'skip_no_existing',
      })
      continue
    }

    const orderId = existing.orderId || ''
    if (!orderId || !orderDecisionByOrderId.has(orderId)) {
      plans.push({
        txnId,
        orderId,
        action: 'skip_no_raw_order',
      })
      continue
    }

    const decision = orderDecisionByOrderId.get(orderId)!
    if (clearStaleReturnInfoOnly && decision !== 'absent_verified') {
      plans.push({
        txnId,
        orderId,
        action: 'skip_decision',
        decision,
      })
      continue
    }

    const after = repairStaleReturnInfoOnly(existing, decision)
    if (!after) {
      plans.push({
        txnId,
        orderId,
        action: 'skip_no_stale',
        decision,
      })
      continue
    }

    plans.push({
      txnId,
      orderId,
      action: 'clear',
      before: existing,
      after,
      fieldsChanged: enrichmentFieldChanges(existing, after),
      decision,
    })
  }

  return plans
}

/** Block new enrichment writes when updatesOnly and row has no existing source. */
export function wouldWriteEnrichmentUpdate(
  existing: PurchaseEnrichment | null | undefined,
  updatesOnly: boolean,
): boolean {
  if (updatesOnly && !existing?.source) return false
  return true
}

const PURCHASE_IMAGE_BUCKET = 'finance-purchase-images'

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
}

function normalizeLineItem(raw: unknown): PurchaseLineItem | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const title =
    typeof o.title === 'string' ? decodeHtmlEntities(o.title.trim()) : ''
  if (!title || title.length < 2) return undefined
  return {
    title: title.slice(0, 300),
    price: toNumber(o.price),
    quantity: toNumber(o.quantity) ?? undefined,
    detailUrl: typeof o.detailUrl === 'string' ? o.detailUrl : undefined,
    imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : undefined,
    imageStoragePath:
      typeof o.imageStoragePath === 'string' ? o.imageStoragePath : undefined,
    asin: typeof o.asin === 'string' ? o.asin : undefined,
  }
}

/** Resolve thumbnail URL for ledger UI (merchant CDN or Supabase Storage). */
export function lineItemImageSrc(item: PurchaseLineItem): string | undefined {
  if (item.imageUrl?.trim()) return item.imageUrl.trim()
  const path = item.imageStoragePath?.trim()
  if (!path) return undefined
  const base = (
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_SUPABASE_URL as string | undefined)
      : undefined
  )?.replace(/\/$/, '')
  if (!base) return undefined
  return `${base}/storage/v1/object/public/${PURCHASE_IMAGE_BUCKET}/${path.replace(/^\//, '')}`
}

export function hasPurchaseEnrichment(t: {
  purchaseEnrichment?: PurchaseEnrichment | null
}): t is { purchaseEnrichment: PurchaseEnrichment } {
  return Boolean(t.purchaseEnrichment?.source)
}

export function purchaseEnrichmentFromRow(
  raw: unknown,
): PurchaseEnrichment | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const source = o.source
  if (source !== 'amazon' && source !== 'bestbuy' && source !== 'target') {
    return undefined
  }

  const lineItems = Array.isArray(o.lineItems)
    ? o.lineItems.map(normalizeLineItem).filter(Boolean)
    : undefined

  let returnInfo = o.returnInfo as PurchaseReturnInfo | undefined
  if (returnInfo && typeof returnInfo === 'object') {
    returnInfo = {
      ...returnInfo,
      refundAmount:
        toNumber(returnInfo.refundAmount) ?? returnInfo.refundAmount,
    }
  }

  return {
    source,
    orderId: typeof o.orderId === 'string' ? o.orderId : undefined,
    orderDate: typeof o.orderDate === 'string' ? o.orderDate : undefined,
    orderTotal: toNumber(o.orderTotal),
    status: typeof o.status === 'string' ? o.status : undefined,
    detailUrl: typeof o.detailUrl === 'string' ? o.detailUrl : undefined,
    lineItems: lineItems?.length
      ? (lineItems as PurchaseLineItem[])
      : undefined,
    returnInfo,
    matchConfidence:
      o.matchConfidence === 'high' ||
      o.matchConfidence === 'medium' ||
      o.matchConfidence === 'low'
        ? o.matchConfidence
        : undefined,
    matchedAt: typeof o.matchedAt === 'string' ? o.matchedAt : undefined,
  }
}

export function uniqueLineItems(
  items: PurchaseLineItem[] | undefined,
): PurchaseLineItem[] {
  if (!items?.length) return []
  const seen = new Set<string>()
  const out: PurchaseLineItem[] = []
  for (const item of items) {
    const key = item.asin || item.detailUrl || item.title
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out.slice(0, 20)
}
