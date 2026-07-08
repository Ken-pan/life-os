/**
 * Life OS 本地业务缓存（stale-while-revalidate 快照）。
 * 按 userId + scope 隔离；schemaVersion 升级时旧缓存自动失效。
 *
 * @typedef {object} LocalCacheOptions
 * @property {string} prefix localStorage 键前缀（如 planos_cache / fos_cache）
 * @property {number} [schemaVersion=1]
 * @property {string} [authStorageKey='life_os_auth'] Supabase session 存储键
 */

const DEFAULT_AUTH_STORAGE_KEY = 'life_os_auth'
const DEFAULT_SCHEMA_VERSION = 1

function safeLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/**
 * @param {LocalCacheOptions} options
 */
export function createLocalCache(options) {
  const {
    prefix,
    schemaVersion = DEFAULT_SCHEMA_VERSION,
    authStorageKey = DEFAULT_AUTH_STORAGE_KEY,
  } = options

  if (!prefix || typeof prefix !== 'string') {
    throw new Error('createLocalCache: prefix is required')
  }

  /** @param {string} scope @param {string} userId */
  function cacheKey(scope, userId) {
    return `${prefix}:${scope}:${userId}`
  }

  /** @param {string} scope @param {string} userId */
  function readCache(scope, userId) {
    const ls = safeLocalStorage()
    if (!ls || !userId) return null
    try {
      const raw = ls.getItem(cacheKey(scope, userId))
      if (!raw) return null
      const env = JSON.parse(raw)
      if (env.v !== schemaVersion || env.userId !== userId) return null
      return env.data
    } catch {
      return null
    }
  }

  /** @param {string} scope @param {string} userId @param {unknown} data */
  function writeCache(scope, userId, data) {
    const ls = safeLocalStorage()
    if (!ls || !userId) return
    try {
      ls.setItem(
        cacheKey(scope, userId),
        JSON.stringify({
          v: schemaVersion,
          userId,
          cachedAt: new Date().toISOString(),
          data,
        }),
      )
    } catch {
      /* quota / private mode */
    }
  }

  function clearAllCache() {
    const ls = safeLocalStorage()
    if (!ls) return
    try {
      const keys = []
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i)
        if (k && k.startsWith(`${prefix}:`)) keys.push(k)
      }
      for (const k of keys) ls.removeItem(k)
    } catch {
      /* ignore */
    }
  }

  function peekSessionUserId() {
    const ls = safeLocalStorage()
    if (!ls) return null
    try {
      const raw = ls.getItem(authStorageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const session = parsed.currentSession ?? parsed
      const id = session?.user?.id
      return typeof id === 'string' && id.length > 0 ? id : null
    } catch {
      return null
    }
  }

  return {
    prefix,
    schemaVersion,
    readCache,
    writeCache,
    clearAllCache,
    peekSessionUserId,
  }
}
