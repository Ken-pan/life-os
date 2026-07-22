#!/usr/bin/env node
// Kenos outbox canary worker — the production drainer for kenos_plan_outbox.
//
//   claim (lease, FOR UPDATE SKIP LOCKED)  →  deliver (idempotent projection
//   onto public.life_events, deduped by outbox_id)  →  published
//   on failure → retry with 30s/2m/10m/1h/6h backoff → dead_letter after 5.
//
// Scope is fail-closed: only CANARY_ACTION_TYPES created after
// OUTBOX_WORKER_EPOCH are processed. Historical rows stay quarantined
// (see docs/productivity/OUTBOX_SEMANTICS.md).
//
// Run:      SUPABASE_SERVICE_ROLE_KEY=... node apps/planner/agent/outbox-worker.mjs
// Install:  apps/planner/agent/install-outbox-worker.sh   (launchd, KeepAlive)
// Disable:  touch ~/.kenos/outbox-worker.disable   (checked every poll)
//           or KENOS_OUTBOX_WORKER_DISABLED=1
// One-shot: node agent/outbox-worker.mjs --once   (single cycle + metrics, for ops/CI)
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  OUTBOX_WORKER_EPOCH,
  buildDeliveryEvent,
  classifyDeliveryError,
  nextAttemptAtIso,
  resolveCredentialContract,
  shouldProcessRow,
  summarizeCycle,
} from '../server/outboxWorker.core.mjs'
import {
  OUTBOX_BATCH_SIZE,
  OUTBOX_LEASE_SECONDS,
  OUTBOX_POLL_INTERVAL_MS,
} from '@life-os/contracts/kenos-actions'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iueozzuctstwvzbcxcyh.supabase.co'
const EPOCH = process.env.KENOS_OUTBOX_EPOCH || OUTBOX_WORKER_EPOCH
const DISABLE_FILE = join(homedir(), '.kenos', 'outbox-worker.disable')
const ENV_FILE = join(homedir(), '.kenos', 'outbox-worker.env')
const ONCE = process.argv.includes('--once')

// G5: least-privilege credential contract. Prefer a scoped kenos_worker JWT;
// refuse to start on a secret-in-argv or an unsafe credential-file permission.
const envFileMode = existsSync(ENV_FILE) ? statSync(ENV_FILE).mode : null
const cred = resolveCredentialContract({ env: process.env, argv: process.argv, envFileMode })
if (!cred.ok) {
  console.error(JSON.stringify({ level: 'fatal', msg: 'credential contract failed', reason: cred.reason }))
  process.exit(1)
}
for (const w of cred.warnings) console.error(JSON.stringify({ level: 'warn', msg: w }))
const CREDENTIAL =
  cred.credential === 'worker_jwt'
    ? process.env.KENOS_WORKER_JWT
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

const sb = createClient(SUPABASE_URL, CREDENTIAL, { auth: { persistSession: false } })

function log(fields) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), worker: 'kenos-outbox', ...fields }))
}

function isDisabled() {
  return process.env.KENOS_OUTBOX_WORKER_DISABLED === '1' || existsSync(DISABLE_FILE)
}

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data
}

async function processRow(row) {
  const correlationId = row.correlation_id
  const gate = shouldProcessRow(row, { epoch: EPOCH })
  if (!gate.process) {
    // Non-canary / quarantined rows should never be claimed (SQL filters by
    // epoch already), but stay fail-closed: release via permanent fail only
    // for contract violations; otherwise leave for lease expiry.
    log({ level: 'warn', msg: 'skip', outboxId: row.id, actionType: row.action_type, reason: gate.reason, correlationId })
    return { outcome: 'skipped', reason: gate.reason }
  }
  try {
    const { eventType, payload } = buildDeliveryEvent(row)
    const result = await rpc('kenos_outbox_worker_deliver', {
      p_outbox_id: row.id,
      p_event_type: eventType,
      p_event_payload: payload,
    })
    const duplicate = Boolean(result?.duplicate)
    log({ level: 'info', msg: 'delivered', outboxId: row.id, actionType: row.action_type, eventType, duplicate, correlationId })
    return { outcome: duplicate ? 'duplicate' : 'delivered' }
  } catch (error) {
    const errorClass = classifyDeliveryError(error)
    try {
      const failed = await rpc('kenos_outbox_worker_fail', {
        p_outbox_id: row.id,
        p_error_class: errorClass,
        p_reason: String(error.message || error).slice(0, 200),
        p_next_attempt_at: nextAttemptAtIso(row.attempts + 1),
      })
      const outcome = failed?.status === 'dead_letter' ? 'dead_letter' : 'retry'
      log({ level: 'error', msg: 'delivery failed', outboxId: row.id, actionType: row.action_type, errorClass, outcome, error: String(error.message || error), correlationId })
      return { outcome }
    } catch (failError) {
      log({ level: 'error', msg: 'fail-transition failed', outboxId: row.id, error: String(failError.message || failError), correlationId })
      return { outcome: 'skipped', reason: 'fail_transition_error' }
    }
  }
}

async function cycle() {
  const rows = await rpc('kenos_outbox_worker_claim', {
    p_epoch: EPOCH,
    p_limit: OUTBOX_BATCH_SIZE,
    p_lease_seconds: OUTBOX_LEASE_SECONDS,
  })
  const outcomes = []
  for (const row of rows || []) outcomes.push(await processRow(row))
  if ((rows || []).length > 0) log({ level: 'info', msg: 'cycle', ...summarizeCycle(outcomes) })
  return outcomes.length
}

async function metrics() {
  try {
    const m = await rpc('kenos_outbox_worker_metrics', { p_epoch: EPOCH })
    log({ level: 'info', msg: 'metrics', ...m })
  } catch (error) {
    log({ level: 'warn', msg: 'metrics failed', error: String(error.message || error) })
  }
}

async function main() {
  log({ level: 'info', msg: 'start', epoch: EPOCH, batch: OUTBOX_BATCH_SIZE, pollMs: OUTBOX_POLL_INTERVAL_MS, once: ONCE })
  if (ONCE) {
    if (isDisabled()) { log({ level: 'warn', msg: 'disabled' }); return }
    await cycle()
    await metrics()
    return
  }
  let lastMetrics = 0
  let running = true
  process.on('SIGTERM', () => { running = false })
  process.on('SIGINT', () => { running = false })
  while (running) {
    if (isDisabled()) {
      log({ level: 'warn', msg: 'disabled, idling' })
    } else {
      try {
        // Drain continuously while there is work, then fall back to polling.
        while (running && !isDisabled() && (await cycle()) > 0) { /* keep draining */ }
      } catch (error) {
        log({ level: 'error', msg: 'cycle error', error: String(error.message || error) })
      }
      if (Date.now() - lastMetrics > 5 * 60_000) {
        await metrics()
        lastMetrics = Date.now()
      }
    }
    await new Promise((resolve) => setTimeout(resolve, OUTBOX_POLL_INTERVAL_MS))
  }
  log({ level: 'info', msg: 'stopped' })
}

main().catch((error) => {
  log({ level: 'fatal', msg: 'crashed', error: String(error.message || error) })
  process.exit(1)
})
