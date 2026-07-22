import assert from 'node:assert/strict'
import { computeDrift, normalizeName } from './check-migration-drift.mjs'

// normalizeName strips a redundant leading timestamp from the name segment.
assert.equal(normalizeName('20260719130100_kenos_wave1_x'), 'kenos_wave1_x')
assert.equal(normalizeName('aios_shell_state'), 'aios_shell_state')

const repo = new Map([
  ['20260722191520', { name: 'kenos_outbox_worker_delivery', files: ['a.sql'] }], // matches prod → synced
  ['20260722200000', { name: 'kenos_project_spine', files: ['b.sql'] }],          // drift: prod has 191728
  ['20260722010000', { name: 'device_auth_hardening', files: ['c.sql'] }],        // baselined
  ['20260722990000', { name: 'brand_new_pending', files: ['d.sql'] }],            // pending (not in prod)
])
const prod = [
  { version: '20260722191520', name: 'kenos_outbox_worker_delivery' }, // synced
  { version: '20260722191728', name: 'kenos_project_spine' },          // drift partner of repo 200000
  { version: '20260722015504', name: 'device_auth_hardening' },        // drift partner (baselined)
  { version: '20260722070000', name: 'orphan_applied_no_source' },     // orphan
]
const baseline = new Set(['device_auth_hardening@20260722010000'])

const { driftPairs, baselinedPairs, orphanProd, pendingRepo } = computeDrift(repo, prod, baseline)

// exactly one NEW drift pair: project_spine repo 200000 vs prod 191728
assert.equal(driftPairs.length, 1)
assert.equal(driftPairs[0].name, 'kenos_project_spine')
assert.equal(driftPairs[0].repoVersion, '20260722200000')
assert.deepEqual(driftPairs[0].prodVersions, ['20260722191728'])

// the device_auth pair is suppressed by baseline
assert.equal(baselinedPairs.length, 1)
assert.equal(baselinedPairs[0].name, 'device_auth_hardening')

// synced version produces neither drift nor pending
assert.ok(!pendingRepo.some(([v]) => v === '20260722191520'))
// brand_new_pending is pending (committed, not applied)
assert.ok(pendingRepo.some(([v]) => v === '20260722990000'))
// orphan_applied_no_source is orphan (applied, no committed file)
assert.ok(orphanProd.some((r) => r.name === 'orphan_applied_no_source'))
// drift/baseline partners are NOT double-counted as orphan/pending
assert.ok(!orphanProd.some((r) => r.version === '20260722191728'))
assert.ok(!orphanProd.some((r) => r.version === '20260722015504'))

// empty baseline → the device_auth pair becomes a hard drift
const noBaseline = computeDrift(repo, prod, new Set())
assert.equal(noBaseline.driftPairs.length, 2)

console.log('check-migration-drift.test.mjs OK')
