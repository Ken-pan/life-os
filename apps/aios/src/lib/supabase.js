import { createLifeOsSupabaseClient } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

// Life OS 统一 Supabase 项目(AIOS 数据在 aios schema)。
// 共享 auth storage key:与 home/portal/music 等同一登录态,登录即用,零配置。
export const { supabase, isSupabaseConfigured } = createLifeOsSupabaseClient(
  createClient,
  {
    env: import.meta.env,
    schema: 'aios',
  },
)
