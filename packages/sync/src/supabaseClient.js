import { createSupabaseAuthOptions, resolveSupabaseEnv } from './supabaseEnv.js'
import { setupCrossDomainSSO } from './sso.js'

/** Life OS unified Supabase project (four apps + Portal). */
export const LIFE_OS_SUPABASE_URL = 'https://iueozzuctstwvzbcxcyh.supabase.co'
export const LIFE_OS_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL'

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

  const clientOptions = { auth: createSupabaseAuthOptions() }
  if (schema) {
    clientOptions.db = { schema }
  }

  const supabase = createClient(
    url || 'http://localhost',
    anonKey || 'public-anon-key',
    clientOptions,
  )

  setupCrossDomainSSO(supabase)

  return { supabase, url, anonKey, isSupabaseConfigured: configured }
}
