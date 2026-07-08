const SSO_COOKIE_NAME = 'lifeos_shared_session'

function getCookieDomain() {
  if (typeof window === 'undefined') return ''
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') return ''
  if (hostname.endsWith('.kenos.space')) return '.kenos.space'
  return ''
}

function setSharedCookie(tokens) {
  if (typeof document === 'undefined') return
  const domain = getCookieDomain()
  if (!domain) return // SSO 仅在明确的共享域下生效（或可放宽给 localhost 调试，但 localhost 不存在跨域问题）

  const value = encodeURIComponent(JSON.stringify(tokens))
  // 限制一下大小，如果超 3KB 可能会被截断，但通常 token 不会超
  if (value.length > 3000) {
    console.warn('[sso] tokens size exceeds 3KB, cookie might be rejected.')
  }
  
  const domainStr = `; domain=${domain}`
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const secureStr = isSecure ? '; Secure' : ''
  const maxAge = 365 * 24 * 60 * 60
  
  document.cookie = `${SSO_COOKIE_NAME}=${value}; path=/; max-age=${maxAge}${domainStr}; SameSite=Lax${secureStr}`
}

function clearSharedCookie() {
  if (typeof document === 'undefined') return
  const domain = getCookieDomain()
  const domainStr = domain ? `; domain=${domain}` : ''
  document.cookie = `${SSO_COOKIE_NAME}=; path=/; max-age=0${domainStr}`
}

function getSharedCookie() {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^|;) ?' + SSO_COOKIE_NAME + '=([^;]+)'))
  if (!match) return null
  try {
    return JSON.parse(decodeURIComponent(match[2]))
  } catch (e) {
    return null
  }
}

/**
 * 设置跨子域免密登录 (SSO)
 * 原理：利用 localStorage 存完整 session，同时把精简的 auth tokens 同步到父级域 Cookie。
 * 当用户访问新子域时，如果 localStorage 无会话但存在父级域 Cookie，则自动执行 setSession。
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function setupCrossDomainSSO(supabase) {
  if (typeof window === 'undefined') return

  // 1. 监听状态变更，同步到 Cookie
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (session?.access_token && session?.refresh_token) {
        setSharedCookie({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
      }
    } else if (event === 'SIGNED_OUT') {
      clearSharedCookie()
    }
  })

  // 2. 页面加载时，检查是否需要从 Cookie 恢复会话
  const { data: { session } } = await supabase.auth.getSession()
  
  // 如果本地没有 session，尝试从 SSO Cookie 恢复
  if (!session) {
    const sharedTokens = getSharedCookie()
    if (sharedTokens?.access_token && sharedTokens?.refresh_token) {
      console.log('[sso] No local session found, restoring from shared cross-domain cookie...')
      const { error } = await supabase.auth.setSession({
        access_token: sharedTokens.access_token,
        refresh_token: sharedTokens.refresh_token,
      })
      if (error) {
        console.error('[sso] Failed to restore session from cookie:', error.message)
        clearSharedCookie()
      }
    }
  }
}
