import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildDiagnosticsModel,
  crashIssueKey,
  groupCrashes,
  logIssueKey,
  normalizeLogSignature,
  projectBugs,
  stableHash,
} from './diagnosticsModel.core.js'
import {
  planBugResolution,
  planIssueResolution,
  unifiedStatusToBug,
} from './diagnosticsResolution.core.js'

describe('diagnosticsModel.core signatures', () => {
  it('stableHash is deterministic 8-hex', () => {
    assert.equal(stableHash('abc'), stableHash('abc'))
    assert.match(stableHash('abc'), /^[0-9a-f]{8}$/)
    assert.notEqual(stableHash('abc'), stableHash('abd'))
  })

  it('normalizeLogSignature scrubs volatile numbers/uuids/hex/quotes', () => {
    const a = normalizeLogSignature('failed at 0xDEADBEEF for user 42 "alice"', {
      category: 'net',
    })
    const b = normalizeLogSignature('failed at 0xCAFEBABE for user 99 "bob"', {
      category: 'net',
    })
    assert.equal(a, b) // 同一类错误 → 同签名
  })

  it('crashIssueKey prefers server fingerprint, falls back to signature hash', () => {
    assert.equal(crashIssueKey({ fingerprint: 'FP1' }), 'fp:FP1')
    const k = crashIssueKey({ message: 'boom', kind: 'crash' })
    assert.match(k, /^sig:[0-9a-f]{8}$/)
  })
})

describe('diagnosticsModel.core grouping', () => {
  it('groups crashes by fingerprint with counts + first/last seen', () => {
    const rows = [
      { fingerprint: 'FP', message: 'X', logged_at: '2026-07-20T00:00:00Z' },
      { fingerprint: 'FP', message: 'X', logged_at: '2026-07-22T00:00:00Z' },
      { fingerprint: 'FP', message: 'X', logged_at: '2026-07-21T00:00:00Z' },
    ]
    const [g] = groupCrashes(rows)
    assert.equal(g.count, 3)
    assert.equal(g.firstSeen, '2026-07-20T00:00:00Z')
    assert.equal(g.lastSeen, '2026-07-22T00:00:00Z')
    assert.equal(g.status, 'open')
  })

  it('merges resolution status onto grouped crash', () => {
    const rows = [{ fingerprint: 'FP', message: 'X', logged_at: '2026-07-22' }]
    const resolutions = [
      { issue_type: 'crash', issue_key: 'fp:FP', status: 'resolved', note: 'fixed in build 42' },
    ]
    const model = buildDiagnosticsModel({ crashes: rows, resolutions })
    assert.equal(model.crashes.total, 1)
    assert.equal(model.crashes.openCount, 0)
    assert.equal(model.crashes.resolved[0].note, 'fixed in build 42')
  })
})

describe('diagnosticsModel.core bugs + assembly', () => {
  it('maps bug_logs status into unified open/resolved/ignored', () => {
    const [open, fixed, ignored] = projectBugs([
      { id: '1', title: 'a', status: 'open' },
      { id: '2', title: 'b', status: 'fixed' },
      { id: '3', title: 'c', status: 'ignored' },
    ])
    assert.equal(open.status, 'open')
    assert.equal(fixed.status, 'resolved')
    assert.equal(ignored.status, 'ignored')
  })

  it('sorts open-first by lastSeen desc and counts openTotal', () => {
    const model = buildDiagnosticsModel({
      crashes: [
        { fingerprint: 'OLD', message: 'x', logged_at: '2026-07-01' },
        { fingerprint: 'NEW', message: 'y', logged_at: '2026-07-22' },
      ],
      logs: [{ message: 'err', level: 'error', logged_at: '2026-07-10' }],
      bugs: [{ id: 'b1', title: 'z', status: 'open' }],
      resolutions: [
        { issue_type: 'crash', issue_key: 'fp:OLD', status: 'resolved' },
      ],
    })
    // crashes: NEW(open) 在前, OLD(resolved) 在后
    assert.equal(model.crashes.items[0].issueKey, 'fp:NEW')
    assert.equal(model.crashes.items[1].status, 'resolved')
    assert.equal(model.openTotal, 3) // NEW crash + 1 log + 1 bug
  })
})

describe('diagnosticsResolution.core planners', () => {
  it('plans a valid crash resolution row', () => {
    const r = planIssueResolution({
      issueType: 'crash',
      issueKey: 'fp:FP',
      status: 'resolved',
      userId: 'u1',
      note: 'done',
      now: 0,
    })
    assert.ok(r.ok)
    assert.equal(r.row.user_id, 'u1')
    assert.equal(r.row.issue_type, 'crash')
    assert.equal(r.row.status, 'resolved')
    assert.equal(r.row.note, 'done')
  })

  it('rejects bad type / missing key / missing user / bad status', () => {
    assert.equal(planIssueResolution({ issueType: 'bug', issueKey: 'x', status: 'resolved', userId: 'u' }).ok, false)
    assert.equal(planIssueResolution({ issueType: 'crash', status: 'resolved', userId: 'u' }).ok, false)
    assert.equal(planIssueResolution({ issueType: 'crash', issueKey: 'x', status: 'resolved' }).ok, false)
    assert.equal(planIssueResolution({ issueType: 'crash', issueKey: 'x', status: 'nope', userId: 'u' }).ok, false)
  })

  it('maps unified status to bug_logs columns', () => {
    assert.equal(unifiedStatusToBug('resolved'), 'fixed')
    assert.equal(unifiedStatusToBug('ignored'), 'ignored')
    assert.equal(unifiedStatusToBug('open'), 'open')
    const p = planBugResolution({ id: 'b1', status: 'resolved' })
    assert.ok(p.ok)
    assert.equal(p.patch.status, 'fixed')
  })
})
