import assert from 'node:assert/strict'

import { createLifeOsAuth } from '../src/authController.js'

// init() 有 window 守卫；Node 测试环境下补一个空壳
globalThis.window = globalThis.window ?? {}

const flush = () => new Promise((r) => setTimeout(r, 0))

function createMockSupabase({ session = null } = {}) {
  const listeners = []
  const calls = { getSession: 0, signOut: 0, upserts: [] }
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

const SESSION = { user: { id: 'u1', email: 'ken@example.com' } }

// ── init：getSession 引导 + 事件分发到 onSession ──
{
  const supabase = createMockSupabase({ session: SESSION })
  const seen = []
  const auth = createLifeOsAuth(supabase, {
    appId: 'finance',
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
