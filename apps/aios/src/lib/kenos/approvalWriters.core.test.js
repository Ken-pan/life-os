import { describe, expect, it } from 'vitest'
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
    expect(isApprovalRequestWriterEnabled(env)).toBe(false)
    expect(isApprovalDecideWriterEnabled(env)).toBe(false)
  })

  it('requires dual flags for request/decide', () => {
    expect(isApprovalRequestWriterEnabled({ VITE_KENOS_PROD_WRITES: '1' })).toBe(false)
    expect(
      isApprovalRequestWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_APPROVAL_REQUEST_WRITER: '1',
      }),
    ).toBe(true)
    expect(
      isApprovalDecideWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_APPROVAL_DECIDE_WRITER: '1',
      }),
    ).toBe(true)
  })

  it('honors owner email cohort', () => {
    const env = { VITE_KENOS_APPROVAL_WRITER_OWNER_EMAILS: '334452284ken@gmail.com' }
    expect(isApprovalWriterCohortMember('334452284ken@gmail.com', env)).toBe(true)
    expect(isApprovalWriterCohortMember('other@example.com', env)).toBe(false)
  })

  it('builds request and decide action envelopes', () => {
    const request = buildApprovalRequestAction(
      { safeSummary: 'Need approval', risk: 'R2' },
      { authUserId: OWNER, now: Date.parse('2026-07-20T05:00:00.000Z') },
    )
    expect(request.actionType).toBe('approval.request')
    expect(request.payload.safeSummary).toBe('Need approval')
    expect(request.actor.id).toBe(OWNER)

    const decide = buildApprovalDecideAction(
      {
        approvalId: request.payload.approvalId,
        nextStatus: 'approved',
        decisionReason: 'Owner approved canary',
      },
      { authUserId: OWNER },
    )
    expect(decide.actionType).toBe('approval.decide')
    expect(decide.payload.nextStatus).toBe('approved')
    expect(decide.actor.type).toBe('user')
  })
})
