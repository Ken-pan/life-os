import { createAppAuthStore } from '@life-os/sync/svelte/auth-store'
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

export const { auth, initAuth, authErrorMessage, signUp, signIn, signOut } =
  createAppAuthStore(supabase, {
    appId: 'home',
    errorLabels: AUTH_ERROR_LABELS,
  })
