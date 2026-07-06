import { formatSyncErrorMessage } from '@life-os/sync';
import { t } from './i18n/index.js';

/** @typedef {(message: string) => void} SyncErrorListener */

/** @type {Set<SyncErrorListener>} */
const listeners = new Set();

/** @param {SyncErrorListener} listener */
export function subscribeSyncError(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {unknown} err */
export function syncErrorMessage(err) {
  return formatSyncErrorMessage(err, {
    network: t('auth.errNetwork'),
    rateLimit: t('auth.errRateLimit'),
    fallback: t('sync.defaultError')
  });
}

/** @param {unknown} err */
export function notifySyncError(err) {
  const text = syncErrorMessage(err);
  for (const fn of listeners) fn(text);
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 */
export async function withSyncNotify(fn) {
  try {
    return await fn();
  } catch (e) {
    notifySyncError(e);
    throw e;
  }
}
