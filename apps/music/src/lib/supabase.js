import { createLifeOsSupabaseClient } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

// Life OS 统一 Supabase 项目（Music 数据在 music schema）
export const {
  supabase,
  url: SUPABASE_URL,
  anonKey: SUPABASE_PUBLISHABLE_KEY,
  isSupabaseConfigured,
} = createLifeOsSupabaseClient(createClient, {
  env: import.meta.env,
  schema: 'music',
})
