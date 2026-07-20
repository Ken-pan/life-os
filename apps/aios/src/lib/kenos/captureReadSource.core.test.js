import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  projectCaptureEnvelopeRow,
  projectCaptureEnvelopeRows,
} from './captureReadSource.core.js'

describe('captureReadSource.core', () => {
  it('projects list rows to id/status/text/capturedAt', () => {
    const projected = projectCaptureEnvelopeRow({
      id: 'c2831538-94b0-4a57-b034-5e873a53c42e',
      status: 'needs_review',
      payload: { text: 'buy milk' },
      captured_at: '2026-07-20T12:00:00Z',
    })
    assert.deepEqual(projected, {
      id: 'c2831538-94b0-4a57-b034-5e873a53c42e',
      status: 'needs_review',
      text: 'buy milk',
      capturedAt: '2026-07-20T12:00:00Z',
    })
  })

  it('reads nested capturePayload.text and skips invalid rows', () => {
    const rows = projectCaptureEnvelopeRows([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'classified',
        payload: { capturePayload: { text: 'nested' } },
        capturedAt: '2026-07-20T13:00:00Z',
      },
      { status: 'needs_review' },
      null,
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].text, 'nested')
    assert.equal(rows[0].capturedAt, '2026-07-20T13:00:00Z')
  })
})
