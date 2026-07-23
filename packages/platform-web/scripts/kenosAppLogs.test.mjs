import assert from 'node:assert/strict'
import {
  redactLogText,
  safeRoute,
  redactLogMetadata,
  normalizeLogLevel,
  levelMeetsMinimum,
  computeLogFingerprint,
  evaluateAppLogAlertRules,
  createKenosAppLogs,
  installKenosAppLogs,
} from '../src/kenosAppLogs.js'

// computeLogFingerprint: same class of error → same fingerprint (volatile parts scrubbed)
assert.equal(
  computeLogFingerprint('load failed for user 42 at 0xABC', 'net'),
  computeLogFingerprint('load failed for user 99 at 0xDEF', 'net'),
)
assert.match(computeLogFingerprint('x', 'net'), /^[0-9a-f]{8}$/)
assert.notEqual(
  computeLogFingerprint('load failed', 'net'),
  computeLogFingerprint('save failed', 'net'),
)

assert.equal(normalizeLogLevel('warn'), 'warning')
assert.equal(normalizeLogLevel('fatal'), 'fault')
assert.ok(levelMeetsMinimum('error', 'warning'))
assert.equal(levelMeetsMinimum('info', 'warning'), false)

const redacted = redactLogText(
  'Bearer abc.def and access_token=supersecret eyJhbGciOiJIUzI1NiJ9.aaa.bbb',
)
assert.match(redacted, /«redacted»|«jwt»/)
assert.doesNotMatch(redacted, /supersecret/)

const meta = redactLogMetadata({
  route: '/settings',
  refresh_token: 'xyz',
  note: 'ok',
})
assert.equal(meta.refresh_token, '«redacted»')
assert.equal(meta.note, 'ok')

assert.deepEqual(
  evaluateAppLogAlertRules({ faults: 0, errors: 2, warnings: 3, crashBugs: 0 }),
  [],
)
const critical = evaluateAppLogAlertRules({ faults: 1, errors: 0 })
assert.equal(critical.length, 1)
assert.equal(critical[0].kind, 'fault_spike')
assert.equal(critical[0].severity, 'critical')

const burst = evaluateAppLogAlertRules({ errors: 5 })
assert.equal(burst[0].kind, 'error_burst')

// Memory-only logger (no window globals / no supabase)
const calls = []
const api = createKenosAppLogs({
  app: 'planner',
  getSupabase: () => null,
  captureGlobals: false,
  storage: null,
  enabled: true,
})
api.error('sync failed', { category: 'sync', metadata: { token: 'abc' } })
const status = api.getStatus()
assert.equal(status.app, 'planner')
assert.equal(status.ringSize, 1)
assert.equal(status.pending, 1)

const flush = await api.flush({ reason: 'test' })
assert.equal(flush.skipped, 'no_supabase')
api.dispose()

// Fake supabase ingest path
let rpcName = ''
let rpcArgs = null
const fake = {
  auth: {
    getSession: async () => ({
      data: { session: { access_token: 't' } },
    }),
  },
  schema() {
    return this
  },
  rpc: async (name, args) => {
    rpcName = name
    rpcArgs = args
    calls.push(name)
    if (name === 'kenos_ingest_app_logs') {
      return {
        data: {
          ok: true,
          inserted: args.p_events.length,
          skipped: 0,
          batchId: 'b1',
        },
        error: null,
      }
    }
    if (name === 'kenos_scan_app_log_alerts') {
      return { data: { ok: true, created: 0 }, error: null }
    }
    return { data: null, error: { message: 'unknown' } }
  },
}

const api2 = createKenosAppLogs({
  app: 'finance',
  getSupabase: () => fake,
  captureGlobals: false,
  storage: null,
  enabled: true,
})
// Use warning (no auto-flush) then explicit flush for a deterministic path.
api2.warning('warn once', { category: 'test', metadata: { token: 'nope' } })
const flush2 = await api2.flush({ reason: 'test', force: true })
assert.equal(flush2.ok, true)
assert.ok(calls.includes('kenos_ingest_app_logs'))
assert.equal(rpcArgs.p_session.app, 'finance')
assert.equal(rpcArgs.p_events[0].level, 'warning')
assert.equal(rpcArgs.p_events[0].metadata.token, '«redacted»')

calls.length = 0
api2.fault('boom', { category: 'test' })
// fault auto-flushes; wait until scan RPC runs
for (let i = 0; i < 40 && !calls.includes('kenos_scan_app_log_alerts'); i++) {
  await new Promise((r) => setTimeout(r, 10))
}
assert.ok(calls.includes('kenos_ingest_app_logs'))
assert.ok(calls.includes('kenos_scan_app_log_alerts'))
api2.dispose()

// ASI regression: install must not treat createKenosAppLogs() return as callable.
{
  const g = globalThis
  const prevWindow = g.window
  g.window = {
    location: { href: 'http://localhost/test' },
    addEventListener() {},
    removeEventListener() {},
  }
  try {
    const dispose = installKenosAppLogs({
      app: 'aios',
      getSupabase: () => null,
      captureGlobals: false,
      storage: null,
      enabled: true,
    })
    assert.equal(typeof dispose, 'function')
    assert.ok(g.window.__KENOS_APP_LOGS__)
    assert.equal(g.window.__KENOS_APP_LOGS__.getStatus().app, 'aios')
    dispose()
  } finally {
    if (prevWindow === undefined) delete g.window
    else g.window = prevWindow
  }
}


// F5-06.6: safeRoute strips query VALUES (note titles / search terms / resume
// payloads) while keeping param keys for diagnosis.
{
  assert.equal(safeRoute({ pathname: '/inbox', search: '' }), '/inbox')
  assert.equal(safeRoute({ pathname: '/today' }), '/today')
  const r = safeRoute({ pathname: '/library', search: '?title=my+secret+note&q=passwd' })
  assert.equal(r, '/library?title=«redacted»&q=«redacted»')
  assert.ok(!/secret|passwd/.test(r))
  const rr = safeRoute({ pathname: '/plan', search: '?kenosResume=eyJhbGc.secret' })
  assert.ok(!/secret/.test(rr))
}

// F5-06.6: content-bearing tokens are redacted from free text.
{
  const red = redactLogText('login user@example.com bearer abc.def sb_secret_xyz sk-ABCDEF1234567890AB')
  assert.ok(!/user@example\.com/.test(red))
  assert.ok(!/sb_secret_xyz/.test(red))
  assert.ok(!/abc\.def/.test(red) || /«redacted»/.test(red))
}

console.log('kenosAppLogs.test.mjs: ok')
