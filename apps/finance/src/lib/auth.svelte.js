// 端口自 src/auth/AuthGate.tsx 中的 Supabase auth 生命周期部分（登录态本身）。
// 数据加载 / 云端同步的具体逻辑留给 finance.svelte.js 等模块通过 registerAuthHandlers 接入，
// 避免这里直接依赖 finance store（防止循环引用）。
import { createAppAuthStore } from '@life-os/sync/svelte/auth-store'
import { supabase } from './supabase.js'
import { clearAllCache } from './localCache.js'
import { t } from './i18n.svelte.js'

/** @type {(() => void) | null} */
let signedOutHandler = null
/** @type {((options: { force?: boolean }) => void | Promise<unknown>) | null} */
let syncSessionHandler = null

/**
 * 供 finance.svelte.js 等模块注册登出清理 / 会话同步回调。
 * @param {{ onSignedOut?: () => void, onSyncSession?: (options: { force?: boolean }) => void | Promise<unknown> }} handlers
 */
export function registerAuthHandlers(handlers = {}) {
  if (handlers.onSignedOut) signedOutHandler = handlers.onSignedOut
  if (handlers.onSyncSession) syncSessionHandler = handlers.onSyncSession
}

export const { auth, initAuth, authErrorMessage, signUp, signIn, signOut } =
  createAppAuthStore(supabase, {
    appId: 'finance',
    // finance-core 的 i18n 消息里暂无逐类型的 auth 错误文案，用 loginFailed / initFailed 兜底。
    errorLabels: () => ({
      invalidCredentials: t('auth.loginFailed'),
      emailNotConfirmed: t('auth.loginFailed'),
      alreadyRegistered: t('auth.loginFailed'),
      passwordShort: t('auth.loginFailed'),
      invalidEmail: t('auth.loginFailed'),
      rateLimit: t('auth.errRateLimit'),
      network: t('auth.errNetwork'),
      generic: t('auth.initFailed'),
    }),
    // Empty session after SSO bootstrap = truly signed out (authController awaits
    // ensureLifeOsSsoReady so Continuity cold starts no longer race AuthGate).
    onSessionChange: (session) => {
      if (!session) signedOutHandler?.()
    },
    onSignedOut: () => {
      clearAllCache()
      signedOutHandler?.()
    },
    onSyncSession: (options) => syncSessionHandler?.(options),
  })
