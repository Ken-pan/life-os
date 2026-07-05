import { SYNC_DEFAULTS } from './constants.js';

/**
 * 防抖 + 单飞任务（练完上传、Finance 后台刷新等）
 * @param {(...args: unknown[]) => Promise<unknown>} run
 * @param {number} [debounceMs]
 */
export function createDebouncedTask(run, debounceMs = SYNC_DEFAULTS.debounceMs) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {Promise<unknown> | null} */
  let inFlight = null;

  /** @param {...unknown} args */
  async function execute(...args) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        return await run(...args);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  /**
   * @param {{ immediate?: boolean } & Record<string, unknown>} [options]
   */
  function schedule(options = {}) {
    const { immediate = false, ...rest } = options;
    if (typeof window === 'undefined') {
      return Promise.resolve({ skipped: true, reason: 'no_browser' });
    }

    if (immediate) {
      if (timer) clearTimeout(timer);
      timer = null;
      return execute(rest);
    }

    return new Promise((resolve) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        execute(rest).then(resolve).catch(() => resolve({ ok: false }));
      }, debounceMs);
    });
  }

  function cancelDebounce() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return { execute, schedule, cancelDebounce };
}
