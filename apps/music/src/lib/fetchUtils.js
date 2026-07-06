const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;

/**
 * Resilient GET with AbortSignal.timeout + selective retry (timeouts, 5xx, 429).
 * @param {string} url
 * @param {{ timeoutMs?: number, retries?: number, init?: RequestInit }} [opts]
 */
export async function fetchWithRetry(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? MAX_RETRIES;
  /** @type {unknown} */
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...opts.init,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
        if (!retryable || attempt >= retries) {
          throw new Error(`HTTP ${res.status}`);
        }
      } else {
        return res;
      }
    } catch (err) {
      lastError = err;
      const retryable =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'TypeError' || err.message.startsWith('HTTP 5'));
      if (!retryable || attempt >= retries) throw err;
    }
    await new Promise((r) => setTimeout(r, 150 * 2 ** attempt));
  }

  throw lastError;
}
