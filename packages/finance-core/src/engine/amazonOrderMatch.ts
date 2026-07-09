import type { PurchaseEnrichment } from './purchaseEnrichment'
import {
  enrichmentFromOrder as buildEnrichment,
  matchOrdersToPurchaseTxns,
  matchRefundCreditsToOrders,
  type MerchantOrderRecord,
  type PurchaseMatchTxn,
  type PurchaseMatchResult,
  type RefundLinkResult,
} from './purchaseOrderMatch'
import { parseMoney, parseMerchantDate } from './purchaseReturnStatus'

export type AmazonOrderRecord = MerchantOrderRecord

export interface AmazonMatchTxn extends PurchaseMatchTxn {}

export type AmazonMatchResult = PurchaseMatchResult

export type AmazonRefundLinkResult = RefundLinkResult

const AMAZON_MERCHANT_RE = /amazon/i

export function isAmazonMerchant(merchant: string | undefined): boolean {
  return AMAZON_MERCHANT_RE.test(merchant ?? '')
}

export { parseMoney }
export const parseOrderDate = parseMerchantDate

export function enrichmentFromOrder(
  order: AmazonOrderRecord,
  confidence: AmazonMatchResult['confidence'],
): PurchaseEnrichment {
  return buildEnrichment('amazon', order, confidence)
}

export function matchAmazonOrdersToTxns(
  orders: AmazonOrderRecord[],
  txns: AmazonMatchTxn[],
  options?: {
    maxDayDiff?: number
    maxAmountDiff?: number
    minConfidence?: 'high' | 'medium' | 'low'
  },
): AmazonMatchResult[] {
  return matchOrdersToPurchaseTxns('amazon', orders, txns, {
    merchantRe: AMAZON_MERCHANT_RE,
    maxDayDiff: options?.maxDayDiff ?? 12,
    maxAmountDiff: options?.maxAmountDiff,
    minConfidence: options?.minConfidence,
  })
}

export function matchAmazonRefundsToOrders(
  orders: AmazonOrderRecord[],
  txns: AmazonMatchTxn[],
  purchaseMatches: AmazonMatchResult[],
  options?: { maxDayDiff?: number; maxAmountDiff?: number },
): AmazonRefundLinkResult[] {
  return matchRefundCreditsToOrders('amazon', orders, txns, purchaseMatches, {
    merchantRe: AMAZON_MERCHANT_RE,
    maxDayDiff: options?.maxDayDiff,
    maxAmountDiff: options?.maxAmountDiff,
  })
}
