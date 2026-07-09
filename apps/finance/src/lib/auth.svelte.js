// 端口自 src/auth/AuthGate.tsx 中的 Supabase auth 生命周期部分（登录态本身）→
// Svelte 5 runes 模块，模式对齐 apps/planner/src/lib/auth.svelte.js（appId 换成 'finance'）。
// 数据加载 / 云端同步的具体逻辑留给 finance.svelte.js 等模块通过 registerAuthHandlers 接入，
// 避免这里直接依赖 finance store（防止循环引用）。
import { browser } from '$app/environment'
import { createLifeOsAuth, mapAuthErrorMessage } from '@life-os/sync'
import { supabase } from './supabase.js'
import { clearAllCache } from './localCache.js'
import { t } from './i18n.svelte.js'

export const auth = $state({
  user: null,
  session: null,
  ready: false,
})

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

const lifeOsAuth = createLifeOsAuth(supabase, {
  appId: 'finance',
  onSession: (session) => {
    auth.session = session
    auth.user = session?.user ?? null
    auth.ready = true
    // 与 React AuthGate 对齐：session 为空即走登出清理（含冷启动未登录）。
    // packages/sync 的 onSignedOut 只在 SIGNED_OUT 触发，不会覆盖「从未登录」。
    if (!session) signedOutHandler?.()
  },
  onSignedOut: () => {
    clearAllCache()
    signedOutHandler?.()
  },
  onSyncSession: (options) => syncSessionHandler?.(options),
})

export function initAuth() {
  if (!browser) return () => {}
  return lifeOsAuth.init()
}

export const { signUp, signIn, signOut } = lifeOsAuth

// finance-core 的 i18n 消息里暂无逐类型的 auth 错误文案（invalidCredentials /
// emailNotConfirmed / alreadyRegistered / passwordShort / invalidEmail），
// 目前用 loginFailed / initFailed 兜底；后续若要精细化文案需先补 messages。
const authErrorLabels = () => ({
  invalidCredentials: t('auth.loginFailed'),
  emailNotConfirmed: t('auth.loginFailed'),
  alreadyRegistered: t('auth.loginFailed'),
  passwordShort: t('auth.loginFailed'),
  invalidEmail: t('auth.loginFailed'),
  rateLimit: t('auth.errRateLimit'),
  network: t('auth.errNetwork'),
  generic: t('auth.initFailed'),
})

export function authErrorMessage(err) {
  return mapAuthErrorMessage(err, authErrorLabels())
}
