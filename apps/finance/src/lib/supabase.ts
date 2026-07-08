import { createSupabaseAuthOptions, resolveSupabaseEnv, setupCrossDomainSSO } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

const { url, anonKey, configured } = resolveSupabaseEnv(import.meta.env)

export const isSupabaseConfigured = configured

if (!configured) {
  console.warn(
    '[supabase] 缺少 PUBLIC_SUPABASE_* 或 VITE_SUPABASE_*，登录与同步功能不可用。',
  )
}

export const supabase = createClient(
  url ?? 'http://localhost',
  anonKey ?? 'public-anon-key',
  {
    auth: createSupabaseAuthOptions(),
  },
)

setupCrossDomainSSO(supabase)
