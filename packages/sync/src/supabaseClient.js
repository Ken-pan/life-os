import { createSupabaseAuthOptions, resolveSupabaseEnv } from './supabaseEnv.js'
import { setupCrossDomainSSO } from './sso.js'

/** Life OS unified Supabase project (four apps + Portal). */
export const LIFE_OS_SUPABASE_URL = 'https://iueozzuctstwvzbcxcyh.supabase.co'
export const LIFE_OS_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL'

const BROWSER_CLIENT_CACHE_KEY = '__lifeOsSupabaseClients__'
/** @type {WeakMap<object, Promise<void>>} */
const SSO_READY = new WeakMap()

/** @returns {Map<string, object> | null} */
function getBrowserClientCache() {
  if (typeof globalThis === 'undefined') return null
  if (!globalThis[BROWSER_CLIENT_CACHE_KEY]) {
    globalThis[BROWSER_CLIENT_CACHE_KEY] = new Map()
  }
  return globalThis[BROWSER_CLIENT_CACHE_KEY]
}

/**
 * Wait until Cookie / iOS Keychain SSO restore finished for this client.
 * Auth bootstrap must await this before treating a null session as signed-out.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<void>}
 */
export function ensureLifeOsSsoReady(supabase) {
  return SSO_READY.get(supabase) ?? Promise.resolve()
}

/**
 * @param {Function} createClient
 * @param {{ env: Record<string, string | undefined>, schema?: string, productionFallback?: boolean }} options
 */
export function createLifeOsSupabaseClient(createClient, options) {
  const { env, schema, productionFallback = true } = options
  const fallbacks = productionFallback
    ? { url: LIFE_OS_SUPABASE_URL, anonKey: LIFE_OS_SUPABASE_PUBLISHABLE_KEY }
    : {}
  const { url, anonKey, configured } = resolveSupabaseEnv(env, fallbacks)

  const authOptions = createSupabaseAuthOptions()
  const cacheKey = `${url}|${anonKey}|${schema ?? ''}|${authOptions.storageKey}`
  const cache = getBrowserClientCache()
  const cached = cache?.get(cacheKey)
  if (cached) return cached

  /** @type {import('@supabase/supabase-js').SupabaseClientOptions} */
  const clientOptions = { auth: authOptions }
  if (schema) {
    clientOptions.db = { schema }
  }

  const supabase = createClient(
    url || 'http://localhost',
    anonKey || 'public-anon-key',
    clientOptions,
  )

  const ssoReady = setupCrossDomainSSO(supabase).catch((err) => {
    console.error('[sso] setup failed:', err)
  })
  SSO_READY.set(supabase, ssoReady)

  const result = { supabase, url, anonKey, isSupabaseConfigured: configured }
  cache?.set(cacheKey, result)
  return result
}

/**
 * Test-only: clear browser singleton cache (HMR / unit tests).
 */
export function resetLifeOsSupabaseClientCache() {
  const cache = getBrowserClientCache()
  cache?.clear()
}
