/**
 * FT-P2 local RPC matrix for portal_today_summary() fitness fields.
 *
 * Prereq:
 *   supabase start --workdir apps/finance
 *   supabase db reset --workdir apps/finance
 *
 * Usage:
 *   node apps/finance/scripts/test-portal-today-summary-ft-p2.mjs
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const url =
  process.env.SUPABASE_URL || process.env.API_URL || 'http://127.0.0.1:54321'
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const stamp = Date.now()
const password = `FtP2-${stamp}!`

/** @param {string} label */
function pass(label) {
  console.log(`PASS ${label}`)
}

/** @param {string} email */
async function createUser(email) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user)
    throw error ?? new Error(`createUser failed: ${email}`)
  return data.user
}

/** @param {string} email */
async function rpcAs(email) {
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await anon.auth.signInWithPassword({ email, password })
  if (error) throw error
  const { data, error: rpcError } = await anon.rpc('portal_today_summary')
  if (rpcError) throw rpcError
  return data
}

/** @returns {string} */
function laTodayKey() {
  const now = new Date()
  const la = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
  )
  const y = la.getFullYear()
  const m = String(la.getMonth() + 1).padStart(2, '0')
  const d = String(la.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {string} userId
 * @param {string} sessionDate
 * @param {string} dayId
 * @param {{ ended?: boolean, startedAt?: string, endedAt?: string }} [opts]
 */
async function insertSession(userId, sessionDate, dayId, opts = {}) {
  const row = {
    user_id: userId,
    session_date: sessionDate,
    day_id: dayId,
    started_at: opts.startedAt ?? new Date().toISOString(),
    ended_at: opts.ended ? (opts.endedAt ?? new Date().toISOString()) : null,
  }
  const { data, error } = await service
    .schema('fitness')
    .from('fitness_workout_sessions')
    .insert(row)
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/**
 * @param {string} userId
 * @param {string} sessionId
 * @param {string} exerciseId
 * @param {{ done?: number, skipped?: object | null }} payload
 */
async function insertLog(userId, sessionId, exerciseId, payload) {
  const { error } = await service
    .schema('fitness')
    .from('fitness_exercise_logs')
    .insert({
      user_id: userId,
      session_id: sessionId,
      exercise_id: exerciseId,
      done: payload.done ?? 0,
      sets: [],
      skipped: payload.skipped ?? null,
    })
  if (error) throw error
}

/** @param {string} userId */
async function grantPortalSummaryAppAccess(userId) {
  for (const appKey of ['planner', 'finance', 'music', 'home', 'fitness']) {
    const { error } = await service.from('app_memberships').upsert(
      {
        app_key: appKey,
        user_id: userId,
        role: 'member',
        status: 'active',
        activated_at: new Date().toISOString(),
      },
      { onConflict: 'app_key,user_id' },
    )
    if (error) throw error
  }
}

/** @param {string} userId @param {string} today */
async function seedOtherCards(userId, today) {
  await grantPortalSummaryAppAccess(userId)
  const { error: taskErr } = await service.from('planner_tasks').insert({
    user_id: userId,
    id: `ft-p2-task-${stamp}`,
    data: { title: 'FT-P2 task', dueDate: today, completed: false },
  })
  if (taskErr) throw taskErr

  const { error: finErr } = await service.from('finance_transactions').insert({
    user_id: userId,
    flow: 'income',
    amount: 100,
    txn_date: today,
    occurred_on: today,
    merchant_name: 'FT-P2',
    normalized_category: 'Income',
    source_amount: 100,
    flow_type: 'income',
    include_in_spending_analytics: false,
    include_in_cash_flow_history: true,
    review_status: 'resolved',
  })
  if (finErr) throw finErr

  const trackId = `ft-p2-${stamp}`
  const { error: metaErr } = await service
    .schema('music')
    .from('music_track_meta')
    .insert({
      user_id: userId,
      track_id: trackId,
      title: 'FT-P2 Track',
      artist: 'Test Artist',
    })
  if (metaErr) throw metaErr

  const { error: playErr } = await service
    .schema('music')
    .from('play_events')
    .insert({
      user_id: userId,
      track_id: trackId,
      event_type: 'play',
    })
  if (playErr) throw playErr

  const { error: homeErr } = await service
    .from('core_user_app_settings')
    .upsert({
      user_id: userId,
      app_id: 'home',
      settings: {
        portal_summary: {
          storage_zone_count: 3,
          reported_at: new Date().toISOString(),
        },
      },
    })
  if (homeErr) throw homeErr
}

/** @param {unknown} payload */
function assertOtherCards(payload) {
  assert.equal(payload.ok, true)
  assert.ok(payload.planner, 'planner payload')
  assert.equal(payload.planner.todayOpen, 1)
  assert.ok(payload.finance, 'finance payload')
  assert.equal(payload.finance.monthIncome, 100)
  assert.ok(payload.music?.trackTitle, 'music payload')
  assert.equal(payload.music.trackTitle, 'FT-P2 Track')
  assert.ok(payload.home?.reportedAt, 'home payload')
  assert.equal(payload.home.storageZoneCount, 3)
}

async function main() {
  const today = laTodayKey()
  const yesterday = new Date(`${today}T12:00:00`)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)

  const userA = await createUser(`ft-p2-a-${stamp}@example.test`)
  await seedOtherCards(userA.id, today)
  const sessA = await insertSession(userA.id, today, 'chest', { ended: true })
  await insertLog(userA.id, sessA, 'c_bench', { done: 3 })
  const payloadA = await rpcAs(`ft-p2-a-${stamp}@example.test`)
  assert.equal(payloadA.fitness.workedOutToday, true)
  assert.equal(payloadA.fitness.todayCompleted, true)
  assert.equal(payloadA.fitness.todayDayId, 'chest')
  assertOtherCards(payloadA)
  pass('A today done>0 + ended_at set')

  const userB = await createUser(`ft-p2-b-${stamp}@example.test`)
  const sessB = await insertSession(userB.id, today, 'back', { ended: false })
  await insertLog(userB.id, sessB, 'c_row', { done: 2 })
  const payloadB = await rpcAs(`ft-p2-b-${stamp}@example.test`)
  assert.equal(payloadB.fitness.workedOutToday, true)
  assert.equal(payloadB.fitness.todayCompleted, false)
  assert.equal(payloadB.fitness.todayDayId, 'back')
  pass('B today done>0 + ended_at null')

  const userC = await createUser(`ft-p2-c-${stamp}@example.test`)
  const sessC = await insertSession(userC.id, today, 'legs', { ended: true })
  await insertLog(userC.id, sessC, 'c_squat', {
    done: 0,
    skipped: { reason: 'busy', ts: new Date().toISOString() },
  })
  const payloadC = await rpcAs(`ft-p2-c-${stamp}@example.test`)
  assert.equal(payloadC.fitness.workedOutToday, false)
  assert.equal(payloadC.fitness.todayCompleted, false)
  assert.equal(payloadC.fitness.lastSessionDate, null)
  assert.equal(payloadC.fitness.lastDayId, null)
  pass('C today skipped only')

  const userD = await createUser(`ft-p2-d-${stamp}@example.test`)
  await insertSession(userD.id, today, 'arms', { ended: false })
  const payloadD = await rpcAs(`ft-p2-d-${stamp}@example.test`)
  assert.equal(payloadD.fitness.workedOutToday, false)
  pass('D today session with no exercise logs')

  const userE = await createUser(`ft-p2-e-${stamp}@example.test`)
  const sessE = await insertSession(userE.id, yesterdayKey, 'chest', {
    ended: true,
  })
  await insertLog(userE.id, sessE, 'c_bench', { done: 4 })
  const payloadE = await rpcAs(`ft-p2-e-${stamp}@example.test`)
  assert.equal(payloadE.fitness.workedOutToday, false)
  assert.equal(payloadE.fitness.lastDayId, 'chest')
  assert.equal(payloadE.fitness.lastSessionDate, yesterdayKey)
  pass('E no today workout + historical completed workout')

  const userF = await createUser(`ft-p2-f-${stamp}@example.test`)
  const payloadF = await rpcAs(`ft-p2-f-${stamp}@example.test`)
  assert.equal(payloadF.fitness.workedOutToday, false)
  assert.equal(payloadF.fitness.lastSessionDate, null)
  assert.equal(payloadF.fitness.lastDayId, null)
  pass('F no workout history')

  const userG = await createUser(`ft-p2-g-${stamp}@example.test`)
  const sessG1 = await insertSession(userG.id, today, 'chest', {
    ended: true,
    startedAt: `${today}T08:00:00.000Z`,
    endedAt: `${today}T09:00:00.000Z`,
  })
  await insertLog(userG.id, sessG1, 'c_bench', { done: 2 })
  const sessG2 = await insertSession(userG.id, today, 'back', {
    ended: false,
    startedAt: `${today}T20:00:00.000Z`,
  })
  await insertLog(userG.id, sessG2, 'c_row', { done: 1 })
  const payloadG = await rpcAs(`ft-p2-g-${stamp}@example.test`)
  assert.equal(payloadG.fitness.workedOutToday, true)
  assert.equal(payloadG.fitness.todayDayId, 'back')
  assert.equal(payloadG.fitness.todayCompleted, false)
  pass('G multiple sessions today picks most recent with done>0')

  const userI = await createUser(`ft-p2-i-${stamp}@example.test`)
  const sessI = await insertSession(userI.id, today, 'arms', { ended: true })
  await insertLog(userI.id, sessI, 'c_curl', {
    done: 0,
    skipped: { reason: 'busy', ts: new Date().toISOString() },
  })
  const payloadI = await rpcAs(`ft-p2-i-${stamp}@example.test`)
  assert.equal(payloadI.fitness.workedOutToday, false)
  assert.equal(payloadI.fitness.lastSessionDate, null)
  assert.equal(payloadI.fitness.lastDayId, null)
  pass('I today skipped-only ended with no earlier active workout')

  const userJ = await createUser(`ft-p2-j-${stamp}@example.test`)
  const sessJYesterday = await insertSession(userJ.id, yesterdayKey, 'back', {
    ended: true,
  })
  await insertLog(userJ.id, sessJYesterday, 'c_row', { done: 3 })
  const sessJToday = await insertSession(userJ.id, today, 'legs', { ended: true })
  await insertLog(userJ.id, sessJToday, 'c_squat', {
    done: 0,
    skipped: { reason: 'busy', ts: new Date().toISOString() },
  })
  const payloadJ = await rpcAs(`ft-p2-j-${stamp}@example.test`)
  assert.equal(payloadJ.fitness.workedOutToday, false)
  assert.equal(payloadJ.fitness.lastSessionDate, yesterdayKey)
  assert.equal(payloadJ.fitness.lastDayId, 'back')
  pass('J today skipped-only ended with yesterday active workout')

  console.log('portal_today_summary FT-P2 RPC matrix: all checks passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
