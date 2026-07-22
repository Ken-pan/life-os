import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CANONICAL_PLAN_ACTIVITY_READ_SOURCE,
  isProdPlanActivityReadEnabled,
  mergeActivityRecords,
  projectPlanActivityRows,
  readPlanActivitySource,
} from './planActivityReadSource.core.js'

const ROW = Object.freeze({
  id: '5b6a4f5e-0000-4000-8000-000000000001',
  schema_version: 'kenos.activity.v1',
  action_id: 'a-1',
  action_type: 'plan.complete_task',
  correlation_id: 'corr-1',
  actor_type: 'user',
  source_domain: 'plan',
  policy: { risk: 'R1' },
  entity_ref: { type: 'task', id: 'task-9' },
  summary: '完成了任务「写周报」',
  result: 'succeeded',
  redacted_payload: {},
  undo: null,
  created_at: '2026-07-21T10:00:00.000Z',
})

test('flag default Off; canary mode defaults On unless explicitly 0', () => {
  assert.equal(isProdPlanActivityReadEnabled({}), false)
  assert.equal(isProdPlanActivityReadEnabled({ VITE_KENOS_PROD_READ_PLAN_ACTIVITY: '1' }), true)
  assert.equal(
    isProdPlanActivityReadEnabled({ VITE_KENOS_READ_CANARY: '1' }),
    true,
  )
  assert.equal(
    isProdPlanActivityReadEnabled({ VITE_KENOS_READ_CANARY: '1', VITE_KENOS_PROD_READ_PLAN_ACTIVITY: '0' }),
    false,
  )
})

test('projects canonical rows into activity records', () => {
  const { records, malformedCount, duplicateCount } = projectPlanActivityRows([ROW])
  assert.equal(records.length, 1)
  assert.equal(malformedCount, 0)
  assert.equal(duplicateCount, 0)
  const item = records[0]
  assert.equal(item.id, `kenos_plan_activity:${ROW.id}`)
  assert.equal(item.ownerDomain, 'plan')
  assert.equal(item.actionType, 'plan.complete_task')
  assert.equal(item.status, 'succeeded')
  assert.equal(item.safeSummary, ROW.summary)
  assert.equal(item.correlationId, 'corr-1')
  assert.equal(item.entityReference, 'task:task-9')
  assert.equal(item.risk, 'R1')
  assert.equal(item.occurredAt, ROW.created_at)
  assert.equal(item.sourceAvailable, true)
})

test('malformed / unknown-result rows fail closed without dropping the feed', () => {
  const { records, malformedCount } = projectPlanActivityRows([
    null,
    { ...ROW, id: '', created_at: '' },
    { ...ROW, id: 'x-2', result: 'exploded' },
  ])
  assert.equal(malformedCount, 2)
  const unknown = records.find((item) => item.id === 'kenos_plan_activity:x-2')
  assert.equal(unknown.status, 'unknown')
  assert.match(unknown.resultDetail, /未知的结果状态/)
})

test('duplicate ids are dropped and newest-first ordering holds', () => {
  const older = { ...ROW, id: 'x-3', created_at: '2026-07-20T10:00:00.000Z', correlation_id: 'corr-3' }
  const { records, duplicateCount } = projectPlanActivityRows([ROW, ROW, older])
  assert.equal(duplicateCount, 1)
  assert.deepEqual(
    records.map((item) => item.id),
    [`kenos_plan_activity:${ROW.id}`, 'kenos_plan_activity:x-3'],
  )
})

test('merge dedupes by correlationId with canonical records winning', () => {
  const kenos = projectPlanActivityRows([ROW]).records
  const legacyMirror = {
    id: 'life_event:mirror-1',
    correlationId: 'corr-1',
    occurredAt: '2026-07-21T10:00:01.000Z',
  }
  const legacyOther = {
    id: 'life_event:other-1',
    correlationId: null,
    occurredAt: '2026-07-21T09:00:00.000Z',
  }
  const { records, duplicateCount } = mergeActivityRecords([legacyMirror, legacyOther], kenos)
  assert.equal(duplicateCount, 1)
  assert.deepEqual(
    records.map((item) => item.id),
    [`kenos_plan_activity:${ROW.id}`, 'life_event:other-1'],
  )
})

test('readPlanActivitySource happy path via fake client', async () => {
  const client = {
    rpc: async (name, args) => {
      assert.equal(name, 'kenos_list_plan_activity')
      assert.equal(args.p_limit, 100)
      return { data: [ROW], error: null }
    },
  }
  const read = await readPlanActivitySource({ client })
  assert.equal(read.state.status, 'ready')
  assert.equal(read.state.source, CANONICAL_PLAN_ACTIVITY_READ_SOURCE)
  assert.equal(read.items.length, 1)
})

test('readPlanActivitySource fails closed on error / missing auth / missing client', async () => {
  const failing = { rpc: async () => ({ data: null, error: new Error('boom') }) }
  const errored = await readPlanActivitySource({ client: failing })
  assert.equal(errored.items.length, 0)
  assert.notEqual(errored.state.status, 'ready')

  const unauthorized = await readPlanActivitySource({ client: failing, authorized: false })
  assert.equal(unauthorized.state.status, 'permission_denied')

  const unconfigured = await readPlanActivitySource({ client: null })
  assert.equal(unconfigured.state.status, 'unavailable')
})
