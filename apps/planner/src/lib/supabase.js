import { createLifeOsSupabaseClient } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

// Life OS 统一 Supabase 项目（Planner 数据在 public.planner_* 表）
export const { supabase, isSupabaseConfigured } = createLifeOsSupabaseClient(
  createClient,
  { env: import.meta.env },
)
