/**
 * Explicit Capture → Plan convert Writer — flag-gated; never silent.
 */

import { isProdReadCanaryMode } from './prodWriteGuard.core.js'
import { contractUuid } from './captureWriters.core.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isCaptureConvertWriterEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_CAPTURE_CONVERT_WRITER === '1'
}

/**
 * @param {string | null | undefined} email
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isCaptureConvertCohortMember(email, env = import.meta.env) {
  const raw = String(
    env?.VITE_KENOS_CAPTURE_CONVERT_WRITER_OWNER_EMAILS ||
      env?.VITE_KENOS_CAPTURE_WRITER_OWNER_EMAILS ||
      '',
  ).trim()
  if (!raw) return true
  if (!email) return false
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(email).trim().toLowerCase())
}

/**
 * @param {{ captureId: string, title?: string }} input
 * @param {{ authUserId: string, now?: number, deviceId?: string, actionId?: string, correlationId?: string, idempotencyKey?: string }} opts
 */
export function buildCaptureConvertAction(input = {}, opts = {}) {
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildCaptureConvertAction requires authenticated authUserId UUID')
  }
  if (!input.captureId || !UUID_PATTERN.test(input.captureId)) {
    throw new Error('captureId required')
  }
  const now = opts.now ?? Date.now()
  const actionId = opts.actionId && UUID_PATTERN.test(opts.actionId) ? opts.actionId : contractUuid()
  const correlationId =
    opts.correlationId && UUID_PATTERN.test(opts.correlationId) ? opts.correlationId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId) ? opts.deviceId : contractUuid()
  const title = String(input.title || '').trim()

  return {
    schemaVersion: '1',
    id: actionId,
    actionType: 'capture.convert_to_plan_task',
    producer: 'assistant',
    targetDomain: 'plan',
    actor: { type: 'user', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: {
      captureId: input.captureId,
      ...(title ? { title: title.slice(0, 500) } : {}),
    },
    reason: 'Explicit Capture → Plan convert',
    idempotencyKey: String(opts.idempotencyKey || `capture_convert:${correlationId}`),
    requestedAt: new Date(now).toISOString(),
    correlationId,
  }
}
