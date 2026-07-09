import { createAuthSyncHandler } from './authSync.js'
import { createCoreIdentityHandler } from './coreIdentity.js'

/**
 * Life OS 标准 auth 生命周期：getSession 引导 + onAuthStateChange 上接
 * authSync（登录触发双向同步 / 登出清理）与 coreIdentity（core_profiles 兜底），
 * 外加统一的 signUp / signIn / signOut。
 *
 * 响应式状态留在 app 内（Svelte $state / React state），通过 `onSession`
 * 回调写入 —— 本包不依赖任何框架。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   appId: 'finance' | 'fitness' | 'planner' | 'music' | 'portal' | 'home';
 *   onSession: (session: import('@supabase/supabase-js').Session | null) => void;
 *   onSignedOut?: () => void;
 *   onSyncSession?: (options: { force?: boolean }) => void | Promise<unknown>;
 * }} options
 */
export function createLifeOsAuth(supabase, options) {
  const { appId, onSession, onSignedOut, onSyncSession } = options

  function init() {
    if (typeof window === 'undefined') return () => {}

    supabase.auth.getSession().then(({ data }) => {
      onSession(data.session)
    })

    const handleAuthSync = createAuthSyncHandler({
      onSignedOut,
      onSyncSession,
    })
    const handleCoreIdentity = createCoreIdentityHandler(supabase, appId)

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      onSession(session)
      handleAuthSync(event, session)
      handleCoreIdentity(event, session)
    })

    return () => data.subscription.unsubscribe()
  }

  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return { needsConfirm: !data.session, user: data.user }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    onSignedOut?.()
  }

  return { init, signUp, signIn, signOut }
}
