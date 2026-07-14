/** @life-os/finance-core — public barrel */

export * from './types.js'
export * from './defaults.js'
export * from './supabase-tables.js'
export * from './extension-sync.js'
export * from './routing/app-route.js'
export * from './analytics/routes.js'
export type { LiveQuote } from './quotes/types.js'
export {
  bindFinanceSupabase,
  loadFinanceData,
} from './repo/createRepo.js'
export { setPurchaseImageBaseUrl } from './engine/purchaseEnrichment.js'
export {
  applyPurchaseReviewDecision,
  automationMayOverwriteCandidate,
  automationMayResurface,
  PURCHASE_REVIEW_ERROR_STATUS,
} from './engine/purchaseReviewDecision.js'
export type {
  PurchaseReviewState,
  PurchaseReviewActionType,
  PurchaseAssociation,
  PurchaseDecision,
  PurchaseReviewErrorCode,
  PurchaseReviewRequest,
  PurchaseReviewResult,
} from './engine/purchaseReviewDecision.js'
