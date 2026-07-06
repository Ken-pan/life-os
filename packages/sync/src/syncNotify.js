/**
 * 云同步错误 pub/sub + withSyncNotify，供各 app 的 SyncErrorBanner 订阅。
 *
 * @param {{ formatError: (err: unknown) => string }} options
 */
export function createSyncNotify({ formatError }) {
  /** @type {Set<(message: string) => void>} */
  const listeners = new Set();

  /** @param {(message: string) => void} listener */
  function subscribeSyncError(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /** @param {unknown} err */
  function syncErrorMessage(err) {
    return formatError(err);
  }

  /** @param {unknown} err */
  function notifySyncError(err) {
    const text = syncErrorMessage(err);
    for (const fn of listeners) fn(text);
  }

  /**
   * @template T
   * @param {() => Promise<T>} fn
   */
  async function withSyncNotify(fn) {
    try {
      return await fn();
    } catch (e) {
      notifySyncError(e);
      throw e;
    }
  }

  return { subscribeSyncError, syncErrorMessage, notifySyncError, withSyncNotify };
}
