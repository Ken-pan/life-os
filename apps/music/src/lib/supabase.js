import { LIFE_OS_AUTH_STORAGE_KEY } from '@life-os/sync';
import { createClient } from '@supabase/supabase-js';

// Life OS 统一 Supabase 项目（Planner / Fitness / Finance / Music 共享 auth.users）
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://iueozzuctstwvzbcxcyh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: 'music' },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: LIFE_OS_AUTH_STORAGE_KEY
  }
});
