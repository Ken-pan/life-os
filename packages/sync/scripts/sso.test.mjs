import assert from 'node:assert/strict'
import {
  LIFE_OS_SSO_COOKIE_NAME,
  resolveSsoCookieDomain,
  setupCrossDomainSSO,
  parseJwtExp,
  isAccessTokenFresh,
  normalizeSsoTokens,
  isFatalAuthRestoreError,
} from '../src/sso.js'

assert.equal(resolveSsoCookieDomain('planner.kenos.space'), '.kenos.space')
assert.equal(resolveSsoCookieDomain('kenos.space'), '.kenos.space')
assert.equal(resolveSsoCookieDomain('localhost'), '')
assert.equal(resolveSsoCookieDomain('127.0.0.1'), '')
assert.equal(resolveSsoCookieDomain('10.20.202.15'), '')
assert.equal(resolveSsoCookieDomain(''), null)
assert.equal(resolveSsoCookieDomain(null), null)

{
  // JWT helpers — header.payload.sig with exp in the past / future.
  const enc = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  const past = `x.${enc({ exp: Math.floor(Date.now() / 1000) - 120 })}.y`
  const future = `x.${enc({ exp: Math.floor(Date.now() / 1000) + 3600 })}.y`
  assert.ok(parseJwtExp(past) < Date.now() / 1000)
  assert.equal(isAccessTokenFresh(past), false)
  assert.equal(isAccessTokenFresh(future), true)
  assert.equal(isAccessTokenFresh('opaque-token'), true)
  assert.deepEqual(
    normalizeSsoTokens({ access_token: 'a', refresh_token: 'r' }),
    { access_token: 'a', refresh_token: 'r' },
  )
  assert.equal(normalizeSsoTokens({ access_token: 'a' }), null)
  assert.equal(isFatalAuthRestoreError({ status: 400, message: 'x' }), true)
  assert.equal(isFatalAuthRestoreError({ status: 500, message: 'timeout' }), false)
  assert.equal(
    isFatalAuthRestoreError({ message: 'Invalid Refresh Token' }),
    true,
  )
}

/** Minimal cookie jar for host-only + Domain=.kenos.space */
function installCookieJar({ hostname, protocol = 'http:' }) {
  /** @type {Map<string, string>} */
  const jar = new Map()
  globalThis.window = {
    location: { hostname, protocol },
    __KENOS_NATIVE_BRIDGE__: null,
    addEventListener() {},
  }
  globalThis.document = {
    visibilityState: 'visible',
    get cookie() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    },
    set cookie(raw) {
      const [pair, ...attrs] = String(raw)
        .split(';')
        .map((s) => s.trim())
      const eq = pair.indexOf('=')
      const name = eq >= 0 ? pair.slice(0, eq) : pair
      const value = eq >= 0 ? pair.slice(eq + 1) : ''
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith('max-age='))
      const age = maxAge ? Number(maxAge.split('=')[1]) : 1
      if (!Number.isFinite(age) || age <= 0) jar.delete(name)
      else jar.set(name, value)
    },
    addEventListener() {},
  }
  return {
    jar,
    read() {
      const raw = jar.get(LIFE_OS_SSO_COOKIE_NAME)
      if (!raw) return null
      return JSON.parse(decodeURIComponent(raw))
    },
  }
}

function mockSupabase({ session = null } = {}) {
  /** @type {((event: string, session: object | null) => void) | null} */
  let listener = null
  let current = session
  const calls = { refreshSession: 0, setSession: 0 }
  return {
    calls,
    auth: {
      onAuthStateChange(cb) {
        listener = cb
        return { data: { subscription: { unsubscribe() {} } } }
      },
      getSession: async () => ({ data: { session: current } }),
      setSession: async (tokens) => {
        calls.setSession += 1
        current = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          user: { id: 'user-1' },
        }
        listener?.('SIGNED_IN', current)
        return { error: null }
      },
      refreshSession: async ({ refresh_token }) => {
        calls.refreshSession += 1
        current = {
          access_token: 'refreshed-at',
          refresh_token,
          user: { id: 'user-1' },
        }
        listener?.('SIGNED_IN', current)
        return { data: { session: current }, error: null }
      },
    },
    fire(event, next) {
      current = next
      listener?.(event, next)
    },
  }
}

{
  const bag = installCookieJar({ hostname: '10.20.202.15' })
  const sb = mockSupabase()
  await setupCrossDomainSSO(sb)
  sb.fire('SIGNED_IN', {
    access_token: 'at-lan',
    refresh_token: 'rt-lan',
    user: { id: 'u1' },
  })
  assert.deepEqual(bag.read(), {
    access_token: 'at-lan',
    refresh_token: 'rt-lan',
  })
  // Idempotent — second attach must not double-bind.
  await setupCrossDomainSSO(sb)
}

{
  const bag = installCookieJar({
    hostname: 'planner.kenos.space',
    protocol: 'https:',
  })
  const sb = mockSupabase()
  await setupCrossDomainSSO(sb)
  sb.fire('SIGNED_IN', {
    access_token: 'at-prod',
    refresh_token: 'rt-prod',
    user: { id: 'u1' },
  })
  assert.deepEqual(bag.read(), {
    access_token: 'at-prod',
    refresh_token: 'rt-prod',
  })
  sb.fire('SIGNED_OUT', null)
  assert.equal(bag.read(), null)
}

{
  installCookieJar({ hostname: 'fitness.kenos.space', protocol: 'https:' })
  document.cookie = `${LIFE_OS_SSO_COOKIE_NAME}=${encodeURIComponent(
    JSON.stringify({ access_token: 'from-cookie', refresh_token: 'refresh' }),
  )}; path=/; max-age=99`
  const sb = mockSupabase({ session: null })
  await setupCrossDomainSSO(sb)
  const { data } = await sb.auth.getSession()
  assert.equal(data.session?.access_token, 'from-cookie')
}

{
  // Expired access → refreshSession path.
  const enc = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  const expired = `x.${enc({ exp: Math.floor(Date.now() / 1000) - 90 })}.y`
  installCookieJar({ hostname: 'music.kenos.space', protocol: 'https:' })
  document.cookie = `${LIFE_OS_SSO_COOKIE_NAME}=${encodeURIComponent(
    JSON.stringify({ access_token: expired, refresh_token: 'rt-fresh' }),
  )}; path=/; max-age=99`
  const sb = mockSupabase({ session: null })
  await setupCrossDomainSSO(sb)
  const { data } = await sb.auth.getSession()
  assert.equal(data.session?.access_token, 'refreshed-at')
  assert.equal(sb.calls.refreshSession, 1)
}

{
  // Native vault restore when cookie is absent (iOS Continuity cross-origin).
  installCookieJar({ hostname: 'finance.kenos.space', protocol: 'https:' })
  let reported = null
  let getHost = null
  window.__KENOS_NATIVE_BRIDGE__ = {
    async call(method, params) {
      if (method === 'getSharedAuthTokens') {
        getHost = params?.host
        return {
          ok: true,
          signedIn: true,
          access_token: 'from-native',
          refresh_token: 'rt-native',
          userId: 'user-native',
        }
      }
      if (method === 'reportAuthSession') {
        reported = params
        return { ok: true }
      }
      return { ok: false }
    },
  }
  const sb = mockSupabase({ session: null })
  await setupCrossDomainSSO(sb)
  const { data } = await sb.auth.getSession()
  assert.equal(data.session?.access_token, 'from-native')
  assert.equal(getHost, 'finance.kenos.space')
  // SIGNED_IN from setSession should also report back to native.
  assert.equal(reported?.signedIn, true)
  assert.equal(reported?.access_token, 'from-native')
  assert.equal(reported?.host, 'finance.kenos.space')
}

{
  // Native vault retries once when host is briefly blocked.
  installCookieJar({ hostname: 'music.kenos.space', protocol: 'https:' })
  let attempts = 0
  window.__KENOS_NATIVE_BRIDGE__ = {
    async call(method) {
      if (method === 'getSharedAuthTokens') {
        attempts += 1
        if (attempts === 1) {
          const err = { code: 'host_not_allowed', message: 'Auth host not allowed' }
          throw err
        }
        return {
          ok: true,
          signedIn: true,
          access_token: 'retry-ok',
          refresh_token: 'rt-retry',
        }
      }
      if (method === 'reportAuthSession') return { ok: true }
      return { ok: false }
    },
  }
  const sb = mockSupabase({ session: null })
  await setupCrossDomainSSO(sb)
  const { data } = await sb.auth.getSession()
  assert.equal(data.session?.access_token, 'retry-ok')
  assert.ok(attempts >= 2)
}

{
  // Transient restore failure must NOT clear the vault.
  installCookieJar({ hostname: 'home.kenos.space', protocol: 'https:' })
  let reported = null
  window.__KENOS_NATIVE_BRIDGE__ = {
    async call(method, params) {
      if (method === 'getSharedAuthTokens') {
        return {
          ok: true,
          signedIn: true,
          access_token: 'at',
          refresh_token: 'rt',
        }
      }
      if (method === 'reportAuthSession') {
        reported = params
        return { ok: true }
      }
      return { ok: false }
    },
  }
  const sb = mockSupabase({ session: null })
  sb.auth.setSession = async () => ({
    error: { status: 503, message: 'upstream unavailable' },
  })
  sb.auth.refreshSession = async () => ({
    data: { session: null },
    error: { status: 503, message: 'upstream unavailable' },
  })
  await setupCrossDomainSSO(sb)
  assert.equal(reported, null, 'vault must stay intact on transient errors')
}

delete globalThis.window
delete globalThis.document

console.log('sso: ok')
