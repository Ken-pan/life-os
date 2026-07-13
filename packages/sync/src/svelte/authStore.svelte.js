import { createLifeOsAuth } from '../authController.js'
import { mapAuthErrorMessage } from '../authErrorMessage.js'

/** 缺省 zh 文案（home / portal 原静态对象上提）；带 i18n 的 app 用 errorLabels 覆盖 */
export const DEFAULT_AUTH_ERROR_LABELS = {
  invalidCredentials: '邮箱或密码不正确',
  emailNotConfirmed: '请先完成邮箱验证后再登录',
  alreadyRegistered: '该邮箱已注册，请直接登录',
  passwordShort: '密码至少需要 6 个字符',
  invalidEmail: '邮箱格式不正确',
  rateLimit: '尝试次数过多，请稍后再试',
  network: '网络异常，请检查连接后重试',
  generic: '登录失败，请稍后重试',
}

/**
 * Life OS 统一 app auth store（Svelte 5 runes）。
 * 各 app 在自己的 auth.svelte.js 里实例化并 re-export，保持既有 import 路径 —
 * 抽取自 6 个 app 的同构实现（PLAT.CORE.3 提取审计 2026-07）。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   appId: string,
 *   errorLabels?:
 *     | Record<string, string>
 *     | (() => Record<string, string>),
 *   onSignedOut?: () => void,
 *   onSyncSession?: (payload: { force: boolean }) => void,
 *   onSessionChange?: (session: import('@supabase/supabase-js').Session | null) => void,
 * }} options
 * `errorLabels` 支持函数形式以便接 i18n（随 locale 切换实时求值）。
 * `onSessionChange` 在 store 字段更新后调用（如 Finance 的空会话清理）。
 */
export function createAppAuthStore(supabase, options) {
  const { appId, errorLabels, onSignedOut, onSyncSession, onSessionChange } =
    options

  const auth = $state({
    user: /** @type {import('@supabase/supabase-js').User | null} */ (null),
    session:
      /** @type {import('@supabase/supabase-js').Session | null} */ (null),
    ready: false,
    allowedAppKeys: /** @type {string[] | null} */ (null),
  })

  const lifeOsAuth = createLifeOsAuth(supabase, {
    appId,
    onSession: (session) => {
      auth.session = session
      auth.user = session?.user ?? null
      auth.ready = true
      onSessionChange?.(session)
    },
    onAllowedAppKeys: (appKeys) => {
      auth.allowedAppKeys = appKeys
    },
    ...(onSignedOut ? { onSignedOut } : {}),
    ...(onSyncSession ? { onSyncSession } : {}),
  })

  /** SSR 安全：非浏览器环境下 init 是 no-op。@returns {() => void} */
  function initAuth() {
    if (typeof window === 'undefined') return () => {}
    return lifeOsAuth.init()
  }

  /** @param {unknown} err */
  function authErrorMessage(err) {
    const labels =
      typeof errorLabels === 'function' ? errorLabels() : errorLabels
    return mapAuthErrorMessage(err, {
      ...DEFAULT_AUTH_ERROR_LABELS,
      ...(labels ?? {}),
    })
  }

  return {
    auth,
    initAuth,
    authErrorMessage,
    signUp: lifeOsAuth.signUp,
    signIn: lifeOsAuth.signIn,
    signOut: lifeOsAuth.signOut,
  }
}
