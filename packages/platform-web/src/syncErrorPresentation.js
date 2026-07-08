/** @typedef {import('@life-os/contracts/sync').SyncErrorPresentation} SyncErrorPresentation */

/**
 * Map sync error state to the cross-surface presentation contract.
 * Transport/retry behavior stays in each app.
 *
 * @param {string | null | undefined} reason
 * @param {{ message: string; dismissLabel: string }} copy
 * @returns {SyncErrorPresentation | null}
 */
export function createSyncErrorPresentation(reason, copy) {
  if (!reason) return null
  return {
    message: copy.message,
    recoverable: true,
    dismissAction: {
      id: 'dismiss-sync-error',
      label: copy.dismissLabel,
      intent: 'dismiss',
    },
  }
}
