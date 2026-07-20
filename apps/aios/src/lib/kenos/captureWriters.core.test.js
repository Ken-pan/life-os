import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCaptureIngestAction,
  isCaptureIngestWriterEnabled,
  isCaptureWriterCohortMember,
} from './captureWriters.core.js'

describe('captureWriters.core', () => {
  it('defaults capture ingest Off and blocks read canary', () => {
    assert.equal(isCaptureIngestWriterEnabled({}), false)
    assert.equal(
      isCaptureIngestWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_CAPTURE_INGEST_WRITER: '1',
        VITE_KENOS_READ_CANARY: '1',
      }),
      false,
    )
    assert.equal(
      isCaptureIngestWriterEnabled({
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_CAPTURE_INGEST_WRITER: '1',
      }),
      true,
    )
  })

  it('cohort matches owner emails', () => {
    const env = { VITE_KENOS_CAPTURE_WRITER_OWNER_EMAILS: '334452284ken@gmail.com' }
    assert.equal(isCaptureWriterCohortMember('334452284ken@gmail.com', env), true)
    assert.equal(isCaptureWriterCohortMember('other@example.com', env), false)
  })

  it('builds R1 ingest action with needs_review default', () => {
    const action = buildCaptureIngestAction(
      { text: 'buy milk' },
      { authUserId: 'c2831538-94b0-4a57-b034-5e873a53c42e', now: Date.parse('2026-07-20T00:00:00Z') },
    )
    assert.equal(action.actionType, 'capture.ingest_envelope')
    assert.equal(action.targetDomain, 'system')
    assert.equal(action.requestedRisk, 'R1')
    assert.equal(action.payload.status, 'needs_review')
    assert.equal(action.payload.capturePayload.text, 'buy milk')
  })
})
