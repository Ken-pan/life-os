import {
  KenosApprovalRecordSchema,
  KenosApprovalTransitionSchema,
} from '../../../../packages/contracts/src/kenos.ts'

export function validateApprovalRecordForRead(value, { authOwnerId, expectedActionId } = {}) {
  const parsed = KenosApprovalRecordSchema.safeParse(value)
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_approval_contract', issues: parsed.error.issues } }
  }
  if (!authOwnerId || parsed.data.ownerId !== authOwnerId) {
    return { ok: false, error: { code: 'approval_owner_mismatch' } }
  }
  if (expectedActionId && parsed.data.actionId !== expectedActionId) {
    return { ok: false, error: { code: 'approval_action_mismatch' } }
  }
  return { ok: true, record: parsed.data }
}

export function validateApprovalTransition(value) {
  const parsed = KenosApprovalTransitionSchema.safeParse(value)
  return parsed.success
    ? { ok: true, transition: parsed.data }
    : { ok: false, error: { code: 'invalid_approval_transition', issues: parsed.error.issues } }
}
