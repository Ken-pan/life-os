#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const PRODUCTION_REF = 'iueozzuctstwvzbcxcyh'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const seedFile = resolve(root, 'supabase/seed_qa_amazon_enrichment.sql')
const stateFile = resolve(root, '.tmp/finance-fp6-qa.storage-state.json')

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. Supply it through the shell or an untracked secret store; value is redacted.`)
  return value
}

function projectRefFromUrl(url) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec(url)
  if (!match) throw new Error('FINANCE_QA_SUPABASE_URL must be a Supabase project URL (value redacted).')
  return match[1]
}

function runSeed(userId, teardown = false) {
  const dbUrl = required('FINANCE_QA_DB_URL')
  const args = teardown
    ? ['--set', 'ON_ERROR_STOP=1', '--command', `delete from public.finance_transactions where user_id = '${userId}'::uuid and capture_source = 'qa_amazon_enrichment'`]
    : ['--set', 'ON_ERROR_STOP=1', '--set', `qa_user_id=${userId}`, '--file', seedFile]
  const result = spawnSync('psql', args, {
    encoding: 'utf8',
    env: { ...process.env, PGDATABASE: dbUrl },
  })
  if (result.error?.code === 'ENOENT') throw new Error('psql is required for the parameterized Finance QA seed.')
  if (result.status !== 0) throw new Error('Finance QA seed failed; database output suppressed to protect credentials and identities.')
}

async function locateUser(admin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
    if (user) return user
    if (data.users.length < 100) return null
  }
  throw new Error('QA user lookup exceeded the safe pagination limit.')
}

async function main() {
  const url = required('FINANCE_QA_SUPABASE_URL')
  const ref = required('FINANCE_QA_PROJECT_REF')
  if (ref === PRODUCTION_REF || projectRefFromUrl(url) === PRODUCTION_REF) {
    throw new Error('Refusing Finance QA bootstrap against the production Life OS project.')
  }
  if (projectRefFromUrl(url) !== ref) throw new Error('QA project ref and URL do not match (values redacted).')

  const serviceKey = required('FINANCE_QA_SERVICE_ROLE_KEY')
  const anonKey = required('FINANCE_QA_ANON_KEY')
  const email = required('FINANCE_QA_EMAIL')
  const password = required('FINANCE_QA_PASSWORD')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let user = await locateUser(admin, email)

  if (process.argv.includes('--teardown')) {
    if (!user) return console.log('PASS: QA fixture and user are already absent')
    runSeed(user.id, true)
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw error
    return console.log('PASS: synthetic Finance fixtures and disposable QA user removed')
  }

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    user = data.user
  } else {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true })
    if (error) throw error
    user = data.user
  }

  const { error: membershipError } = await admin.from('app_memberships').upsert({
    app_key: 'finance', user_id: user.id, role: 'member', status: 'active', granted_by: user.id,
  }, { onConflict: 'app_key,user_id' })
  if (membershipError) throw membershipError
  runSeed(user.id)

  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error: authError } = await client.auth.signInWithPassword({ email, password })
  if (authError || !auth.session) throw new Error('QA authentication verification failed (credentials redacted).')
  const own = await client.from('finance_transactions').select('id,purchase_enrichment', { count: 'exact' }).eq('capture_source', 'qa_amazon_enrichment')
  const foreign = await client.from('finance_transactions').select('id', { count: 'exact', head: true }).neq('user_id', user.id)
  if (own.error || own.count !== 3 || own.data.some((row) => !row.purchase_enrichment)) throw new Error('Synthetic fixture assertion failed.')
  if (foreign.error || foreign.count !== 0) throw new Error('RLS isolation assertion failed.')

  mkdirSync(dirname(stateFile), { recursive: true })
  writeFileSync(stateFile, JSON.stringify({ cookies: [], origins: [{ origin: process.env.UI_QA_URL ?? 'http://localhost:5180', localStorage: [{ name: 'life_os_auth', value: JSON.stringify(auth.session) }] }] }))
  chmodSync(stateFile, 0o600)
  console.log(`PASS: QA user/auth=true fixtures=${own.count} foreign_rows=${foreign.count} storage_state=${stateFile}`)
}

main().catch((error) => {
  console.error(`BLOCKED: ${error.message}`)
  process.exitCode = 1
})
