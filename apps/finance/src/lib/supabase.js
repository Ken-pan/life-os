import { createLifeOsSupabaseClient } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

// Finance 保持 env 门禁：缺配置时不回落生产项目，由 AuthGate 提示 config-missing
const client = createLifeOsSupabaseClient(createClient, {
  env: import.meta.env,
  productionFallback: false,
})

export const supabase = client.supabase
export const isSupabaseConfigured = client.isSupabaseConfigured
export const supabaseUrl = client.url

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] 缺少 PUBLIC_SUPABASE_* 或 VITE_SUPABASE_*，登录与同步功能不可用。',
  )
}
