/** @typedef {import('@life-os/contracts/sync').SyncErrorPresentation} SyncErrorPresentation */

/**
 * Planner-local adapter from existing sync error state to the P0 presentation
 * contract. It keeps transport/retry behavior outside the shared layer.
 *
 * @param {string | null | undefined} reason
 * @param {{ message: string; dismissLabel: string }} copy
 * @returns {SyncErrorPresentation | null}
 */
export function createPlannerSyncErrorPresentation(reason, copy) {
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
