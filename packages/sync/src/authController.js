import { createAuthSyncHandler } from './authSync.js'
import { createCoreIdentityHandler } from './coreIdentity.js'
import { LIFE_OS_PERSONAL_OWNER_EMAIL } from './constants.js'
import { ensureLifeOsSsoReady } from './supabaseClient.js'

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
 *   onAllowedAppKeys?: (appKeys: string[] | null) => void;
 *   landingOrigin?: string | (() => string);
 * }} options
 */
export function createLifeOsAuth(supabase, options) {
  const { appId, onSession, onSignedOut, onSyncSession, onAllowedAppKeys, landingOrigin } = options

  function getPortalOrigin() {
    if (typeof landingOrigin === 'function') {
      const resolved = landingOrigin()
      if (resolved) return resolved
    } else if (typeof landingOrigin === 'string' && landingOrigin.trim()) {
      return landingOrigin.trim()
    }
    if (typeof window === 'undefined') return 'https://portal.kenos.space'
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://127.0.0.1:5195'
    }
    const parts = host.split('.')
    if (parts.length >= 2) {
      const domain = parts.slice(-2).join('.')
      return `https://portal.${domain}`
    }
    return 'https://portal.kenos.space'
  }

  function isPersonalOwner(session) {
    return session?.user?.email?.toLowerCase() === LIFE_OS_PERSONAL_OWNER_EMAIL
  }

  function normalizeAllowedAppKeys(session, appKeys) {
    if (!session?.user) return null
    if (isPersonalOwner(session)) return appKeys
    return appKeys.filter((key) => key === 'fitness')
  }

  function redirectToPortal() {
    if (typeof window !== 'undefined') {
      window.location.href = getPortalOrigin()
    }
  }

  async function loadActiveMembershipAppKeys(session) {
    const query = supabase.schema('public').from('app_memberships')
    const { data: memberships, error } = await query
      .select('app_key')
      .eq('user_id', session.user.id)
      .eq('status', 'active')

    if (error || !memberships) return []
    return [...new Set(memberships.map((membership) => membership.app_key))]
  }

  async function checkAppAccess(session) {
    if (!session?.user) {
      onAllowedAppKeys?.(null)
      return
    }

    const allowedAppKeys = normalizeAllowedAppKeys(
      session,
      await loadActiveMembershipAppKeys(session),
    )
    onAllowedAppKeys?.(allowedAppKeys)

    if (appId !== 'portal') {
      const hasAccess = allowedAppKeys.includes(appId)
      if (!hasAccess) redirectToPortal()
    }
  }

  function init() {
    if (typeof window === 'undefined') return () => {}

    let cancelled = false
    let ssoBootstrapped = false
    let accessCheckGen = 0
    const handleAuthSync = createAuthSyncHandler({
      onSignedOut,
      onSyncSession,
    })
    const handleCoreIdentity = createCoreIdentityHandler(supabase, appId)

    function scheduleAccessCheck(session) {
      const gen = ++accessCheckGen
      void checkAppAccess(session).catch(() => {
        if (cancelled || gen !== accessCheckGen) return
      })
    }

    // Subscribe first so SSO setSession → SIGNED_IN is not missed, but do not
    // publish a cold null session until Cookie/Keychain restore has finished.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      // Suppress provisional empty INITIAL_SESSION only until SSO bootstrap.
      if (!session && event === 'INITIAL_SESSION' && !ssoBootstrapped) return
      onSession(session)
      handleAuthSync(event, session)
      handleCoreIdentity(event, session)
      scheduleAccessCheck(session)
    })

    void (async () => {
      await ensureLifeOsSsoReady(supabase)
      if (cancelled) return
      ssoBootstrapped = true
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      onSession(session)
      scheduleAccessCheck(session)
    })()

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }

  async function signUp(email, password) {
    if (appId !== 'fitness') {
      throw new Error('New user registration is only available through FitnessOS.')
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          signup_app: appId,
        },
      },
    })
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
