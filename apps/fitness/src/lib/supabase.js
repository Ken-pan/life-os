import { LIFE_OS_AUTH_STORAGE_KEY } from '@life-os/sync';
import { createClient } from '@supabase/supabase-js';

// Life OS 统一 Supabase 项目（原 Finance OS + FitnessOS 合并）
// Fitness 数据在 fitness schema；Finance 在 public schema；auth.users 共享。
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://iueozzuctstwvzbcxcyh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: 'fitness' },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // 与 Finance OS 共用同一 auth 存储键，同域下登录态互通
    storageKey: LIFE_OS_AUTH_STORAGE_KEY,
  },
});
