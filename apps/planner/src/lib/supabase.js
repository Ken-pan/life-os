import { LIFE_OS_AUTH_STORAGE_KEY } from '@life-os/sync';
import { createClient } from '@supabase/supabase-js';

// Life OS 统一 Supabase 项目（Planner 数据在 public.planner_* 表）
const FALLBACK_URL = 'https://iueozzuctstwvzbcxcyh.supabase.co';
const FALLBACK_KEY = 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || FALLBACK_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: LIFE_OS_AUTH_STORAGE_KEY },
});
