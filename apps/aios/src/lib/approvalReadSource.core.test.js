import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readCanonicalApprovalSource } from './kenos/approvalReadSource.core.js'

const NOW = Date.parse('2026-07-19T12:00:00Z')

function approvalRow(overrides = {}) {
  return {
    id: '81000000-0000-4000-8000-000000000001',
    version: '1',
    owner_id: '20000000-0000-4000-8000-000000000001',
    action_id: '11000000-0000-4000-8000-000000000001',
    correlation_id: '41000000-0000-4000-8000-000000000001',
    requesting_actor: { type: 'assistant', id: '21000000-0000-4000-8000-000000000001' },
    requesting_domain: 'assistant',
    action_type: 'plan.reschedule_task',
    risk: 'R2',
    status: 'pending',
    reason_code: 'policy_r2_preview',
    safe_summary: 'Move one Plan task',
    data_classification: 'personal',
    requested_at: '2026-07-19T11:30:00Z',
    expires_at: '2026-07-19T13:00:00Z',
    entity_refs: [],
    created_at: '2026-07-19T11:30:00Z',
    updated_at: '2026-07-19T11:55:00Z',
    ...overrides,
  }
}

describe('canonical Approval read source', () => {
  it('calls only the canonical read RPC and never exposes an Executor', async () => {
    const calls = []
    const client = new Proxy({
      rpc: async (name, args) => {
        calls.push({ name, args })
        return { data: [approvalRow()], error: null }
      },
    }, {
      get(target, property) {
        if (property !== 'rpc') throw new Error(`unexpected client capability: ${String(property)}`)
        return target[property]
      },
    })
    const result = await readCanonicalApprovalSource({ client, now: NOW })
    assert.deepEqual(calls, [{ name: 'kenos_list_action_approvals', args: { p_limit: 100, p_before: null } }])
    assert.equal(result.state.status, 'ready')
    assert.equal(result.items[0].executorAvailable, false)
    assert.equal(result.items[0].ownerDomain, 'system')
    assert.equal(result.items[0].requestingDomain, 'assistant')
    assert.equal(result.items[0].status, 'pending')
  })

  it('keeps expired, superseded, stale, long-summary and entity-ref states read-only', async () => {
    const longSummary = 'A'.repeat(600)
    const client = {
      rpc: async () => ({ data: [
        approvalRow({ id: 'expired', status: 'expired', expires_at: '2026-07-19T11:00:00Z' }),
        approvalRow({ id: 'superseded', status: 'superseded' }),
        approvalRow({ id: 'stale', updated_at: '2026-07-19T10:00:00Z', safe_summary: longSummary, entity_refs: [{ id: 'entity-1', type: 'plan.task', ownerDomain: 'plan', ownerId: 'task-1', raw: 'must-not-copy' }] }),
      ], error: null }),
    }
    const result = await readCanonicalApprovalSource({ client, now: NOW })
    assert.equal(result.state.status, 'stale')
    assert.deepEqual(new Set(result.items.map((item) => item.status)), new Set(['expired', 'superseded', 'pending']))
    assert.ok(result.items.find((item) => item.id === 'stale').safeImpactSummary.length <= 180)
    assert.doesNotMatch(JSON.stringify(result.items), /must-not-copy/)
  })

  it('distinguishes empty, partial, offline, permission and source failure', async () => {
    const empty = await readCanonicalApprovalSource({ client: { rpc: async () => ({ data: [], error: null }) }, now: NOW })
    assert.equal(empty.state.status, 'empty')
    const partial = await readCanonicalApprovalSource({ client: { rpc: async () => ({ data: [approvalRow(), { id: null }], error: null }) }, now: NOW })
    assert.equal(partial.state.status, 'partial')
    assert.equal(partial.state.malformedCount, 1)
    assert.equal((await readCanonicalApprovalSource({ authorized: false })).state.status, 'permission_denied')
    assert.equal((await readCanonicalApprovalSource({ authorized: true, online: false })).state.status, 'offline')
    const failed = await readCanonicalApprovalSource({ client: { rpc: async () => ({ data: null, error: { code: '42P01', message: 'missing source' } }) } })
    assert.equal(failed.state.status, 'unavailable')
  })
})
