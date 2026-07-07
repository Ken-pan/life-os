/** cross-surface -> Swift: enum UserActionIntent: String, Codable */
export type UserActionIntent =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'retry'
  | 'dismiss'

/** cross-surface -> Swift: struct UserAction: Codable, Identifiable */
export type UserAction = {
  id: string
  label: string
  intent?: UserActionIntent
}

/** cross-surface content model for empty states. */
export type EmptyStateModel = {
  title: string
  hint?: string
  icon?: string
  variant?: 'default' | 'rich'
  action?: UserAction
}

/** cross-surface display-only insight grouping. */
export type InsightSection = {
  kind: 'risk' | 'suggestion' | 'anomaly' | 'info'
  items: string[]
}

/**
 * Display-only recommendation copy.
 *
 * Numeric confidence, ranking, sorting, scoring, RPC payloads, and coach rules
 * stay app-only.
 */
export type RecommendationDisplay = {
  title: string
  reasons: string[]
  confidenceLabel?: 'low' | 'medium' | 'high'
  source: string
}
