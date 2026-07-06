/**
 * Toast 展示策略（去重 + 时长），供各 app 的 ui.svelte.js 复用。
 */

/** @param {string} msg @param {{ tone?: string, actionLabel?: string, min?: number, max?: number, perCharMs?: number }} [opts] */
export function resolveToastDuration(msg, opts = {}) {
  const {
    tone = 'success',
    actionLabel = '',
    min = 2000,
    max = 7000,
    perCharMs = 50
  } = opts;

  if (actionLabel) return Math.min(max, Math.max(4000, min));
  if (tone === 'error') return Math.min(max, Math.max(4500, (msg?.length ?? 0) * perCharMs));
  if (tone === 'warn') return Math.min(max, Math.max(4000, (msg?.length ?? 0) * perCharMs));

  const byChars = (msg?.length ?? 0) * perCharMs;
  return Math.min(max, Math.max(min, byChars || min));
}

/** @returns {(key: string | undefined, dedupeMs?: number) => boolean} */
export function createToastDeduper() {
  /** @type {Map<string, number>} */
  const lastAt = new Map();

  return (key, dedupeMs = 3000) => {
    if (!key) return true;
    const now = Date.now();
    const prev = lastAt.get(key);
    if (prev != null && now - prev < dedupeMs) return false;
    lastAt.set(key, now);
    return true;
  };
}
