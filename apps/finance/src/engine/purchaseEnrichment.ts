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
  matchConfidence?: 'high' | 'medium' | 'low'
  matchedAt?: string
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
