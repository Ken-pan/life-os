/**
 * CaptureEnvelope ingest Writer — flag-gated; never auto-converts to Plan/Work.
 */

import { isProdReadCanaryMode } from './prodWriteGuard.core.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function contractUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isCaptureIngestWriterEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_CAPTURE_INGEST_WRITER === '1'
}

/**
 * @param {string | null | undefined} email
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isCaptureWriterCohortMember(email, env = import.meta.env) {
  const raw = String(env?.VITE_KENOS_CAPTURE_WRITER_OWNER_EMAILS || '').trim()
  if (!raw) return true
  if (!email) return false
  const allowed = raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
  return allowed.includes(String(email).trim().toLowerCase())
}

/**
 * @param {{ text?: string, kind?: string, status?: string }} input
 * @param {{ authUserId: string, now?: number, deviceId?: string, actionId?: string, correlationId?: string, idempotencyKey?: string }} opts
 */
export function buildCaptureIngestAction(input = {}, opts = {}) {
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildCaptureIngestAction requires authenticated authUserId UUID')
  }
  const text = String(input.text || '').trim()
  if (!text) throw new Error('capture text required')

  const now = opts.now ?? Date.now()
  const actionId = opts.actionId && UUID_PATTERN.test(opts.actionId) ? opts.actionId : contractUuid()
  const correlationId =
    opts.correlationId && UUID_PATTERN.test(opts.correlationId) ? opts.correlationId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId) ? opts.deviceId : contractUuid()
  const captureId = actionId
  const kind = String(input.kind || 'text')
  const status = String(input.status || 'needs_review')

  return {
    schemaVersion: '1',
    id: actionId,
    actionType: 'capture.ingest_envelope',
    producer: 'assistant',
    targetDomain: 'system',
    actor: { type: 'user', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: {
      captureId,
      kind,
      status,
      capturePayload: { text: text.slice(0, 8000) },
      source: { client: 'aios-capture-quick', deviceId },
      suggestedDomains: [],
      contextRefs: [],
      capturedAt: new Date(now).toISOString(),
    },
    reason: 'AIOS CaptureQuick ingest',
    idempotencyKey: String(opts.idempotencyKey || `capture_ingest:${correlationId}`),
    requestedAt: new Date(now).toISOString(),
    correlationId,
  }
}
