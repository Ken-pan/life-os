import assert from 'node:assert/strict'

import { createLifeOsAuth } from '../src/authController.js'

// init() 有 window 守卫；Node 测试环境下补一个空壳
globalThis.window = globalThis.window ?? {}
globalThis.window.location = globalThis.window.location ?? {
  hostname: 'localhost',
  href: '',
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function createMockSupabase({ session = null, allowedApps = [] } = {}) {
  const listeners = []
  const calls = { getSession: 0, signOut: 0, signUps: [], upserts: [] }
  return {
    calls,
    emit(event, sess) {
      for (const l of [...listeners]) l(event, sess)
    },
    listenerCount: () => listeners.length,
    auth: {
      getSession: async () => {
        calls.getSession += 1
        return { data: { session } }
      },
      onAuthStateChange(cb) {
        listeners.push(cb)
        return {
          data: {
            subscription: {
              unsubscribe() {
                listeners.splice(listeners.indexOf(cb), 1)
              },
            },
          },
        }
      },
      signOut: async () => {
        calls.signOut += 1
        return { error: null }
      },
      signUp: async (payload) => {
        calls.signUps.push(payload)
        return { data: { session: null, user: { id: 'new-user' } }, error: null }
      },
    },
    from(table) {
      assert.equal(table, 'app_registry')
      return {
        select: async () => ({
          data: allowedApps.map((app_key) => ({ app_key })),
          error: null,
        }),
      }
    },
    schema() {
      return {
        from: (table) => ({
          upsert: async (row) => {
            calls.upserts.push({ table, row })
            return { error: null }
          },
        }),
      }
    },
  }
}

const SESSION = { user: { id: 'ken', email: '334452284ken@gmail.com' } }
const FRIEND_SESSION = { user: { id: 'friend', email: 'friend@example.com' } }

// ── init：getSession 引导 + 事件分发到 onSession ──
{
  const supabase = createMockSupabase({ session: SESSION, allowedApps: ['fitness'] })
  const seen = []
  const auth = createLifeOsAuth(supabase, {
    appId: 'fitness',
    onSession: (s) => seen.push(s),
  })
  const cleanup = auth.init()
  await flush()
  assert.equal(supabase.calls.getSession, 1)
  assert.deepEqual(seen, [SESSION])

  supabase.emit('TOKEN_REFRESHED', SESSION)
  supabase.emit('USER_UPDATED', null)
  assert.deepEqual(seen, [SESSION, SESSION, null])

  cleanup()
  supabase.emit('SIGNED_IN', SESSION)
  assert.equal(seen.length, 3, 'unsubscribe 后不再收到事件')
}

// ── app access：Ken 可保留完整 app 列表；非 Ken 只保留 Fitness ──
{
  const ownerKeys = []
  const ownerSupabase = createMockSupabase({
    session: SESSION,
    allowedApps: ['planner', 'finance', 'fitness', 'music', 'home'],
  })
  createLifeOsAuth(ownerSupabase, {
    appId: 'planner',
    onSession: () => {},
    onAllowedAppKeys: (keys) => ownerKeys.push(keys),
  }).init()
  await flush()
  assert.deepEqual(ownerKeys.at(-1), ['planner', 'finance', 'fitness', 'music', 'home'])

  const memberKeys = []
  const memberSupabase = createMockSupabase({
    session: FRIEND_SESSION,
    allowedApps: ['planner', 'fitness'],
  })
  createLifeOsAuth(memberSupabase, {
    appId: 'fitness',
    onSession: () => {},
    onAllowedAppKeys: (keys) => memberKeys.push(keys),
  }).init()
  await flush()
  assert.deepEqual(memberKeys.at(-1), ['fitness'])
}

// ── signUp：只有 FitnessOS 保留新用户注册入口 ──
{
  const plannerAuth = createLifeOsAuth(createMockSupabase(), {
    appId: 'planner',
    onSession: () => {},
  })
  await assert.rejects(
    plannerAuth.signUp('new@example.com', 'password'),
    /only available through FitnessOS/,
  )

  const fitnessSupabase = createMockSupabase()
  const fitnessAuth = createLifeOsAuth(fitnessSupabase, {
    appId: 'fitness',
    onSession: () => {},
  })
  const result = await fitnessAuth.signUp('new@example.com', 'password')
  assert.equal(result.needsConfirm, true)
  assert.equal(fitnessSupabase.calls.signUps[0].options.data.signup_app, 'fitness')
}

// ── onSyncSession 只在 AUTH_SYNC_EVENTS（INITIAL_SESSION / SIGNED_IN）触发 ──
{
  const supabase = createMockSupabase()
  const syncCalls = []
  const auth = createLifeOsAuth(supabase, {
    appId: 'finance',
    onSession: () => {},
    onSyncSession: (ctx) => {
      syncCalls.push(ctx)
      return Promise.resolve()
    },
  })
  auth.init()
  await flush()

  supabase.emit('INITIAL_SESSION', SESSION)
  supabase.emit('SIGNED_IN', SESSION)
  supabase.emit('TOKEN_REFRESHED', SESSION)
  supabase.emit('SIGNED_OUT', null)
  await flush()

  assert.equal(syncCalls.length, 2)
  assert.equal(syncCalls[0].silent, true, 'INITIAL_SESSION → silent')
  assert.equal(syncCalls[1].force, true, 'SIGNED_IN → force')
}

// ── onSignedOut：仅 SIGNED_OUT 事件与显式 signOut() 触发 ──
{
  const supabase = createMockSupabase()
  let signedOut = 0
  const auth = createLifeOsAuth(supabase, {
    appId: 'planner',
    onSession: () => {},
    onSignedOut: () => {
      signedOut += 1
    },
  })
  auth.init()
  await flush()

  supabase.emit('INITIAL_SESSION', null) // 冷启动未登录：不算登出
  assert.equal(signedOut, 0)
  supabase.emit('SIGNED_OUT', null)
  assert.equal(signedOut, 1)

  await auth.signOut()
  assert.equal(supabase.calls.signOut, 1)
  assert.equal(signedOut, 2)
}

// ── coreIdentity：登录事件写 core_profiles + last_opened_at ──
{
  const supabase = createMockSupabase()
  const auth = createLifeOsAuth(supabase, {
    appId: 'fitness',
    onSession: () => {},
  })
  auth.init()
  await flush()

  supabase.emit('TOKEN_REFRESHED', SESSION)
  await flush()
  assert.equal(supabase.calls.upserts.length, 0, '非 sync 事件不触发身份写入')

  supabase.emit('SIGNED_IN', SESSION)
  await flush()
  const tables = supabase.calls.upserts.map((u) => u.table)
  assert.deepEqual(tables, ['core_profiles', 'core_user_app_settings'])
  assert.equal(supabase.calls.upserts[1].row.app_id, 'fitness')
}

console.log('authController.test.mjs — OK')
