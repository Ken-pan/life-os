import { createSupabaseAuthOptions, resolveSupabaseEnv, setupCrossDomainSSO } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

// Life OS 统一 Supabase 项目（Fitness 数据在 fitness schema）
const { url: SUPABASE_URL, anonKey: SUPABASE_PUBLISHABLE_KEY } =
  resolveSupabaseEnv(import.meta.env, {
    url: 'https://iueozzuctstwvzbcxcyh.supabase.co',
    anonKey: 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL',
  })

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: 'fitness' },
  auth: createSupabaseAuthOptions(),
})

setupCrossDomainSSO(supabase)
