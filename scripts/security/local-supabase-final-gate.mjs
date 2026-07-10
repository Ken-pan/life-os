import assert from 'node:assert/strict'

import { createClient } from '@supabase/supabase-js'

const isStaging = process.env.LIFEOS_SECURITY_TARGET === 'staging'
const url = isStaging ? process.env.STAGING_SUPABASE_URL : (process.env.SUPABASE_URL || process.env.API_URL)
const anonKey = isStaging ? process.env.STAGING_SUPABASE_ANON_KEY : (process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY)
const serviceKey = isStaging ? process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY : (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY)

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'Set correct SUPABASE/STAGING environment variables for URL, ANON_KEY, and SERVICE_ROLE_KEY.',
  )
}

function redactSecret(value) {
  if (typeof value !== 'string') return value
  const secrets = [url, anonKey, serviceKey].filter(Boolean)
  let redacted = value
  for (const s of secrets) {
    if (s.length > 5) {
      redacted = redacted.split(s).join('<redacted>')
    }
  }
  return redacted
}

function redactObjectSecrets(obj) {
  if (typeof obj === 'string') return redactSecret(obj)
  if (typeof obj !== 'object' || obj === null) return obj
  if (obj instanceof Error) {
    const redactedErr = new Error(redactSecret(obj.message))
    redactedErr.stack = redactSecret(obj.stack)
    Object.assign(redactedErr, redactObjectSecrets({ ...obj }))
    return redactedErr
  }
  if (Array.isArray(obj)) return obj.map(redactObjectSecrets)
  const result = {}
  for (const [key, val] of Object.entries(obj)) {
    result[key] = redactObjectSecrets(val)
  }
  return result
}

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = `LocalGate-${stamp}!`
const emails = {
  ken: `ken-test-${stamp}@example.com`,
  friend: `friend-ui-${stamp}@example.com`,
  direct: `friend-direct-${stamp}@example.com`,
  unauthorized: `unauthorized-${stamp}@example.com`,
}

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const createdUserIds = new Set()

function pass(name) {
  console.log(`PASS ${name}`)
}

function expectDenied(result, name) {
  if (result.error) {
    pass(name)
    return
  }
  if (Array.isArray(result.data) && result.data.length === 0) {
    pass(name)
    return
  }
  assert.fail(`${name}: expected deny or 0 rows, got ${JSON.stringify(redactObjectSecrets(result.data))}`)
}

async function adminCreateUser(email) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  createdUserIds.add(data.user.id)
  return data.user
}

async function signIn(email) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

async function membershipsFor(userId) {
  const { data, error } = await service
    .from('app_memberships')
    .select('app_key, role, status')
    .eq('user_id', userId)
    .order('app_key')
  if (error) throw error
  return data
}

async function cleanup() {
  for (const userId of createdUserIds) {
    await service.storage.from('bug-attachments').remove([`${userId}/own.txt`])
  }
  for (const userId of [...createdUserIds].reverse()) {
    await service.auth.admin.deleteUser(userId)
  }
}

try {
  const ken = await adminCreateUser(emails.ken)
  const friend = await adminCreateUser(emails.friend)
  const unauthorized = await adminCreateUser(emails.unauthorized)

  await service.from('app_memberships').upsert(
    ['portal', 'planner', 'fitness', 'finance', 'music', 'home', 'paper'].map(
      (app_key) => ({
        app_key,
        user_id: ken.id,
        role: 'owner',
        status: 'active',
        granted_by: ken.id,
        activated_at: new Date().toISOString(),
      }),
    ),
  )
  await service
    .from('app_memberships')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('user_id', unauthorized.id)

  const { data: directData, error: directError } = await anon.auth.signUp({
    email: emails.direct,
    password,
    options: {
      data: {
        appId: 'planner',
        role: 'owner',
        allowedAppIds: ['planner', 'finance', 'portal'],
      },
    },
  })
  if (directError) throw directError
  const directUserId = directData.user?.id
  assert.ok(directUserId, 'direct signup returned a user id')
  createdUserIds.add(directUserId)

  assert.deepEqual(await membershipsFor(directUserId), [
    { app_key: 'fitness', role: 'member', status: 'active' },
  ])
  pass('direct signup with malicious metadata grants only fitness/member')

  assert.deepEqual(await membershipsFor(friend.id), [
    { app_key: 'fitness', role: 'member', status: 'active' },
  ])
  pass('admin-created normal user receives only fitness/member')

  const friendClient = await signIn(emails.friend)
  const unauthorizedClient = await signIn(emails.unauthorized)

  {
    const { data, error } = await friendClient
      .from('app_memberships')
      .select('app_key, role, status')
      .order('app_key')
    if (error) throw error
    assert.deepEqual(data, [{ app_key: 'fitness', role: 'member', status: 'active' }])
    pass('friend can read own fitness membership only')
  }

  {
    const { data, error } = await friendClient
      .from('app_memberships')
      .select('app_key, role, status')
      .eq('user_id', ken.id)
    if (error) throw error
    assert.deepEqual(data, [])
    pass('friend cannot read Ken memberships')
  }

  expectDenied(
    await friendClient.from('app_memberships').insert({
      app_key: 'planner',
      user_id: friend.id,
      role: 'owner',
      status: 'active',
    }),
    'friend cannot insert planner membership',
  )
  expectDenied(
    await friendClient
      .from('app_memberships')
      .update({ role: 'owner' })
      .eq('user_id', friend.id)
      .select(),
    'friend cannot update membership role',
  )
  expectDenied(
    await friendClient
      .from('app_memberships')
      .delete()
      .eq('user_id', friend.id)
      .select(),
    'friend cannot delete membership',
  )

  expectDenied(
    await unauthorizedClient.from('app_registry').select('app_key'),
    'revoked user sees no apps',
  )

  expectDenied(
    await friendClient
      .from('planner_tasks')
      .insert({ user_id: friend.id, id: `task-${stamp}`, data: { title: 'x' } })
      .select(),
    'fitness friend cannot create planner task',
  )
  expectDenied(
    await friendClient.from('planner_tasks').select('id'),
    'fitness friend cannot read planner tasks',
  )
  expectDenied(
    await friendClient
      .from('finance_data')
      .insert({ user_id: friend.id, data: { balance: 1 } })
      .select(),
    'fitness friend cannot create finance data',
  )
  expectDenied(
    await friendClient.from('finance_data').select('user_id'),
    'fitness friend cannot read finance data',
  )
  expectDenied(
    await friendClient
      .schema('music')
      .from('music_user_state')
      .select('user_id'),
    'fitness friend cannot read music state',
  )
  expectDenied(
    await friendClient
      .from('core_user_app_settings')
      .insert({ user_id: friend.id, app_id: 'home' })
      .select(),
    'fitness friend cannot create home core settings',
  )

  const { data: kenWorkout, error: kenWorkoutError } = await service
    .schema('fitness')
    .from('fitness_workout_sessions')
    .insert({
      user_id: ken.id,
      session_date: '2026-07-10',
      day_id: 'KEN_PRIVATE_WORKOUT',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (kenWorkoutError) throw kenWorkoutError

  const { data: friendWorkout, error: friendWorkoutError } = await friendClient
    .schema('fitness')
    .from('fitness_workout_sessions')
    .insert({
      user_id: friend.id,
      session_date: '2026-07-10',
      day_id: 'FRIEND_PRIVATE_WORKOUT',
      started_at: new Date().toISOString(),
    })
    .select('id, user_id, day_id')
    .single()
  if (friendWorkoutError) throw friendWorkoutError
  assert.equal(friendWorkout.user_id, friend.id)
  pass('friend can create own fitness workout')

  {
    const { data, error } = await friendClient
      .schema('fitness')
      .from('fitness_workout_sessions')
      .select('id, day_id')
      .eq('id', friendWorkout.id)
    if (error) throw error
    assert.equal(data.length, 1)
    pass('friend can read own fitness workout')
  }

  {
    const { data, error } = await friendClient
      .schema('fitness')
      .from('fitness_workout_sessions')
      .select('id')
      .eq('id', kenWorkout.id)
    if (error) throw error
    assert.deepEqual(data, [])
    pass('friend cannot read Ken fitness workout')
  }

  expectDenied(
    await friendClient
      .schema('fitness')
      .from('fitness_workout_sessions')
      .update({ day_id: 'PWNED' })
      .eq('id', kenWorkout.id)
      .select(),
    'friend cannot update Ken fitness workout',
  )
  expectDenied(
    await friendClient
      .schema('fitness')
      .from('fitness_workout_sessions')
      .insert({
        user_id: ken.id,
        session_date: '2026-07-10',
        day_id: 'FRIEND_WRITES_KEN',
      })
      .select(),
    'friend cannot insert fitness workout with Ken user_id',
  )

  {
    const { error } = await friendClient.storage
      .from('bug-attachments')
      .upload(`${friend.id}/own.txt`, new Blob(['ok'], { type: 'text/plain' }), {
        contentType: 'text/plain',
      })
    assert.ok(error, 'bug attachment MIME policy should reject text/plain')
    pass('bug attachment MIME allowlist rejects unexpected type')
  }

  expectDenied(
    await friendClient.storage
      .from('finance-purchase-images')
      .upload(`${friend.id}/own.png`, new Blob(['png'], { type: 'image/png' }), {
        contentType: 'image/png',
      }),
    'fitness friend cannot upload finance purchase image',
  )

  expectDenied(
    await friendClient.storage
      .from('music')
      .upload(`${friend.id}/own.mp3`, new Blob(['mp3'], { type: 'audio/mpeg' }), {
        contentType: 'audio/mpeg',
      }),
    'fitness friend cannot upload music audio',
  )

  pass('local Supabase security gate complete')
} catch (err) {
  console.error(redactObjectSecrets(err))
  process.exit(1)
} finally {
  await cleanup()
}
