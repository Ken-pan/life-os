import { createLifeOsSupabaseClient } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

// Life OS 统一 Supabase 项目（Fitness 数据在 fitness schema）
export const { supabase } = createLifeOsSupabaseClient(createClient, {
  env: import.meta.env,
  schema: 'fitness',
})
