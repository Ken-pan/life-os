import type { PurchaseEnrichment } from './purchaseEnrichment'
import { isDirectMerchantPurchaseTxn } from './merchantChargeFilters'
import {
  enrichmentFromOrder as buildEnrichment,
  matchOrdersToPurchaseTxns,
  matchRefundCreditsToOrders,
  type MerchantOrderRecord,
  type PurchaseMatchTxn,
  type PurchaseMatchResult,
  type RefundLinkResult,
} from './purchaseOrderMatch'

export type BestBuyOrderRecord = MerchantOrderRecord

export type BestBuyMatchTxn = PurchaseMatchTxn

export type BestBuyMatchResult = PurchaseMatchResult

export type BestBuyRefundLinkResult = RefundLinkResult

const BESTBUY_MERCHANT_RE = /best\s*buy|bestbuy/i

export function isBestBuyMerchant(merchant: string | undefined): boolean {
  return BESTBUY_MERCHANT_RE.test(merchant ?? '')
}

export function enrichmentFromOrder(
  order: BestBuyOrderRecord,
  confidence: BestBuyMatchResult['confidence'],
): PurchaseEnrichment {
  return buildEnrichment('bestbuy', order, confidence)
}

export function matchBestBuyOrdersToTxns(
  orders: BestBuyOrderRecord[],
  txns: BestBuyMatchTxn[],
  options?: {
    maxDayDiff?: number
    maxAmountDiff?: number
    minConfidence?: 'high' | 'medium' | 'low'
  },
): BestBuyMatchResult[] {
  return matchOrdersToPurchaseTxns('bestbuy', orders, txns, {
    merchantRe: BESTBUY_MERCHANT_RE,
    maxDayDiff: options?.maxDayDiff ?? 21,
    maxAmountDiff: options?.maxAmountDiff,
    minConfidence: options?.minConfidence,
    isPurchaseTxn: (t) => isDirectMerchantPurchaseTxn('bestbuy', t),
  })
}

export function matchBestBuyRefundsToOrders(
  orders: BestBuyOrderRecord[],
  txns: BestBuyMatchTxn[],
  purchaseMatches: BestBuyMatchResult[],
  options?: { maxDayDiff?: number; maxAmountDiff?: number },
): BestBuyRefundLinkResult[] {
  return matchRefundCreditsToOrders('bestbuy', orders, txns, purchaseMatches, {
    merchantRe: BESTBUY_MERCHANT_RE,
    maxDayDiff: options?.maxDayDiff ?? 60,
    maxAmountDiff: options?.maxAmountDiff ?? 0.05,
  })
}
