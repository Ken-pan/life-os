/**
 * AIOS hosted Approval decide — flag-gated; never auto-executes.
 */

import { supabase } from '../supabase.js'
import {
  buildApprovalDecideAction,
  isApprovalDecideWriterEnabled,
  isApprovalWriterCohortMember,
} from './approvalWriters.core.js'

/**
 * @param {{ approvalId: string, nextStatus: 'approved' | 'rejected' | 'cancelled', decisionReason: string }} input
 */
export async function decideApprovalViaHostedKenosWriter(input) {
  if (!isApprovalDecideWriterEnabled()) {
    throw new Error('Approval decide writer flags are off')
  }
  if (!supabase) {
    throw new Error('Supabase is not configured for Approval decide writer')
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUserId = session?.user?.id
  if (!authUserId) throw new Error('Authentication required for Approval decide')
  if (!isApprovalWriterCohortMember(session?.user?.email)) {
    throw new Error('Approval decide writer cohort does not include this account')
  }

  const action = buildApprovalDecideAction(input, { authUserId })
  const { data, error } = await supabase.rpc('kenos_decide_action_approval_action', {
    action_request: action,
  })
  if (error) {
    const err = new Error(error.message || 'Approval decide RPC failed')
    err.code = error.code || 'remote_rpc_failed'
    throw err
  }
  if (!data?.ok) {
    const err = new Error(data?.error?.message || 'Approval decide RPC rejected')
    err.code = data?.error?.code || 'remote_rpc_rejected'
    throw err
  }
  return data
}
