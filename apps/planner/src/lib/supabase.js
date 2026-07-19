import { createLifeOsSupabaseClient } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'
import { guardPlannerKenosWriters } from './kenos/prodWriteGuard.core.js'

// Life OS 统一 Supabase 项目（Planner 数据在 public.planner_* 表）
const created = createLifeOsSupabaseClient(createClient, { env: import.meta.env })
export const isSupabaseConfigured = created.isSupabaseConfigured
export const supabase = created.supabase
  ? guardPlannerKenosWriters(created.supabase, import.meta.env)
  : created.supabase
