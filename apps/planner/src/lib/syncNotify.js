/** @typedef {(message: string) => void} SyncErrorListener */

/** @type {Set<SyncErrorListener>} */
const listeners = new Set();

/** @param {SyncErrorListener} listener */
export function subscribeSyncError(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {string} message */
export function notifySyncError(message) {
  const text = message?.trim() || 'sync failed';
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
    notifySyncError(e?.message || String(e));
    throw e;
  }
}
