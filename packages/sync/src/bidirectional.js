import { SYNC_DEFAULTS } from './constants.js';

/**
 * Local-first 双向同步引擎（Pull → Merge → Push）
 * 适用于 Fitness / Planner 等整包状态应用。
 *
 * @param {object} options
 * @param {() => Promise<{ pulled?: boolean, pushed?: boolean, switchedAccount?: boolean, userId?: string, notify?: (r: object) => void | Promise<void> }>} options.performSync
 * @param {(err: unknown) => void | Promise<void>} [options.onError]
 * @param {(result: object) => void | Promise<void>} [options.onSilentPull]
 */
export function createBidirectionalSync({ performSync, onError, onSilentPull }) {
  let promise = null;
  let lastUserId = null;
  let lastAt = 0;
  let debounceTimer = null;
  const { cooldownMs, debounceMs } = SYNC_DEFAULTS;

  function resetCooldown() {
    lastUserId = null;
    lastAt = 0;
  }

  /**
   * @param {{ silent?: boolean, force?: boolean }} [options]
   */
  async function syncBidirectional(options = {}) {
    const { silent = false, force = false } = options;
    if (typeof window === 'undefined') return { skipped: true, reason: 'no_browser' };

    const now = Date.now();
    if (promise) return promise;
    if (!force && lastUserId && now - lastAt < cooldownMs) {
      return { skipped: true, reason: 'cooldown' };
    }

    promise = (async () => {
      try {
        const result = (await performSync()) ?? {};
        if (result.userId) {
          lastUserId = result.userId;
          lastAt = Date.now();
        }

        if (!silent && result.notify) {
          await result.notify(result);
        } else if (silent && result.pulled && onSilentPull) {
          await onSilentPull(result);
        }

        return result;
      } catch (err) {
        if (!silent && onError) await onError(err);
        throw err;
      } finally {
        promise = null;
      }
    })();

    return promise;
  }

  /**
   * @param {{ immediate?: boolean, silent?: boolean }} [options]
   */
  function scheduleBidirectionalSync(options = {}) {
    const { immediate = false, silent = true } = options;
    if (typeof window === 'undefined') {
      return Promise.resolve({ skipped: true, reason: 'no_browser' });
    }

    if (immediate) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      return syncBidirectional({ silent });
    }

    return new Promise((resolve) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        syncBidirectional({ silent }).then(resolve).catch(() => resolve({ ok: false }));
      }, debounceMs);
    });
  }

  return { syncBidirectional, scheduleBidirectionalSync, resetCooldown };
}
