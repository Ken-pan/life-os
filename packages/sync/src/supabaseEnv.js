/** @typedef {Record<string, string | undefined>} ImportMetaEnv */

/**
 * 解析 Supabase URL / anon key（兼容 SvelteKit PUBLIC_* 与 Vite VITE_*）。
 * Netlify 四站统一配置 PUBLIC_SUPABASE_*；本地 .env 可用任一种前缀。
 * @param {ImportMetaEnv} env — 通常传 import.meta.env
 * @param {{ url?: string; anonKey?: string }} [fallbacks]
 */
export function resolveSupabaseEnv(env, fallbacks = {}) {
  const url =
    env.PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || fallbacks.url || ''
  const anonKey =
    env.PUBLIC_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    fallbacks.anonKey ||
    ''
  return { url, anonKey, configured: Boolean(url && anonKey) }
}

import { LIFE_OS_AUTH_STORAGE_KEY } from './constants.js'

/** 四端 Supabase Auth client 统一选项 */
export function createSupabaseAuthOptions() {
  return {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: LIFE_OS_AUTH_STORAGE_KEY,
  }
}
