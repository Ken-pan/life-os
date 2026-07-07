import type { UserAction } from './content'

/** cross-surface -> Swift: enum SyncState: String, Codable */
export type SyncState = 'idle' | 'syncing' | 'synced' | 'pending' | 'error'

/** cross-surface presentation model for sync failures. */
export type SyncErrorPresentation = {
  message: string
  recoverable: boolean
  /** Expected intent: "retry". */
  recoveryAction?: UserAction
  /** Expected intent: "dismiss". */
  dismissAction?: UserAction
}
