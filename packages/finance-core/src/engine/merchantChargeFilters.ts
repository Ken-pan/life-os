import type { PurchaseMatchTxn } from './purchaseOrderMatch'
import { isRefundCreditTxn } from './purchaseReturnStatus'

/** Monthly RedCard / store-card statement payments — not individual order charges. */
const TARGET_AGGREGATE_RE =
  /target\s*(credit\s*)?card|tgt\s*red\s*card|redcard\s*payment|target\s*card\s*payment/i

/** Best Buy branded card statement payments (if present in ledger). */
const BESTBUY_AGGREGATE_RE =
  /best\s*buy\s*(credit\s*)?card|my\s*best\s*buy\s*visa\s*payment|citibank.*best\s*buy/i

export function isTargetAggregatePayment(
  merchant: string | undefined,
): boolean {
  return TARGET_AGGREGATE_RE.test(merchant ?? '')
}

export function isBestBuyAggregatePayment(
  merchant: string | undefined,
): boolean {
  return BESTBUY_AGGREGATE_RE.test(merchant ?? '')
}

/** True when txn looks like a direct store purchase charge (not card statement). */
export function isDirectMerchantPurchaseTxn(
  source: 'amazon' | 'bestbuy' | 'target',
  txn: PurchaseMatchTxn,
): boolean {
  if (!txn.amount || txn.amount <= 0) return false
  if (isRefundCreditTxn(txn)) return false
  const merchant = txn.merchant ?? ''
  if (source === 'target' && isTargetAggregatePayment(merchant)) return false
  if (source === 'bestbuy' && isBestBuyAggregatePayment(merchant)) return false
  return true
}
