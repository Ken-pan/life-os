import { LIFE_OS_AUTH_STORAGE_KEY } from "@life-os/sync";
import { createClient } from "@supabase/supabase-js";

// Life OS 统一 Supabase 项目（Finance 数据在 public schema；Fitness 在 fitness schema）
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // 不抛错，便于在未配置时给出友好的引导界面（见 AuthGate）。
  console.warn(
    "[supabase] 缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，登录与同步功能不可用。"
  );
}

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "public-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // 与 Fitness OS 共用同一 auth 存储键（Life OS 统一账号）
    storageKey: LIFE_OS_AUTH_STORAGE_KEY,
  },
});
