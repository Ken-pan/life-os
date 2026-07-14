import type { ReturnInfoDecision } from '../engine/purchaseEnrichment'

export function deriveAmazonReturnInfoDecision(order: {
  status?: string | null
  returnInfo?: unknown
  returnEvidenceText?: string | null
  returnInfoDecision?: ReturnInfoDecision | null
}): ReturnInfoDecision
