import { createLifeOsAuth } from '../authController.js'
import { mapAuthErrorMessage } from '../authErrorMessage.js'

/**
 * Life OS 统一 app auth store（Svelte 5 runes）。
 * 各 app 在自己的 auth.svelte.js 里实例化并 re-export，保持既有 import 路径 —
 * 抽取自 6 个 app 的同构实现（PLAT.CORE.3 提取审计 2026-07）。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   appId: string,
 *   errorLabels:
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
    return mapAuthErrorMessage(err, labels)
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
