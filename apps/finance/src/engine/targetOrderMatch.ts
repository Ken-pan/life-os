import type { PurchaseEnrichment } from './purchaseEnrichment.ts'
import {
  enrichmentFromOrder as buildEnrichment,
  matchOrdersToPurchaseTxns,
  matchRefundCreditsToOrders,
  type MerchantOrderRecord,
  type PurchaseMatchTxn,
  type PurchaseMatchResult,
  type RefundLinkResult,
} from './purchaseOrderMatch.ts'

export type TargetOrderRecord = MerchantOrderRecord

export type TargetMatchTxn = PurchaseMatchTxn

export type TargetMatchResult = PurchaseMatchResult

export type TargetRefundLinkResult = RefundLinkResult

const TARGET_MERCHANT_RE = /target/i

export function isTargetMerchant(merchant: string | undefined): boolean {
  return TARGET_MERCHANT_RE.test(merchant ?? '')
}

export function enrichmentFromOrder(
  order: TargetOrderRecord,
  confidence: TargetMatchResult['confidence'],
): PurchaseEnrichment {
  return buildEnrichment('target', order, confidence)
}

export function matchTargetOrdersToTxns(
  orders: TargetOrderRecord[],
  txns: TargetMatchTxn[],
  options?: {
    maxDayDiff?: number
    maxAmountDiff?: number
    minConfidence?: 'high' | 'medium' | 'low'
  },
): TargetMatchResult[] {
  return matchOrdersToPurchaseTxns('target', orders, txns, {
    merchantRe: TARGET_MERCHANT_RE,
    maxDayDiff: options?.maxDayDiff ?? 14,
    maxAmountDiff: options?.maxAmountDiff,
    minConfidence: options?.minConfidence,
  })
}

export function matchTargetRefundsToOrders(
  orders: TargetOrderRecord[],
  txns: TargetMatchTxn[],
  purchaseMatches: TargetMatchResult[],
  options?: { maxDayDiff?: number; maxAmountDiff?: number },
): TargetRefundLinkResult[] {
  return matchRefundCreditsToOrders('target', orders, txns, purchaseMatches, {
    merchantRe: TARGET_MERCHANT_RE,
    maxDayDiff: options?.maxDayDiff ?? 60,
    maxAmountDiff: options?.maxAmountDiff ?? 0.05,
  })
}
