import { browser } from '$app/environment'
import { createLifeOsAuth, mapAuthErrorMessage } from '@life-os/sync'
import { supabase } from './supabase.js'

const AUTH_ERROR_LABELS = {
  invalidCredentials: '邮箱或密码不正确',
  emailNotConfirmed: '请先完成邮箱验证后再登录',
  alreadyRegistered: '该邮箱已注册，请直接登录',
  passwordShort: '密码至少需要 6 个字符',
  invalidEmail: '邮箱格式不正确',
  rateLimit: '尝试次数过多，请稍后再试',
  network: '网络异常，请检查连接后重试',
  generic: '登录失败，请稍后重试',
}

/** @type {{ user: import('@supabase/supabase-js').User | null; session: import('@supabase/supabase-js').Session | null; ready: boolean; allowedAppKeys: string[] | null }} */
export const auth = $state({
  user: null,
  session: null,
  ready: false,
  allowedAppKeys: /** @type {string[] | null} */ (null),
})

const lifeOsAuth = createLifeOsAuth(supabase, {
  appId: 'home',
  onSession: (session) => {
    auth.session = session
    auth.user = session?.user ?? null
    auth.ready = true
  },
  onAllowedAppKeys: (appKeys) => {
    auth.allowedAppKeys = appKeys
  },
})

export function initAuth() {
  if (!browser) return () => {}
  return lifeOsAuth.init()
}

export const { signOut, signIn, signUp } = lifeOsAuth

/** @param {unknown} err */
export function authErrorMessage(err) {
  return mapAuthErrorMessage(err, AUTH_ERROR_LABELS)
}
