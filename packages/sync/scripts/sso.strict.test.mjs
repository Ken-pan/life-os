/**
 * Strict SSO / Continuity session suite — edge cases that Daily Beta must not regress.
 */
import assert from 'node:assert/strict'
import {
  LIFE_OS_SSO_COOKIE_NAME,
  setupCrossDomainSSO,
  parseJwtExp,
  isAccessTokenFresh,
  normalizeSsoTokens,
  isFatalAuthRestoreError,
  resolveSsoCookieDomain,
} from '../src/sso.js'
import {
  createLifeOsSupabaseClient,
  ensureLifeOsSsoReady,
  resetLifeOsSupabaseClientCache,
} from '../src/supabaseClient.js'
import { createLifeOsAuth } from '../src/authController.js'

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms))

function encJwt(payload) {
  return (
    'hdr.' +
    Buffer.from(JSON.stringify(payload))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_') +
    '.sig'
  )
}

/** @type {Map<string, string>} */
let jar = new Map()
/** @type {Record<string, unknown> | null} */
let nativeVault = null
/** @type {string[]} */
let cookieWrites = []

function installEnv({ hostname, protocol = 'https:', bridge = true } = {}) {
  jar = new Map()
  cookieWrites = []
  globalThis.window = {
    location: { hostname, protocol },
    __KENOS_IOS_NATIVE_SHELL__: true,
    __KENOS_NATIVE_BRIDGE__: bridge
      ? {
          async call(method, params) {
            if (method === 'getSharedAuthTokens') {
              if (!nativeVault?.signedIn) {
                return { ok: true, signedIn: false }
              }
              return {
                ok: true,
                signedIn: true,
                access_token: nativeVault.access_token,
                refresh_token: nativeVault.refresh_token,
                userId: nativeVault.userId || '',
                host: params?.host,
              }
            }
            if (method === 'reportAuthSession') {
              if (params?.signedIn === false) {
                nativeVault = { signedIn: false }
              } else {
                nativeVault = {
                  signedIn: true,
                  access_token: params.access_token,
                  refresh_token: params.refresh_token,
                  userId: params.userId || '',
                }
              }
              return { ok: true, signedIn: !!params?.signedIn }
            }
            return { ok: false }
          },
        }
      : null,
    addEventListener() {},
  }
  globalThis.document = {
    visibilityState: 'visible',
    get cookie() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    },
    set cookie(raw) {
      cookieWrites.push(String(raw))
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
}

function readSsoCookie() {
  const raw = jar.get(LIFE_OS_SSO_COOKIE_NAME)
  if (!raw) return null
  return JSON.parse(decodeURIComponent(raw))
}

function mockClient({ session = null, failSet = null, failRefresh = null } = {}) {
  /** @type {((e: string, s: object | null) => void) | null} */
  let listener = null
  let current = session
  const calls = { setSession: 0, refreshSession: 0, getSession: 0 }
  return {
    calls,
    auth: {
      onAuthStateChange(cb) {
        listener = cb
        return { data: { subscription: { unsubscribe() {} } } }
      },
      getSession: async () => {
        calls.getSession += 1
        return { data: { session: current } }
      },
      setSession: async (tokens) => {
        calls.setSession += 1
        if (failSet) return { error: failSet }
        current = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          user: { id: 'u1', email: 'owner@example.com' },
        }
        listener?.('SIGNED_IN', current)
        return { error: null }
      },
      refreshSession: async ({ refresh_token }) => {
        calls.refreshSession += 1
        if (failRefresh) return { data: { session: null }, error: failRefresh }
        current = {
          access_token: encJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
          refresh_token,
          user: { id: 'u1', email: 'owner@example.com' },
        }
        listener?.('TOKEN_REFRESHED', current)
        return { data: { session: current }, error: null }
      },
    },
    fire(event, next) {
      current = next
      listener?.(event, next)
    },
  }
}

let passed = 0
function ok(label) {
  passed += 1
  console.log(`  ✓ ${label}`)
}

console.log('sso.strict — unit helpers')
{
  assert.equal(resolveSsoCookieDomain('MUSIC.KENOS.SPACE'), '.kenos.space')
  assert.equal(normalizeSsoTokens(null), null)
  assert.equal(normalizeSsoTokens({ refresh_token: '  ' }), null)
  assert.deepEqual(normalizeSsoTokens({ refresh_token: 'rt', access_token: 1 }), {
    access_token: '1',
    refresh_token: 'rt',
  })
  assert.equal(parseJwtExp('not-a-jwt'), null)
  assert.equal(parseJwtExp(''), null)
  assert.equal(isAccessTokenFresh(''), false)
  assert.equal(isFatalAuthRestoreError({ code: 'invalid_grant' }), true)
  assert.equal(isFatalAuthRestoreError({ code: 'session_not_found' }), true)
  assert.equal(isFatalAuthRestoreError({ message: 'network down' }), false)
  ok('helpers reject garbage / classify fatal errors')
}

console.log('sso.strict — Continuity cross-origin (shell → music)')
{
  nativeVault = null
  installEnv({ hostname: 'www.kenos.space' })
  const shell = mockClient()
  await setupCrossDomainSSO(shell)
  shell.fire('SIGNED_IN', {
    access_token: encJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    refresh_token: 'rt-shell',
    user: { id: 'u1' },
  })
  assert.equal(readSsoCookie()?.refresh_token, 'rt-shell')
  assert.equal(nativeVault?.signedIn, true)
  assert.equal(nativeVault?.refresh_token, 'rt-shell')

  // Music Continuity: no local session, cookie shared via Domain=.kenos.space
  installEnv({ hostname: 'music.kenos.space' })
  // Simulate WK CookieStore already seeded (shared jar semantics).
  jar.set(
    LIFE_OS_SSO_COOKIE_NAME,
    encodeURIComponent(
      JSON.stringify({
        access_token: encJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
        refresh_token: 'rt-shell',
      }),
    ),
  )
  const music = mockClient({ session: null })
  await setupCrossDomainSSO(music)
  const { data } = await music.auth.getSession()
  assert.equal(data.session?.refresh_token, 'rt-shell')
  assert.equal(music.calls.setSession, 1)
  ok('shell login → music restores from shared cookie')
}

console.log('sso.strict — vault-only when cookie absent (LAN↔prod gap)')
{
  nativeVault = {
    signedIn: true,
    access_token: encJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    refresh_token: 'rt-vault',
    userId: 'u1',
  }
  installEnv({ hostname: 'money.kenos.space' })
  // empty jar — vault must win
  const money = mockClient({ session: null })
  await setupCrossDomainSSO(money)
  const { data } = await money.auth.getSession()
  assert.equal(data.session?.refresh_token, 'rt-vault')
  assert.equal(money.calls.setSession, 1)
  ok('native vault restores when cookie missing')
}

console.log('sso.strict — refresh-only vault material')
{
  nativeVault = {
    signedIn: true,
    access_token: '',
    refresh_token: 'rt-only',
    userId: 'u1',
  }
  installEnv({ hostname: 'plan.kenos.space' })
  const plan = mockClient({ session: null })
  await setupCrossDomainSSO(plan)
  const { data } = await plan.auth.getSession()
  assert.ok(data.session?.access_token)
  assert.equal(data.session?.refresh_token, 'rt-only')
  assert.equal(plan.calls.refreshSession, 1)
  assert.equal(plan.calls.setSession, 0)
  ok('refresh-only vault uses refreshSession')
}

console.log('sso.strict — expired access prefers refresh')
{
  nativeVault = null
  installEnv({ hostname: 'training.kenos.space' })
  jar.set(
    LIFE_OS_SSO_COOKIE_NAME,
    encodeURIComponent(
      JSON.stringify({
        access_token: encJwt({ exp: Math.floor(Date.now() / 1000) - 120 }),
        refresh_token: 'rt-exp',
      }),
    ),
  )
  const fit = mockClient({ session: null })
  await setupCrossDomainSSO(fit)
  assert.equal(fit.calls.refreshSession, 1)
  assert.equal((await fit.auth.getSession()).data.session?.refresh_token, 'rt-exp')
  ok('expired JWT access → refreshSession')
}

console.log('sso.strict — fatal refresh clears cookie; transient keeps vault')
{
  nativeVault = null
  installEnv({ hostname: 'home.kenos.space' })
  jar.set(
    LIFE_OS_SSO_COOKIE_NAME,
    encodeURIComponent(
      JSON.stringify({
        access_token: encJwt({ exp: Math.floor(Date.now() / 1000) - 120 }),
        refresh_token: 'rt-dead',
      }),
    ),
  )
  const dead = mockClient({
    session: null,
    failRefresh: { status: 400, message: 'Invalid Refresh Token' },
    failSet: { status: 400, message: 'Invalid Refresh Token' },
  })
  await setupCrossDomainSSO(dead)
  assert.equal(readSsoCookie(), null, 'fatal cookie cleared')
  ok('fatal auth error clears cookie')

  nativeVault = {
    signedIn: true,
    access_token: 'at',
    refresh_token: 'rt-keep',
  }
  installEnv({ hostname: 'health.kenos.space' })
  let cleared = false
  window.__KENOS_NATIVE_BRIDGE__ = {
    async call(method, params) {
      if (method === 'getSharedAuthTokens') {
        return {
          ok: true,
          signedIn: true,
          access_token: 'at',
          refresh_token: 'rt-keep',
        }
      }
      if (method === 'reportAuthSession' && params?.signedIn === false) {
        cleared = true
      }
      return { ok: true }
    },
  }
  const blip = mockClient({
    session: null,
    failSet: { status: 503, message: 'upstream' },
    failRefresh: { status: 503, message: 'upstream' },
  })
  await setupCrossDomainSSO(blip)
  assert.equal(cleared, false, 'transient must not clear vault')
  ok('transient error keeps vault')
}

console.log('sso.strict — malformed cookie ignored')
{
  nativeVault = {
    signedIn: true,
    access_token: encJwt({ exp: Math.floor(Date.now() / 1000) + 1000 }),
    refresh_token: 'rt-fallback',
  }
  installEnv({ hostname: 'library.kenos.space' })
  jar.set(LIFE_OS_SSO_COOKIE_NAME, '%%%not-json%%%')
  const lib = mockClient({ session: null })
  await setupCrossDomainSSO(lib)
  assert.equal((await lib.auth.getSession()).data.session?.refresh_token, 'rt-fallback')
  ok('malformed cookie falls through to vault')
}

console.log('sso.strict — https cookie has Secure + SameSite=Lax')
{
  nativeVault = null
  installEnv({ hostname: 'portal.kenos.space', protocol: 'https:' })
  const portal = mockClient()
  await setupCrossDomainSSO(portal)
  portal.fire('SIGNED_IN', {
    access_token: 'at',
    refresh_token: 'rt',
    user: { id: 'u1' },
  })
  const last = cookieWrites.at(-1) || ''
  assert.match(last, /SameSite=Lax/i)
  assert.match(last, /Secure/i)
  assert.match(last, /domain=\.kenos\.space/i)
  ok('production cookie flags')
}

console.log('sso.strict — authController waits for SSO before null publish')
{
  resetLifeOsSupabaseClientCache()
  nativeVault = {
    signedIn: true,
    access_token: encJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    refresh_token: 'rt-gate2',
  }
  installEnv({ hostname: 'music.kenos.space' })

  let session = null
  const listeners = []
  const fakeCreate = () => ({
    auth: {
      onAuthStateChange(cb) {
        listeners.push(cb)
        return { data: { subscription: { unsubscribe() {} } } }
      },
      getSession: async () => ({ data: { session } }),
      setSession: async (tokens) => {
        session = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          user: { id: 'u1', email: '334452284ken@gmail.com' },
        }
        for (const l of listeners) l('SIGNED_IN', session)
        return { error: null }
      },
      refreshSession: async ({ refresh_token }) => {
        session = {
          access_token: encJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
          refresh_token,
          user: { id: 'u1', email: '334452284ken@gmail.com' },
        }
        for (const l of listeners) l('TOKEN_REFRESHED', session)
        return { data: { session }, error: null }
      },
    },
  })

  const created = createLifeOsSupabaseClient(fakeCreate, {
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
    },
    productionFallback: false,
  })

  const seen = []
  const auth = createLifeOsAuth(created.supabase, {
    appId: 'music',
    onSession: (s) => seen.push(s ? s.refresh_token || 'session' : null),
    onAllowedAppKeys: () => {},
  })
  created.supabase.schema = () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: async () => ({ data: [{ app_key: 'music' }], error: null }),
        }),
      }),
    }),
  })

  // Emit provisional empty INITIAL_SESSION before SSO finishes.
  for (const l of listeners) l('INITIAL_SESSION', null)

  auth.init()
  await ensureLifeOsSsoReady(created.supabase)
  await flush(20)

  assert.equal(
    seen.filter((x) => x === null).length,
    0,
    `must not publish signed-out during SSO; seen=${JSON.stringify(seen)}`,
  )
  assert.ok(
    seen.some((x) => x === 'rt-gate2' || x === 'session'),
    `expected restored session in ${JSON.stringify(seen)}`,
  )
  ok('authController does not flash signed-out during SSO restore')
}

console.log('sso.strict — SIGNED_OUT clears cookie + vault')
{
  nativeVault = {
    signedIn: true,
    access_token: 'at',
    refresh_token: 'rt',
  }
  installEnv({ hostname: 'www.kenos.space' })
  jar.set(
    LIFE_OS_SSO_COOKIE_NAME,
    encodeURIComponent(JSON.stringify({ access_token: 'at', refresh_token: 'rt' })),
  )
  const shell = mockClient({
    session: {
      access_token: 'at',
      refresh_token: 'rt',
      user: { id: 'u1' },
    },
  })
  await setupCrossDomainSSO(shell)
  shell.fire('SIGNED_OUT', null)
  assert.equal(readSsoCookie(), null)
  assert.equal(nativeVault?.signedIn, false)
  ok('logout clears cookie and vault')
}

console.log('sso.strict — non-retryable bridge error stops')
{
  nativeVault = null
  installEnv({ hostname: 'music.kenos.space' })
  let attempts = 0
  window.__KENOS_NATIVE_BRIDGE__ = {
    async call(method) {
      if (method === 'getSharedAuthTokens') {
        attempts += 1
        throw { code: 'bad_tokens', message: 'nope' }
      }
      return { ok: true }
    },
  }
  const m = mockClient({ session: null })
  await setupCrossDomainSSO(m)
  assert.equal(attempts, 1, 'non-retryable must not spin')
  assert.equal((await m.auth.getSession()).data.session, null)
  ok('non-retryable bridge errors do not retry')
}

delete globalThis.window
delete globalThis.document
resetLifeOsSupabaseClientCache()

console.log(`sso.strict: ok (${passed} checks)`)
