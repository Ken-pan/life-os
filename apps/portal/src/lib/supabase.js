import { createSupabaseAuthOptions, resolveSupabaseEnv, setupCrossDomainSSO } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

const { url, anonKey, configured } = resolveSupabaseEnv(import.meta.env, {
  url: 'https://iueozzuctstwvzbcxcyh.supabase.co',
  anonKey: 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL'
})

export const supabase = createClient(
  url,
  anonKey,
  {
    auth: createSupabaseAuthOptions(),
  }
)

setupCrossDomainSSO(supabase)

export const isSupabaseConfigured = configured
