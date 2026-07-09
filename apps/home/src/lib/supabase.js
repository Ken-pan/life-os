import { createLifeOsSupabaseClient } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

// Life OS 统一 Supabase 项目（Home 实验：仅 core_* 身份，无业务 schema 同步）
export const { supabase, isSupabaseConfigured } = createLifeOsSupabaseClient(
  createClient,
  { env: import.meta.env },
)
