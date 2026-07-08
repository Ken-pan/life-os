import { createSupabaseAuthOptions, resolveSupabaseEnv, setupCrossDomainSSO } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

const { url, anonKey, configured } = resolveSupabaseEnv(import.meta.env)

export const SUPABASE_URL = url
export const SUPABASE_PUBLISHABLE_KEY = anonKey

export const supabase = createClient(
  url || 'https://iueozzuctstwvzbcxcyh.supabase.co',
  anonKey || 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL',
  {
    db: { schema: 'music' },
    auth: createSupabaseAuthOptions(),
  },
)

setupCrossDomainSSO(supabase)

export const isSupabaseConfigured = configured
