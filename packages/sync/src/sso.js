/** Shared cookie for cross-origin Life OS auth (subdomains + same-host multi-port). */
export const LIFE_OS_SSO_COOKIE_NAME = 'lifeos_shared_session'

/** @type {WeakSet<object>} */
const ATTACHED = new WeakSet()

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

/**
 * Soft-parse JWT `exp` (no signature verify — client gate only).
 * @param {string | null | undefined} token
 * @returns {number | null} unix seconds
 */
export function parseJwtExp(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json =
      typeof atob === 'function'
        ? atob(b64 + pad)
        : Buffer.from(b64 + pad, 'base64').toString('utf8')
    const payload = JSON.parse(json)
    const exp = Number(payload?.exp)
    return Number.isFinite(exp) ? exp : null
  } catch {
    return null
  }
}

/**
 * Access token usable for setSession without an immediate refresh.
 * Treat missing/unparseable exp as fresh (legacy opaque tokens / tests).
 * @param {string | null | undefined} accessToken
 * @param {number} [skewSeconds] clock skew + network budget
 */
export function isAccessTokenFresh(accessToken, skewSeconds = 60) {
  const exp = parseJwtExp(accessToken)
  if (exp == null) return Boolean(accessToken)
  return exp > Date.now() / 1000 + skewSeconds
}

/**
 * @param {unknown} raw
 * @returns {{ access_token: string, refresh_token: string } | null}
 */
export function normalizeSsoTokens(raw) {
  if (!raw || typeof raw !== 'object') return null
  const access = String(
    /** @type {{ access_token?: unknown }} */ (raw).access_token || '',
  ).trim()
  const refresh = String(
    /** @type {{ refresh_token?: unknown }} */ (raw).refresh_token || '',
  ).trim()
  // Refresh is required; access may be empty when vault stores refresh-only.
  if (!refresh) return null
  return { access_token: access, refresh_token: refresh }
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
  const normalized = normalizeSsoTokens(tokens)
  if (!normalized?.refresh_token) return

  const value = encodeURIComponent(JSON.stringify(normalized))
  // Soft cap — oversized cookies are often dropped by browsers / WKWebView.
  if (value.length > 3500) {
    console.warn('[sso] tokens size exceeds 3.5KB, cookie might be rejected.')
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
    return normalizeSsoTokens(JSON.parse(decodeURIComponent(match[2])))
  } catch {
    return null
  }
}

function currentHostname() {
  if (typeof window === 'undefined') return ''
  try {
    return String(window.location.hostname || '').toLowerCase()
  } catch {
    return ''
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

function isLikelyNativeShell() {
  if (typeof window === 'undefined') return false
  if (window.__KENOS_NATIVE_BRIDGE__) return true
  if (window.__KENOS_IOS_NATIVE_SHELL__) return true
  try {
    return document.documentElement?.dataset?.iosNativeShell === 'true'
  } catch {
    return false
  }
}

/**
 * Bridge is injected atDocumentStart, but module evaluation can still race the
 * first paint on Continuity.
 * @param {number} [timeoutMs]
 */
async function waitForNativeBridge(timeoutMs = 900) {
  if (nativeBridgeCall()) return true
  if (!isLikelyNativeShell()) {
    // Still poll briefly — cookie miss often means we need the vault path.
  }
  const start =
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  while (
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
      start <
    timeoutMs
  ) {
    if (nativeBridgeCall()) return true
    await new Promise((r) => setTimeout(r, 40))
  }
  return !!nativeBridgeCall()
}

/**
 * Mirror session into Kenos iOS Keychain vault (Continuity cross-origin seed).
 * @param {import('@supabase/supabase-js').Session | null} session
 */
function reportNativeAuthSession(session) {
  const call = nativeBridgeCall()
  if (!call) return
  const host = currentHostname()
  try {
    if (session?.access_token && session?.refresh_token) {
      void call('reportAuthSession', {
        signedIn: true,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        userId: session.user?.id || '',
        email: session.user?.email || '',
        host,
      }).catch(() => {})
    } else {
      void call('reportAuthSession', { signedIn: false, host }).catch(() => {})
    }
  } catch {
    /* bridge unavailable */
  }
}

/**
 * Ask native shell for tokens saved from another Continuity origin.
 * @returns {Promise<{ access_token: string, refresh_token: string } | null>}
 */
async function fetchNativeSharedTokens() {
  await waitForNativeBridge()
  const call = nativeBridgeCall()
  if (!call) return null
  const host = currentHostname()
  const attempts = 3
  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await call('getSharedAuthTokens', { host })
      if (result && typeof result === 'object') {
        if (result.ok && !result.signedIn) return null
        const tokens = normalizeSsoTokens(result)
        if (tokens) return tokens
      }
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String(err.code)
          : ''
      const retryable =
        code === 'host_not_allowed' ||
        code === 'native_bridge_timeout' ||
        code === 'native_bridge_unavailable' ||
        code === 'native_bridge_error'
      if (!retryable) return null
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 80 * (i + 1)))
    }
  }
  return null
}

/**
 * Auth errors mean material is dead; network/5xx should keep vault for retry.
 * @param {{ message?: string, status?: number, code?: string } | null} error
 */
export function isFatalAuthRestoreError(error) {
  if (!error) return false
  const status = Number(error.status)
  if (status === 400 || status === 401 || status === 403) return true
  const code = String(error.code || '').toLowerCase()
  if (
    code.includes('refresh_token') ||
    code === 'invalid_grant' ||
    code === 'session_not_found'
  ) {
    return true
  }
  const msg = String(error.message || '').toLowerCase()
  return (
    msg.includes('invalid refresh') ||
    msg.includes('refresh token not') ||
    msg.includes('invalid jwt') ||
    (msg.includes('session') && msg.includes('not found'))
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ access_token: string, refresh_token: string }} tokens
 * @param {string} source
 * @returns {Promise<'ok' | 'fatal' | 'transient'>}
 */
async function restoreSessionFromTokens(supabase, tokens, source) {
  const normalized = normalizeSsoTokens(tokens)
  if (!normalized) return 'fatal'

  console.log(`[sso] No local session found, restoring from ${source}...`)

  // Prefer refresh when access is missing/expired — industry default for SSO cookies.
  if (
    !normalized.access_token ||
    !isAccessTokenFresh(normalized.access_token)
  ) {
    if (typeof supabase.auth.refreshSession === 'function') {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: normalized.refresh_token,
      })
      if (!error && data?.session) return 'ok'
      if (error && isFatalAuthRestoreError(error)) {
        console.error(
          `[sso] Fatal refresh from ${source}:`,
          error.message || error,
        )
        return 'fatal'
      }
      if (error) {
        console.warn(
          `[sso] Transient refresh from ${source}:`,
          error.message || error,
        )
        return 'transient'
      }
    }
  }

  if (!normalized.access_token) return 'fatal'

  const { error } = await supabase.auth.setSession({
    access_token: normalized.access_token,
    refresh_token: normalized.refresh_token,
  })
  if (!error) return 'ok'
  if (isFatalAuthRestoreError(error)) {
    console.error(`[sso] Fatal restore from ${source}:`, error.message)
    return 'fatal'
  }
  console.warn(`[sso] Transient restore from ${source}:`, error.message)
  return 'transient'
}

function mirrorSession(session) {
  if (!session?.access_token || !session?.refresh_token) return
  setSharedCookie({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  reportNativeAuthSession(session)
}

function bindSessionWarmOnResume(supabase) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const warm = () => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data?.session) mirrorSession(data.session)
    })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') warm()
  })
  window.addEventListener('pageshow', (ev) => {
    // bfcache restore — re-mirror so Continuity vault stays warm.
    if (ev.persisted) warm()
  })
}

/** 原生壳灌完会话 vault 时广播的事件名(Swift 侧 KenosNativeCapabilityBridge 派发)。 */
export const KENOS_AUTH_VAULT_READY_EVENT = 'kenos:auth-vault-ready'

/**
 * 事件驱动的壳内会话恢复(长期修复,替代纯轮询):
 * Kenos 壳在 Face ID 解锁 + 设备交换完成、vault 就绪时主动派发
 * `kenos:auth-vault-ready`;web 侧收到后立即重放恢复,不再靠时间竞猜。
 * 与冷启恢复互补闭环:web 先启 → 事件到达时监听已就位;原生先灌 → 冷启直接读到 vault。
 */
function bindNativeVaultReadyRestore(supabase) {
  if (typeof window === 'undefined') return
  window.addEventListener(KENOS_AUTH_VAULT_READY_EVENT, () => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data?.session) {
          mirrorSession(data.session)
          return
        }
        const tokens = await fetchNativeSharedTokens()
        if (tokens) {
          await restoreSessionFromTokens(
            supabase,
            tokens,
            'native vault (push)',
          )
        }
      } catch {
        /* 冷启恢复与壳内有界重试仍在,事件失败不致断链 */
      }
    })()
  })
}

/**
 * Re-attempt shared-session restore (Cookie → native vault) after cold start.
 * Native shells (Kenos iOS/Mac) seed the vault only after Face ID unlock +
 * device exchange, which can land after the web app booted — this lets the
 * signed-out UI retry without a full reload.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<boolean>} true when a session is present afterwards
 */
export async function retryLifeOsSharedSessionRestore(supabase) {
  if (typeof window === 'undefined') return false
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session) return true

  const cookieTokens = getSharedCookie()
  if (cookieTokens) {
    const result = await restoreSessionFromTokens(
      supabase,
      cookieTokens,
      'shared cookie (retry)',
    )
    if (result === 'ok') return true
    if (result === 'fatal') clearSharedCookie()
  }

  const nativeTokens = await fetchNativeSharedTokens()
  if (nativeTokens) {
    const result = await restoreSessionFromTokens(
      supabase,
      nativeTokens,
      'native vault (retry)',
    )
    if (result === 'ok') return true
  }
  return false
}

/**
 * Cross-origin SSO for Life OS apps.
 * Order: Cookie (*.kenos.space / LAN host-only) → Kenos iOS Keychain vault.
 * On SIGNED_IN, mirrors tokens to Cookie + native vault.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function setupCrossDomainSSO(supabase) {
  if (typeof window === 'undefined') return
  // HMR / double-import safe — one listener + one cold restore per client.
  if (ATTACHED.has(supabase)) return
  ATTACHED.add(supabase)

  // 1. Mirror auth events into Cookie + native vault.
  supabase.auth.onAuthStateChange((event, session) => {
    if (
      event === 'SIGNED_IN' ||
      event === 'TOKEN_REFRESHED' ||
      event === 'INITIAL_SESSION'
    ) {
      mirrorSession(session)
    } else if (event === 'SIGNED_OUT') {
      clearSharedCookie()
      reportNativeAuthSession(null)
    }
  })

  bindSessionWarmOnResume(supabase)
  bindNativeVaultReadyRestore(supabase)

  // 2. Cold start: restore when this origin has no session yet.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    mirrorSession(session)
    return
  }

  const cookieTokens = getSharedCookie()
  if (cookieTokens) {
    const result = await restoreSessionFromTokens(
      supabase,
      cookieTokens,
      'shared cookie',
    )
    if (result === 'ok') return
    if (result === 'fatal') clearSharedCookie()
    // transient: keep cookie, fall through to vault
  }

  const nativeTokens = await fetchNativeSharedTokens()
  if (nativeTokens) {
    const result = await restoreSessionFromTokens(
      supabase,
      nativeTokens,
      'native vault',
    )
    if (result === 'fatal') {
      // Only drop Keychain on dead refresh material — not on network blips.
      reportNativeAuthSession(null)
    }
  }
}
