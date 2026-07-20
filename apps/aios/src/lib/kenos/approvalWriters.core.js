/**
 * Track D Approval request / decide Writers — flag-gated, fail-closed on compat/read canary.
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
export function isApprovalRequestWriterEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_APPROVAL_REQUEST_WRITER === '1'
}

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isApprovalDecideWriterEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_APPROVAL_DECIDE_WRITER === '1'
}

/**
 * @param {string | null | undefined} email
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isApprovalWriterCohortMember(email, env = import.meta.env) {
  const raw = String(env?.VITE_KENOS_APPROVAL_WRITER_OWNER_EMAILS || '').trim()
  if (!raw) return true
  if (!email) return false
  const allowed = raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
  return allowed.includes(String(email).trim().toLowerCase())
}

/**
 * @param {object} input
 * @param {{ authUserId: string, now?: number, deviceId?: string, actionId?: string, correlationId?: string, idempotencyKey?: string }} opts
 */
export function buildApprovalRequestAction(input = {}, opts = {}) {
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildApprovalRequestAction requires authenticated authUserId UUID')
  }
  const now = opts.now ?? Date.now()
  const actionId = opts.actionId && UUID_PATTERN.test(opts.actionId) ? opts.actionId : contractUuid()
  const correlationId =
    opts.correlationId && UUID_PATTERN.test(opts.correlationId) ? opts.correlationId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId) ? opts.deviceId : contractUuid()
  const approvalId =
    input.approvalId && UUID_PATTERN.test(input.approvalId) ? input.approvalId : contractUuid()
  const proposedActionId =
    input.proposedActionId && UUID_PATTERN.test(input.proposedActionId)
      ? input.proposedActionId
      : contractUuid()
  const risk = String(input.risk || 'R2')
  if (!['R1', 'R2', 'R3'].includes(risk)) throw new Error('invalid risk')

  return {
    schemaVersion: '1',
    id: actionId,
    actionType: 'approval.request',
    producer: 'assistant',
    targetDomain: 'assistant',
    actor: { type: 'assistant', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: risk,
    payload: {
      approvalId,
      proposedActionId,
      proposedActionType: String(input.proposedActionType || 'plan.create_task'),
      risk,
      safeSummary: String(input.safeSummary || 'Approval required').slice(0, 500),
      reasonCode: String(input.reasonCode || 'policy_requires_approval'),
      requestingDomain: String(input.requestingDomain || 'assistant'),
      dataClassification: 'personal',
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      entityRefs: Array.isArray(input.entityRefs) ? input.entityRefs : [],
    },
    reason: 'Track D approval request writer',
    idempotencyKey: String(opts.idempotencyKey || `approval_request:${correlationId}`),
    requestedAt: new Date(now).toISOString(),
    correlationId,
  }
}

/**
 * @param {object} input
 * @param {{ authUserId: string, now?: number, deviceId?: string, actionId?: string, correlationId?: string, idempotencyKey?: string }} opts
 */
export function buildApprovalDecideAction(input = {}, opts = {}) {
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildApprovalDecideAction requires authenticated authUserId UUID')
  }
  if (!input.approvalId || !UUID_PATTERN.test(input.approvalId)) {
    throw new Error('approvalId required')
  }
  const nextStatus = String(input.nextStatus || '')
  if (!['approved', 'rejected', 'cancelled'].includes(nextStatus)) {
    throw new Error('invalid nextStatus')
  }
  const decisionReason = String(input.decisionReason || '').trim()
  if (!decisionReason) throw new Error('decisionReason required')

  const now = opts.now ?? Date.now()
  const actionId = opts.actionId && UUID_PATTERN.test(opts.actionId) ? opts.actionId : contractUuid()
  const correlationId =
    opts.correlationId && UUID_PATTERN.test(opts.correlationId) ? opts.correlationId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId) ? opts.deviceId : contractUuid()

  return {
    schemaVersion: '1',
    id: actionId,
    actionType: 'approval.decide',
    producer: 'assistant',
    targetDomain: 'assistant',
    actor: { type: 'user', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: {
      approvalId: input.approvalId,
      nextStatus,
      decisionReason: decisionReason.slice(0, 500),
    },
    reason: 'Track D approval decide writer',
    idempotencyKey: String(opts.idempotencyKey || `approval_decide:${correlationId}`),
    requestedAt: new Date(now).toISOString(),
    correlationId,
  }
}
