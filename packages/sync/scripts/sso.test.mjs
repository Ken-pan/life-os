import assert from 'node:assert/strict'
import {
  LIFE_OS_SSO_COOKIE_NAME,
  resolveSsoCookieDomain,
  setupCrossDomainSSO,
} from '../src/sso.js'

assert.equal(resolveSsoCookieDomain('planner.kenos.space'), '.kenos.space')
assert.equal(resolveSsoCookieDomain('kenos.space'), '.kenos.space')
assert.equal(resolveSsoCookieDomain('localhost'), '')
assert.equal(resolveSsoCookieDomain('127.0.0.1'), '')
assert.equal(resolveSsoCookieDomain('10.20.202.15'), '')
assert.equal(resolveSsoCookieDomain(''), null)
assert.equal(resolveSsoCookieDomain(null), null)

/** Minimal cookie jar for host-only + Domain=.kenos.space */
function installCookieJar({ hostname, protocol = 'http:' }) {
  /** @type {Map<string, string>} */
  const jar = new Map()
  globalThis.window = {
    location: { hostname, protocol },
    __KENOS_NATIVE_BRIDGE__: null,
  }
  globalThis.document = {
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
  return {
    auth: {
      onAuthStateChange(cb) {
        listener = cb
        return { data: { subscription: { unsubscribe() {} } } }
      },
      getSession: async () => ({ data: { session: current } }),
      setSession: async (tokens) => {
        current = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          user: { id: 'user-1' },
        }
        listener?.('SIGNED_IN', current)
        return { error: null }
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
  // Native vault restore when cookie is absent (iOS Continuity cross-origin).
  installCookieJar({ hostname: 'finance.kenos.space', protocol: 'https:' })
  let reported = null
  window.__KENOS_NATIVE_BRIDGE__ = {
    async call(method, params) {
      if (method === 'getSharedAuthTokens') {
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
  // SIGNED_IN from setSession should also report back to native.
  assert.equal(reported?.signedIn, true)
  assert.equal(reported?.access_token, 'from-native')
}

delete globalThis.window
delete globalThis.document

console.log('sso: ok')
