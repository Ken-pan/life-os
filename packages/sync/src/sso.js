/** Shared cookie for cross-origin Life OS auth (subdomains + same-host multi-port). */
export const LIFE_OS_SSO_COOKIE_NAME = 'lifeos_shared_session'

/**
 * Cookie Domain attribute for SSO.
 * - `.kenos.space` → parent-domain cookie (cross-subdomain)
 * - `''` → host-only cookie (shared across ports on same host: LAN Daily Beta / localhost)
 * - `null` → do not write (non-browser / empty host)
 */
export function resolveSsoCookieDomain(hostname) {
  if (!hostname || typeof hostname !== 'string') return null
  const host = hostname.trim().toLowerCase()
  if (!host) return null
  if (host === 'kenos.space' || host.endsWith('.kenos.space'))
    return '.kenos.space'
  // localhost, 127.0.0.1, LAN IPs, custom hosts: host-only (RFC 6265 — cookies ignore port)
  return ''
}

function getCookieDomain() {
  if (typeof window === 'undefined') return null
  return resolveSsoCookieDomain(window.location.hostname)
}

function writeCookie(value, maxAge, domain) {
  if (typeof document === 'undefined') return
  const domainStr = domain ? `; domain=${domain}` : ''
  const isSecure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
  const secureStr = isSecure ? '; Secure' : ''
  document.cookie = `${LIFE_OS_SSO_COOKIE_NAME}=${value}; path=/; max-age=${maxAge}${domainStr}; SameSite=Lax${secureStr}`
}

function setSharedCookie(tokens) {
  if (typeof document === 'undefined') return
  const domain = getCookieDomain()
  if (domain === null) return

  const value = encodeURIComponent(JSON.stringify(tokens))
  // Soft cap — oversized cookies are often dropped by browsers.
  if (value.length > 3000) {
    console.warn('[sso] tokens size exceeds 3KB, cookie might be rejected.')
  }

  const maxAge = 365 * 24 * 60 * 60
  writeCookie(value, maxAge, domain)
}

function clearSharedCookie() {
  if (typeof document === 'undefined') return
  // Clear host-only + parent-domain variants so logout is complete on either path.
  writeCookie('', 0, '')
  writeCookie('', 0, '.kenos.space')
}

function getSharedCookie() {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp('(^|;) ?' + LIFE_OS_SSO_COOKIE_NAME + '=([^;]+)'),
  )
  if (!match) return null
  try {
    return JSON.parse(decodeURIComponent(match[2]))
  } catch {
    return null
  }
}

/** @returns {((method: string, params?: object) => Promise<unknown>) | null} */
function nativeBridgeCall() {
  if (typeof window === 'undefined') return null
  const call = window.__KENOS_NATIVE_BRIDGE__?.call
  return typeof call === 'function'
    ? call.bind(window.__KENOS_NATIVE_BRIDGE__)
    : null
}

/**
 * Mirror session into Kenos iOS Keychain vault (Continuity cross-origin seed).
 * @param {import('@supabase/supabase-js').Session | null} session
 */
function reportNativeAuthSession(session) {
  const call = nativeBridgeCall()
  if (!call) return
  try {
    if (session?.access_token && session?.refresh_token) {
      void call('reportAuthSession', {
        signedIn: true,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        userId: session.user?.id || '',
        email: session.user?.email || '',
      }).catch(() => {})
    } else {
      void call('reportAuthSession', { signedIn: false }).catch(() => {})
    }
  } catch {
    /* bridge unavailable */
  }
}

/**
 * Ask native shell for tokens saved from another Continuity origin.
 * @returns {Promise<{ access_token?: string, refresh_token?: string } | null>}
 */
async function fetchNativeSharedTokens() {
  const call = nativeBridgeCall()
  if (!call) return null
  try {
    const result = await call('getSharedAuthTokens', {})
    if (
      result &&
      typeof result === 'object' &&
      result.signedIn &&
      result.access_token &&
      result.refresh_token
    ) {
      return {
        access_token: String(result.access_token),
        refresh_token: String(result.refresh_token),
      }
    }
  } catch {
    /* bridge unavailable / host blocked */
  }
  return null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ access_token: string, refresh_token: string }} tokens
 * @param {string} source
 */
async function restoreSessionFromTokens(supabase, tokens, source) {
  console.log(`[sso] No local session found, restoring from ${source}...`)
  const { error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  })
  if (error) {
    console.error(
      `[sso] Failed to restore session from ${source}:`,
      error.message,
    )
    return false
  }
  return true
}

/**
 * Cross-origin SSO for Life OS apps.
 * Order: Cookie (*.kenos.space / LAN host-only) → Kenos iOS Keychain vault.
 * On SIGNED_IN, mirrors tokens to Cookie + native vault.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function setupCrossDomainSSO(supabase) {
  if (typeof window === 'undefined') return

  // 1. Mirror auth events into Cookie + native vault.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (session?.access_token && session?.refresh_token) {
        setSharedCookie({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
        reportNativeAuthSession(session)
      }
    } else if (event === 'SIGNED_OUT') {
      clearSharedCookie()
      reportNativeAuthSession(null)
    }
  })

  // 2. Cold start: restore when this origin has no session yet.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    // Already signed in on this origin — keep native vault warm.
    reportNativeAuthSession(session)
    return
  }

  const cookieTokens = getSharedCookie()
  if (cookieTokens?.access_token && cookieTokens?.refresh_token) {
    const ok = await restoreSessionFromTokens(
      supabase,
      cookieTokens,
      'shared cookie',
    )
    if (!ok) clearSharedCookie()
    if (ok) return
  }

  const nativeTokens = await fetchNativeSharedTokens()
  if (nativeTokens) {
    const ok = await restoreSessionFromTokens(
      supabase,
      nativeTokens,
      'native vault',
    )
    if (!ok) {
      // Stale Keychain material — drop so the next origin can re-login cleanly.
      reportNativeAuthSession(null)
    }
  }
}
