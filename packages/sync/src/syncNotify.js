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
   * 一次同步成功后清掉横幅。没有这一步,横幅只在用户手动点「关闭」或
   * 刷新页面时消失 —— 一次瞬时失败(锁屏时后台推送掉线之类)留下的横幅
   * 会一直挂着,哪怕之后的同步早就成功了,看起来像「同步坏了」。
   */
  function clearSyncError() {
    for (const fn of listeners) fn(null);
  }

  /**
   * @template T
   * @param {() => Promise<T>} fn
   */
  async function withSyncNotify(fn) {
    try {
      const result = await fn();
      clearSyncError();
      return result;
    } catch (e) {
      notifySyncError(e);
      throw e;
    }
  }

  return { subscribeSyncError, syncErrorMessage, notifySyncError, clearSyncError, withSyncNotify };
}
