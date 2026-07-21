import { createSyncNotify, formatSyncErrorMessage } from '@life-os/sync'
import { t } from './i18n/index.js'

/** @typedef {import('@life-os/contracts/sync').SyncErrorPresentation} SyncErrorPresentation */
/** Presentation mapping: @life-os/platform-web/sync-error createSyncErrorPresentation (via SyncErrorBanner) */

const base = createSyncNotify({
  formatError: (err) =>
    formatSyncErrorMessage(err, {
      network: t('auth.errNetwork'),
      rateLimit: t('auth.errRateLimit'),
      fallback: t('sync.defaultError'),
      schemaCache: t('sync.schemaCache'),
    }),
})

/** @param {unknown} err */
function isAuthGateError(err) {
  const gate = t('sync.notSignedIn')
  if (!gate) return false
  if (typeof err === 'string') return err === gate || err.includes(gate)
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String(/** @type {{ message?: unknown }} */ (err).message ?? '')
      : ''
  if (message === gate || message.includes(gate)) return true
  const formatted = base.syncErrorMessage(err)
  return formatted === gate || formatted.includes(gate)
}

/** @param {unknown} err */
export function notifySyncError(err) {
  // Unauthenticated is an expected Continuity cold-start state — not a sync failure.
  if (isAuthGateError(err)) return
  base.notifySyncError(err)
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 */
export async function withSyncNotify(fn) {
  try {
    const result = await fn()
    base.clearSyncError()
    return result
  } catch (e) {
    notifySyncError(e)
    throw e
  }
}

export const subscribeSyncError = base.subscribeSyncError
export const syncErrorMessage = base.syncErrorMessage
export const clearSyncError = base.clearSyncError
