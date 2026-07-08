import { createLifeOsSupabaseClient } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

// Life OS 统一 Supabase 项目（Portal 只读 core_* 与各 app 概览）
export const { supabase, isSupabaseConfigured } = createLifeOsSupabaseClient(
  createClient,
  { env: import.meta.env },
)
