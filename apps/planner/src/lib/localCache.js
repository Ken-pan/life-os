import { AUTH_STORAGE_KEY } from './persist/localDataKeys.js';

const PREFIX = 'planos_cache';
const SCHEMA_VERSION = 1;

function safeLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function cacheKey(scope, userId) {
  return `${PREFIX}:${scope}:${userId}`;
}

/** @param {string} scope @param {string} userId */
export function readCache(scope, userId) {
  const ls = safeLocalStorage();
  if (!ls || !userId) return null;
  try {
    const raw = ls.getItem(cacheKey(scope, userId));
    if (!raw) return null;
    const env = JSON.parse(raw);
    if (env.v !== SCHEMA_VERSION || env.userId !== userId) return null;
    return env.data;
  } catch {
    return null;
  }
}

/** @param {string} scope @param {string} userId @param {unknown} data */
export function writeCache(scope, userId, data) {
  const ls = safeLocalStorage();
  if (!ls || !userId) return;
  try {
    ls.setItem(
      cacheKey(scope, userId),
      JSON.stringify({
        v: SCHEMA_VERSION,
        userId,
        cachedAt: new Date().toISOString(),
        data
      })
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearAllCache() {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const keys = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(`${PREFIX}:`)) keys.push(k);
    }
    for (const k of keys) ls.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function peekSessionUserId() {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed.currentSession ?? parsed;
    const id = session?.user?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export const CACHE_SCOPES = {
  state: 'state'
};
