import type {
  PurchaseEnrichment,
  PurchaseLineItem,
  ReturnInfoDecision,
} from './purchaseEnrichment'
import { uniqueLineItems } from './purchaseEnrichment'
import type { PurchaseReturnInfo } from './purchaseReturnStatus'
import {
  parseMoney,
  parseMerchantDate,
  parseReturnInfoFromMerchantStatus,
  isRefundCreditTxn,
} from './purchaseReturnStatus'
import { deriveAmazonReturnInfoDecision } from '../parsers/amazon-orders-parser.mjs'
import {
  bestBuyReceiptIdEncodedDate,
  isPollutedInStoreReturnDate,
  parseVisibleDateText,
} from '../parsers/bestbuy-orders-parser.mjs'

export interface MerchantOrderRecord {
  orderId?: string
  orderDate?: string
  /** ISO purchase date from normalized export (`YYYY-MM-DD`). */
  orderDateIso?: string
  orderDateRaw?: string
  orderDateSource?: 'visible_text' | 'receipt_id' | 'inferred' | 'unknown'
  orderTotal?: string | number
  status?: string
  statusDate?: string
  channel?: string
  /** Harvest view: `online` | `in_store` (legacy exports may use `instore`). */
  sourceView?: string
  storeName?: string
  detailUrl?: string
  lineItems?: Array<{
    title?: string
    price?: string | number
    quantity?: number
    detailUrl?: string
    imageUrl?: string
    asin?: string
  }>
  returnInfo?: PurchaseReturnInfo
  /** Amazon export: explicit returnInfo merge decision. */
  returnInfoDecision?: ReturnInfoDecision
  returnEvidenceText?: string
}

export interface PurchaseMatchTxn {
  id: string
  date: string
  amount: number
  merchant?: string
  flow?: string
  purchaseEnrichment?: PurchaseEnrichment | null
}

export interface PurchaseMatchResult {
  txnId: string
  orderId: string
  confidence: 'high' | 'medium' | 'low'
  dayDiff: number
  amountDiff: number
  enrichment: PurchaseEnrichment
}

export interface RefundLinkResult {
  refundTxnId: string
  purchaseTxnId: string
  orderId: string
  refundEnrichment: PurchaseEnrichment
  purchaseEnrichment: PurchaseEnrichment
}

export interface MatchOrdersOptions {
  merchantRe: RegExp
  maxDayDiff?: number
  maxAmountDiff?: number
  isPurchaseTxn?: (t: PurchaseMatchTxn) => boolean
  minConfidence?: 'high' | 'medium' | 'low'
}

function dayDiff(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000
}

/**
 * Best Buy in-store order ids encode the purchase date in the tail as `-MMDDYY`
 * (e.g. `470-70-6673-041526` → 2026-04-15). The scraped orderDate/statusDate for
 * these are unreliable (they fall back to the harvest day), so this is the most
 * trustworthy anchor for matching in-store charges. Online ids (`BBY01-807…`) do
 * not match this shape and are left alone.
 */
/** @deprecated alias — prefer bestBuyReceiptIdEncodedDate from parser. */
export function bestBuyInStoreOrderDate(
  orderId: string | undefined,
): string | undefined {
  return bestBuyReceiptIdEncodedDate(orderId)
}

function bestBuyCanonicalOrderDate(
  order: MerchantOrderRecord,
): string | undefined {
  if (order.orderDateIso) return order.orderDateIso
  const polluted = isPollutedInStoreReturnDate(order)
  if (!polluted && order.orderDate) {
    const visible = parseVisibleDateText(order.orderDate)
    if (visible) return visible
  }
  return bestBuyReceiptIdEncodedDate(order.orderId)
}

function isTargetInStoreView(order: MerchantOrderRecord): boolean {
  return (
    /in store/i.test(order.channel ?? '') ||
    order.sourceView === 'in_store' ||
    order.sourceView === 'instore'
  )
}

/** Best date anchor for card charge ↔ merchant order (charge usually on/after fulfillment). */
export function effectiveOrderDate(
  source: PurchaseEnrichment['source'],
  order: MerchantOrderRecord,
): string | undefined {
  const orderDate = parseMerchantDate(order.orderDate)
  const statusDate = parseMerchantDate(order.statusDate)
  const status = order.status ?? ''

  if (source === 'bestbuy') {
    const isInStore =
      /in store/i.test(order.channel ?? '') ||
      /purchased in store/i.test(status)

    if (isInStore) {
      if (isPollutedInStoreReturnDate(order)) {
        const encoded = bestBuyReceiptIdEncodedDate(order.orderId)
        if (encoded) return encoded
      } else if (/purchased in store/i.test(status) && statusDate) {
        // Charge posts on pickup/purchase day, not the earlier "order placed" line.
        return statusDate
      }
    }

    const canonical = bestBuyCanonicalOrderDate(order)
    if (canonical) return canonical

    if (isInStore) {
      const encoded = bestBuyReceiptIdEncodedDate(order.orderId)
      if (encoded) return encoded
    }
    if (
      /in store|purchased in store|picked up|delivered|returned/i.test(
        status,
      ) ||
      /in store/i.test(order.channel ?? '')
    ) {
      return statusDate ?? orderDate
    }
    return orderDate ?? statusDate
  }

  if (source === 'target') {
    if (isTargetInStoreView(order)) {
      return orderDate ?? statusDate
    }
    if (/delivered|picked up|shipped|ready for pickup|returned/i.test(status)) {
      return statusDate ?? orderDate
    }
    return orderDate ?? statusDate
  }

  return orderDate ?? statusDate
}

/** Scale tolerance for tax / rounding / coupon drift. */
export function amountTolerance(
  amount: number,
  source: PurchaseEnrichment['source'],
): number {
  const pct = source === 'amazon' ? 0.008 : source === 'target' ? 0.01 : 0.012
  const cap = source === 'amazon' ? 0.85 : source === 'target' ? 1.5 : 2.5
  return Math.max(0.02, Math.min(amount * pct, cap))
}

/** Lower is better. Prefer exact amount + charge shortly after order date. */
export function matchScore(
  txnDate: string,
  orderDate: string,
  amountDiff: number,
  maxDayDiff: number,
): number {
  const days =
    (new Date(txnDate).getTime() - new Date(orderDate).getTime()) / 86_400_000
  let dateCost: number
  if (days >= 0 && days <= maxDayDiff) {
    dateCost = days * 1.5
  } else if (days >= -2 && days < 0) {
    dateCost = Math.abs(days) * 4 + 4
  } else if (days < -2) {
    dateCost = 120 + Math.abs(days) * 10
  } else {
    dateCost = 120 + (days - maxDayDiff) * 10
  }
  return amountDiff * 10_000 + dateCost
}

function confidenceFor(
  txnDate: string,
  orderDate: string,
  amountDiff: number,
  maxAmountDiff: number,
): 'high' | 'medium' | 'low' {
  const dd = dayDiff(txnDate, orderDate)
  const rel = maxAmountDiff > 0 ? amountDiff / maxAmountDiff : amountDiff
  if (dd <= 2 && rel <= 0.05) return 'high'
  if (dd <= 7 && rel <= 0.25) return 'medium'
  return 'low'
}

const CONF_RANK = { high: 3, medium: 2, low: 1 } as const

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

export function enrichmentFromOrder(
  source: PurchaseEnrichment['source'],
  order: MerchantOrderRecord,
  confidence: PurchaseMatchResult['confidence'],
): PurchaseEnrichment {
  const lineItems: PurchaseLineItem[] = uniqueLineItems(
    (order.lineItems ?? [])
      .filter((li) => li.title && li.title.length > 2)
      .filter(
        (li) =>
          !/^(delivered|returned|canceled|cancelled|picked up|purchased in store)$/i.test(
            String(li.title ?? '').trim(),
          ),
      )
      .map((li) => ({
        title: decodeHtmlEntities(String(li.title)).slice(0, 300),
        price: parseMoney(li.price) ?? undefined,
        quantity: li.quantity,
        detailUrl: li.detailUrl,
        imageUrl: li.imageUrl,
        asin: li.asin,
      })),
  )

  let returnInfo =
    order.returnInfo ??
    parseReturnInfoFromMerchantStatus(order.status, {
      statusDate: order.statusDate,
      orderTotal: order.orderTotal,
    })

  let returnInfoDecision: ReturnInfoDecision | undefined
  if (source === 'amazon') {
    returnInfoDecision =
      order.returnInfoDecision ??
      deriveAmazonReturnInfoDecision({
        status: order.status,
        returnInfo,
        returnEvidenceText: order.returnEvidenceText,
      })
    if (returnInfoDecision === 'absent_verified') {
      returnInfo = undefined
    }
  }

  return {
    source,
    orderId: order.orderId,
    orderDate:
      (source === 'bestbuy' ? bestBuyCanonicalOrderDate(order) : undefined) ??
      parseMerchantDate(order.orderDate) ??
      undefined,
    orderTotal: parseMoney(order.orderTotal) ?? undefined,
    status: order.status,
    detailUrl: order.detailUrl,
    lineItems,
    returnInfo,
    returnInfoDecision,
    matchConfidence: confidence,
    matchedAt: new Date().toISOString(),
  }
}

/** Greedy one-to-one: purchase charge ↔ order (global best score). */
export function matchOrdersToPurchaseTxns(
  source: PurchaseEnrichment['source'],
  orders: MerchantOrderRecord[],
  txns: PurchaseMatchTxn[],
  options: MatchOrdersOptions,
): PurchaseMatchResult[] {
  const maxDayDiff = options.maxDayDiff ?? (source === 'amazon' ? 12 : 21)
  const minConfidence = options.minConfidence ?? 'low'
  const isPurchase =
    options.isPurchaseTxn ?? ((t) => t.amount > 0 && !isRefundCreditTxn(t))

  const prepared = orders
    .map((o) => {
      const orderTotal = parseMoney(o.orderTotal)
      const matchDate = effectiveOrderDate(source, o)
      return {
        order: o,
        orderId: o.orderId ?? '',
        matchDate,
        orderTotal,
        amountTol:
          orderTotal != null ? amountTolerance(orderTotal, source) : 0.02,
      }
    })
    .filter(
      (o) =>
        o.orderId && o.matchDate && o.orderTotal != null && o.orderTotal > 0,
    )

  const candidates: Array<{
    txnId: string
    orderId: string
    score: number
    dayDiff: number
    amountDiff: number
    confidence: PurchaseMatchResult['confidence']
    order: MerchantOrderRecord
  }> = []

  for (const txn of txns) {
    if (!txn.id || !options.merchantRe.test(txn.merchant ?? '')) continue
    if (!isPurchase(txn)) continue
    const amt = Math.abs(txn.amount)

    for (const o of prepared) {
      const maxAmountDiff = options.maxAmountDiff ?? o.amountTol
      const amountDiff = Math.abs(o.orderTotal! - amt)
      if (amountDiff > maxAmountDiff) continue
      const dd = dayDiff(txn.date, o.matchDate!)
      if (dd > maxDayDiff) continue
      const confidence = confidenceFor(
        txn.date,
        o.matchDate!,
        amountDiff,
        maxAmountDiff,
      )
      if (CONF_RANK[confidence] < CONF_RANK[minConfidence]) continue
      candidates.push({
        txnId: txn.id,
        orderId: o.orderId,
        score: matchScore(txn.date, o.matchDate!, amountDiff, maxDayDiff),
        dayDiff: dd,
        amountDiff,
        confidence,
        order: o.order,
      })
    }
  }

  candidates.sort((a, b) => a.score - b.score)

  const usedTxn = new Set<string>()
  const usedOrder = new Set<string>()
  const results: PurchaseMatchResult[] = []

  for (const c of candidates) {
    if (usedTxn.has(c.txnId) || usedOrder.has(c.orderId)) continue
    usedTxn.add(c.txnId)
    usedOrder.add(c.orderId)
    results.push({
      txnId: c.txnId,
      orderId: c.orderId,
      confidence: c.confidence,
      dayDiff: c.dayDiff,
      amountDiff: c.amountDiff,
      enrichment: enrichmentFromOrder(source, c.order, c.confidence),
    })
  }

  return results
}

/** Link refund credits to prior purchase orders (returned/cancelled/refunded). */
export function matchRefundCreditsToOrders(
  source: PurchaseEnrichment['source'],
  orders: MerchantOrderRecord[],
  txns: PurchaseMatchTxn[],
  purchaseMatches: PurchaseMatchResult[],
  options: {
    merchantRe: RegExp
    maxDayDiff?: number
    maxAmountDiff?: number
  } = {
    merchantRe: /amazon/i,
  },
): RefundLinkResult[] {
  const maxDayDiff = options.maxDayDiff ?? 60
  const maxAmountDiff = options.maxAmountDiff ?? 0.05

  const purchaseTxnByOrder = new Map(
    purchaseMatches.map((m) => [m.orderId, m.txnId]),
  )

  const returnOrders = orders
    .map((o) => {
      const info =
        o.returnInfo ??
        parseReturnInfoFromMerchantStatus(o.status, {
          statusDate: o.statusDate,
          orderTotal: o.orderTotal,
        })
      if (
        !info ||
        !['returned', 'refunded', 'cancelled'].includes(info.status)
      ) {
        return null
      }
      return {
        order: o,
        orderId: o.orderId ?? '',
        orderDate:
          parseMerchantDate(o.statusDate) ?? effectiveOrderDate(source, o),
        refundAmount: info.refundAmount ?? parseMoney(o.orderTotal) ?? null,
        returnInfo: info,
      }
    })
    .filter(Boolean) as Array<{
    order: MerchantOrderRecord
    orderId: string
    orderDate?: string
    refundAmount: number | null
    returnInfo: PurchaseReturnInfo
  }>

  const refundTxns = txns.filter(
    (t) =>
      t.id && options.merchantRe.test(t.merchant ?? '') && isRefundCreditTxn(t),
  )

  const links: RefundLinkResult[] = []
  const usedRefund = new Set<string>()

  for (const txn of refundTxns) {
    const credit = Math.abs(txn.amount)
    let best: (typeof returnOrders)[0] | null = null
    let bestScore = Infinity

    for (const ro of returnOrders) {
      if (!ro.refundAmount || ro.refundAmount <= 0) continue
      const tol = amountTolerance(ro.refundAmount, source)
      const amountDiff = Math.abs(ro.refundAmount - credit)
      if (amountDiff > Math.max(maxAmountDiff, tol)) continue
      if (!ro.orderDate) continue
      const dd = dayDiff(txn.date, ro.orderDate)
      if (dd > maxDayDiff) continue
      const score = matchScore(txn.date, ro.orderDate, amountDiff, maxDayDiff)
      if (score < bestScore) {
        bestScore = score
        best = ro
      }
    }

    if (!best || usedRefund.has(txn.id)) continue
    usedRefund.add(txn.id)

    const purchaseTxnId = purchaseTxnByOrder.get(best.orderId) ?? ''
    const refundEnrichment: PurchaseEnrichment = {
      source,
      orderId: best.orderId,
      orderDate:
        (source === 'bestbuy'
          ? bestBuyCanonicalOrderDate(best.order)
          : undefined) ?? parseMerchantDate(best.order.orderDate),
      orderTotal: parseMoney(best.order.orderTotal) ?? undefined,
      detailUrl: best.order.detailUrl,
      returnInfo: {
        ...best.returnInfo,
        status: 'refunded',
        isRefundCredit: true,
        relatedOrderId: best.orderId,
        relatedTxnId: purchaseTxnId || undefined,
        refundAmount: credit,
        eventDate: txn.date,
      },
      matchConfidence: bestScore <= 25 ? 'high' : 'medium',
      matchedAt: new Date().toISOString(),
    }

    const purchaseMatch = purchaseMatches.find(
      (m) => m.orderId === best.orderId,
    )
    const basePurchase = purchaseMatch?.enrichment

    const purchaseEnrichment: PurchaseEnrichment = {
      ...(basePurchase ?? {}),
      source,
      orderId: best.orderId,
      returnInfo: {
        ...(best.returnInfo.status === 'cancelled'
          ? { status: 'cancelled' as const }
          : { status: 'returned' as const }),
        label: best.returnInfo.label ?? best.order.status,
        eventDate: best.returnInfo.eventDate ?? best.order.statusDate,
        relatedTxnId: txn.id,
        refundAmount: credit,
      },
    }

    links.push({
      refundTxnId: txn.id,
      purchaseTxnId,
      orderId: best.orderId,
      refundEnrichment,
      purchaseEnrichment,
    })
  }

  return links
}
