import { createAppAuthStore } from '@life-os/sync/svelte/auth-store'
import { supabase } from './supabase.js'

// 错误文案用 auth-store 内置缺省 zh 文案（DEFAULT_AUTH_ERROR_LABELS）
export const { auth, initAuth, authErrorMessage, signUp, signIn, signOut } =
  createAppAuthStore(supabase, { appId: 'portal' })
