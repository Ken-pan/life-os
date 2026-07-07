export type AmazonReturnInfoDecision =
  | 'present'
  | 'absent_verified'
  | 'unknown'

export function deriveAmazonReturnInfoDecision(order?: {
  returnInfoDecision?: AmazonReturnInfoDecision
  status?: string
  returnInfo?: unknown
  returnEvidenceText?: string
}): AmazonReturnInfoDecision
