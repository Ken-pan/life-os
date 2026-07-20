import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildApprovalDecideAction,
  buildApprovalRequestAction,
  isApprovalDecideWriterEnabled,
  isApprovalRequestWriterEnabled,
  isApprovalWriterCohortMember,
} from './approvalWriters.core.js'

const OWNER = 'c2831538-94b0-4a57-b034-5e873a53c42e'

describe('approvalWriters.core', () => {
  it('fail-closes on read canary even with prod writes', () => {
    const env = {
      VITE_KENOS_READ_CANARY: '1',
      VITE_KENOS_PROD_WRITES: '1',
      VITE_KENOS_APPROVAL_REQUEST_WRITER: '1',
      VITE_KENOS_APPROVAL_DECIDE_WRITER: '1',
    }
    assert.equal(isApprovalRequestWriterEnabled(env), false)
    assert.equal(isApprovalDecideWriterEnabled(env), false)
  })

  it('requires dual flags for request/decide', () => {
    assert.equal(isApprovalRequestWriterEnabled({ VITE_KENOS_PROD_WRITES: '1' }), false)
    assert.equal(
      isApprovalRequestWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_APPROVAL_REQUEST_WRITER: '1',
      }),
      true,
    )
    assert.equal(
      isApprovalDecideWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_APPROVAL_DECIDE_WRITER: '1',
      }),
      true,
    )
  })

  it('honors owner email cohort', () => {
    const env = { VITE_KENOS_APPROVAL_WRITER_OWNER_EMAILS: '334452284ken@gmail.com' }
    assert.equal(isApprovalWriterCohortMember('334452284ken@gmail.com', env), true)
    assert.equal(isApprovalWriterCohortMember('other@example.com', env), false)
  })

  it('builds request and decide action envelopes', () => {
    const request = buildApprovalRequestAction(
      { safeSummary: 'Need approval', risk: 'R2' },
      { authUserId: OWNER, now: Date.parse('2026-07-20T05:00:00.000Z') },
    )
    assert.equal(request.actionType, 'approval.request')
    assert.equal(request.payload.safeSummary, 'Need approval')
    assert.equal(request.actor.id, OWNER)

    const decide = buildApprovalDecideAction(
      {
        approvalId: request.payload.approvalId,
        nextStatus: 'approved',
        decisionReason: 'Owner approved canary',
      },
      { authUserId: OWNER },
    )
    assert.equal(decide.actionType, 'approval.decide')
    assert.equal(decide.payload.nextStatus, 'approved')
    assert.equal(decide.actor.type, 'user')
  })
})
