import {
  LIFE_OS_AUTH_STORAGE_KEY,
  createSupabaseAuthOptions,
  resolveSupabaseEnv,
  setupCrossDomainSSO,
} from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

// Life OS 统一 Supabase 项目（Planner 数据在 public.planner_* 表）
const FALLBACK_URL = 'https://iueozzuctstwvzbcxcyh.supabase.co'
const FALLBACK_KEY = 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL'

const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolveSupabaseEnv(
  import.meta.env,
  {
    url: FALLBACK_URL,
    anonKey: FALLBACK_KEY,
  },
)

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: createSupabaseAuthOptions(),
})

setupCrossDomainSSO(supabase)
