import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyReadError,
  compareApprovalProjectionSets,
  compareProjectionSets,
  freshnessState,
  mergeInboxProjections,
  projectActivityEvents,
  projectApprovalRows,
  projectInboxEvents,
  projectPlannerInboxTasks,
  summarizeShadowMismatches,
  settleReadSources,
} from './kenos/readProjections.core.js'

const NOW = Date.parse('2026-07-19T12:00:00Z')

function event(overrides = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    type: 'core.task_captured',
    payload: { capture_id: 'capture-1', title: 'Review Phase 2' },
    status: 'pending',
    created_at: '2026-07-19T11:30:00Z',
    ...overrides,
  }
}

describe('Kenos Inbox read projection', () => {
  it('sorts multiple real sources without changing their Owners', () => {
    const events = projectInboxEvents([
      event(),
      event({
        id: '10000000-0000-4000-8000-000000000002',
        type: 'fitness.workout_logged',
        payload: { session_id: 'session-1', session_date: '2026-07-19' },
        created_at: '2026-07-19T11:50:00Z',
      }),
    ], { now: NOW })
    const tasks = projectPlannerInboxTasks([
      {
        data: {
          id: 'task-1',
          title: 'Pay bill',
          createdAt: '2026-07-19T11:40:00Z',
          meta: { lifeEventRef: { id: 'finance-event-1', domain: 'finance' } },
        },
      },
    ], { now: NOW })
    const merged = mergeInboxProjections(events, tasks)
    assert.deepEqual(merged.items.map((item) => item.ownerDomain), ['training', 'plan', 'plan'])
    assert.equal(merged.items[1].classification, 'sensitive')
  })

  it('deduplicates duplicate event IDs and canonical references', () => {
    const projected = projectInboxEvents([
      event(),
      event(),
      event({ id: '10000000-0000-4000-8000-000000000009' }),
    ], { now: NOW })
    assert.equal(projected.items.length, 1)
    assert.equal(projected.duplicateCount, 2)
  })

  it('uses a safe fallback for unknown domains without leaking payload', () => {
    const projected = projectInboxEvents([
      event({
        type: 'alien.payload_arrived',
        payload: { token: 'never-show', body: 'private body' },
      }),
    ], { now: NOW })
    assert.equal(projected.items[0].ownerDomain, 'system')
    assert.equal(projected.items[0].deepLink, null)
    assert.doesNotMatch(JSON.stringify(projected.items[0]), /never-show|private body/)
  })

  it('marks inaccessible and malformed records explicitly', () => {
    const projected = projectInboxEvents([null, { type: 'core.task_captured', payload: null }], { now: NOW })
    assert.equal(projected.malformedCount, 2)
    assert.equal(projected.items[0].status, 'inaccessible')
    assert.equal(projected.items[1].sourceAvailable, false)
  })

  it('marks stale projections while preserving the canonical deep link', () => {
    const projected = projectInboxEvents([
      event({ created_at: '2026-07-17T10:00:00Z' }),
    ], { now: NOW })
    assert.equal(projected.items[0].stale, true)
    assert.equal(projected.items[0].deepLink, 'https://planner.kenos.space/inbox')
  })

  it('returns an honest empty projection', () => {
    assert.deepEqual(projectInboxEvents([], { now: NOW }).items, [])
  })

  it('classifies source, permission, and offline failures separately', () => {
    assert.equal(classifyReadError({ code: '42P01' }, { source: 'x' }).status, 'unavailable')
    assert.equal(classifyReadError({ code: '42501' }, { source: 'x' }).status, 'permission_denied')
    assert.equal(classifyReadError(new Error('network'), { source: 'x', online: false }).status, 'offline')
  })

  it('redacts sensitive Money summaries and raw amount fields', () => {
    const projected = projectInboxEvents([
      event({
        type: 'finance.bill_due',
        payload: { occurrence_id: 'bill-1', expected_amount: 9876, token: 'secret' },
      }),
    ], { now: NOW })
    const safe = JSON.stringify(projected.items[0])
    assert.doesNotMatch(safe, /9876|secret/)
    assert.match(safe, /隐藏/)
  })
})

describe('Kenos Approval and Activity read projections', () => {
  it('normalizes Approval metadata without enabling Executor', () => {
    const projected = projectApprovalRows([
      {
        id: 'approval-1',
        action_request_id: 'action-1',
        correlation_id: 'correlation-1',
        requesting_actor: 'assistant',
        owner_domain: 'plan',
        risk: 'R2',
        action_type: 'plan.reschedule_task',
        safe_summary: 'Move one task',
        created_at: '2026-07-19T11:00:00Z',
        expires_at: '2026-07-19T13:00:00Z',
        status: 'pending',
      },
    ], { now: NOW })
    assert.equal(projected.approvals[0].executorAvailable, false)
    assert.equal(projected.approvals[0].ownerDomain, 'system')
    assert.equal(projected.approvals[0].requestingDomain, 'plan')
    assert.equal(projected.approvals[0].ownerDeepLink, 'https://planner.kenos.space/inbox')
    assert.equal(projected.approvals[0].deepLink, '/approvals#approval-approval-1')
  })

  it('fails unknown Approval risk closed and expires old requests', () => {
    const projected = projectApprovalRows([
      {
        id: 'approval-1',
        actionRequestId: 'action-1',
        risk: 'unknown',
        requestedAt: '2026-07-18T10:00:00Z',
        expiresAt: '2026-07-18T11:00:00Z',
      },
    ], { now: NOW })
    assert.equal(projected.approvals[0].risk, 'R4')
    assert.equal(projected.approvals[0].status, 'expired')
  })

  it('sorts and truncates Activity while redacting raw payload fields', () => {
    const rows = Array.from({ length: 105 }, (_, index) => event({
      id: `event-${index}`,
      type: index === 0 ? 'finance.bill_due' : 'core.task_captured',
      payload: { capture_id: `capture-${index}`, token: `token-${index}`, title: `Item ${index}` },
      status: index === 0 ? 'failed' : 'processed',
      created_at: new Date(NOW - index * 1000).toISOString(),
    }))
    const projected = projectActivityEvents(rows, { limit: 100 })
    assert.equal(projected.records.length, 100)
    assert.equal(projected.truncatedCount, 5)
    assert.equal(projected.records[0].result, 'failed')
    assert.doesNotMatch(JSON.stringify(projected.records), /token-0/)
  })

  it('uses a safe unknown-type fallback and cross-domain deep links', () => {
    const projected = projectActivityEvents([
      event({ type: 'unknown.custom', payload: { raw: 'private' }, status: 'processed' }),
      event({ id: 'finance-1', type: 'finance.bill_due', payload: { occurrence_id: 'bill-1' } }),
    ])
    assert.equal(projected.records[0].ownerDomain, 'system')
    assert.equal(projected.records[1].deepLink, 'https://finance.kenos.space/home/today')
  })

  it('handles empty and malformed Activity sources', () => {
    assert.deepEqual(projectActivityEvents([]).records, [])
    assert.equal(projectActivityEvents([null]).malformedCount, 1)
  })
})

describe('Kenos freshness and redacted shadow diagnostics', () => {
  it('marks stale data deterministically', () => {
    assert.equal(freshnessState('2026-07-19T11:59:00Z', { now: NOW }).freshness, 'fresh')
    assert.equal(freshnessState('2026-07-19T10:00:00Z', { now: NOW }).freshness, 'stale')
  })

  it('classifies owner, status, deep-link, missing, and extra mismatches', () => {
    const mismatches = compareProjectionSets({
      comparisonType: 'inbox',
      ownerDomain: 'system',
      timestamp: '2026-07-19T12:00:00Z',
      oldItems: [
        { id: 'a', ownerDomain: 'plan', status: 'open', deepLink: '/old', classification: 'personal' },
        { id: 'missing', ownerDomain: 'plan', status: 'open' },
      ],
      newItems: [
        { id: 'a', ownerDomain: 'money', status: 'closed', deepLink: '/new', classification: 'sensitive' },
        { id: 'extra', ownerDomain: 'system', status: 'open' },
      ],
    })
    assert.deepEqual(new Set(mismatches.map((item) => item.category)), new Set([
      'owner_mismatch',
      'status_mismatch',
      'deep_link_mismatch',
      'redaction_mismatch',
      'missing_in_new',
      'extra_in_new',
    ]))
    assert.doesNotMatch(JSON.stringify(mismatches), /private|token|secret/)
    assert.deepEqual(summarizeShadowMismatches(mismatches), { blocking: 4, warning: 2, expected: 0 })
  })

  it('records an expected unsupported mismatch without inventing a store', () => {
    const mismatches = compareProjectionSets({ comparisonType: 'approvals', unsupported: true })
    assert.equal(mismatches[0].category, 'unsupported_source')
    assert.equal(mismatches[0].severity, 'expected')
  })

  it('classifies canonical Approval shadow mismatches without payloads', () => {
    const legacy = [{
      id: 'approval-1', actionId: 'action-old', correlationId: 'correlation-old', ownerDomain: 'assistant',
      risk: 'R2', status: 'pending', expiresAt: '2026-07-19T13:00:00Z', classification: 'personal', deepLink: '/legacy',
      rawPayload: { token: 'never-log' },
    }, { id: 'missing', actionId: 'action-missing' }]
    const canonical = [{
      id: 'approval-1', actionId: 'action-new', correlationId: 'correlation-new', ownerDomain: 'system',
      risk: 'R3', status: 'expired', expiresAt: '2026-07-19T14:00:00Z', classification: 'sensitive', deepLink: '/approvals',
    }, { id: 'extra', actionId: 'action-extra' }]
    const mismatches = compareApprovalProjectionSets({ legacyItems: legacy, canonicalItems: canonical })
    assert.deepEqual(new Set(mismatches.map((item) => item.category)), new Set([
      'action_mismatch', 'correlation_mismatch', 'owner_mismatch', 'risk_mismatch', 'status_mismatch',
      'expiry_mismatch', 'redaction_mismatch', 'deep_link_mismatch', 'missing_in_canonical', 'extra_in_canonical',
    ]))
    assert.doesNotMatch(JSON.stringify(mismatches), /never-log/)
  })

  it('labels the Portal action badge as an unsupported legacy Approval source', () => {
    const mismatches = compareApprovalProjectionSets({
      legacyItems: [{ id: 'generic-action' }],
      canonicalItems: [{ id: 'approval-1', status: 'pending' }],
      legacySourceSupported: false,
    })
    assert.equal(mismatches[0].category, 'unsupported_legacy_source')
    assert.equal(mismatches[0].severity, 'expected')
  })

  it('publishes fast sources before a slow source settles', async () => {
    const order = []
    const results = await settleReadSources(
      {
        slow: () => new Promise((resolve) => setTimeout(() => resolve('slow'), 12)),
        fast: async () => 'fast',
      },
      (key) => order.push(key),
    )
    assert.deepEqual(order, ['fast', 'slow'])
    assert.deepEqual(results, { slow: 'slow', fast: 'fast' })
  })
})
