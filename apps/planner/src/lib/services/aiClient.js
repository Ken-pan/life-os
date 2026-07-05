const CACHE_PREFIX = 'planos_ai_v1:';
const FAIL_PREFIX = 'planos_ai_fail_v1:';
const DISABLED_KEY = 'planos_ai_disabled_v1';

export const SOFT_TTL_MS = 6 * 60 * 60 * 1000;
export const MIN_REGEN_INTERVAL_MS = 30 * 60 * 1000;
export const FAIL_COOLDOWN_MS = 10 * 60 * 1000;

/** @type {Map<string, Promise<{ text: string, generatedAt: number, fingerprint: string } | null>>} */
const inflight = new Map();

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function getCachedAiText(kind) {
  const raw = safeGet(CACHE_PREFIX + kind);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.v !== 1 || typeof parsed.text !== 'string' || !parsed.text.trim()) return null;
    return {
      text: parsed.text,
      generatedAt: parsed.generatedAt,
      fingerprint: parsed.fingerprint
    };
  } catch {
    return null;
  }
}

export function isAiDisabled() {
  return safeGet(DISABLED_KEY) === '1';
}

export function clearAiDisabled() {
  safeSet(DISABLED_KEY, '0');
  try {
    localStorage.removeItem(DISABLED_KEY);
  } catch {
    /* ignore */
  }
}

export function shouldRegenerate(cached, fingerprint, now, lastFailAt) {
  if (lastFailAt != null && now - lastFailAt < FAIL_COOLDOWN_MS) return false;
  if (!cached) return true;
  const age = now - cached.generatedAt;
  if (cached.fingerprint !== fingerprint) return age >= MIN_REGEN_INTERVAL_MS;
  return age >= SOFT_TTL_MS;
}

/**
 * @param {string} kind
 * @param {string} fingerprint
 * @param {{ system: string, user: string }} prompt
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchAiText(kind, fingerprint, prompt, opts = {}) {
  if (isAiDisabled() && !opts.force) {
    clearAiDisabled();
  }

  const cacheKey = CACHE_PREFIX + kind;
  const cached = getCachedAiText(kind);
  const now = Date.now();
  const failRaw = safeGet(FAIL_PREFIX + kind);
  const lastFailAt = failRaw ? Number(failRaw) : null;

  if (!opts.force && cached && !shouldRegenerate(cached, fingerprint, now, lastFailAt)) {
    return cached;
  }

  if (inflight.has(kind)) return inflight.get(kind);

  const promise = (async () => {
    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: prompt.system,
          user: prompt.user,
          maxTokens: kind.startsWith('taskBreakdown') ? 400 : 280
        })
      });
      if (res.status === 501) {
        safeSet(DISABLED_KEY, '1');
        return null;
      }
      if (!res.ok) throw new Error(`ai ${res.status}`);
      const data = await res.json();
      if (!data?.text?.trim()) throw new Error('empty');
      clearAiDisabled();
      const entry = { text: data.text.trim(), generatedAt: Date.now(), fingerprint };
      safeSet(cacheKey, JSON.stringify({ v: 1, ...entry }));
      return entry;
    } catch {
      safeSet(FAIL_PREFIX + kind, String(Date.now()));
      return cached;
    } finally {
      inflight.delete(kind);
    }
  })();

  inflight.set(kind, promise);
  return promise;
}

/** @param {string} taskTitle */
export async function fetchTaskBreakdown(taskTitle) {
  const { buildAiPrompt } = await import('./aiPrompts.js');
  const kind = `taskBreakdown|${taskTitle}`;
  const prompt = buildAiPrompt('taskBreakdown');
  prompt.user = `任务：${taskTitle}`;
  const result = await fetchAiText(kind, taskTitle, prompt);
  if (!result?.text) return [];
  return result.text
    .split('\n')
    .map((s) => s.replace(/^[\d\-•*.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}
