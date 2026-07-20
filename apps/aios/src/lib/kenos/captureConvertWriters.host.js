/**
 * AIOS hosted Capture → Plan convert — explicit only; public schema RPC.
 */

import { lifeOsReadClient } from '../lifeos.js'
import { supabase } from '../supabase.js'
import {
  buildCaptureConvertAction,
  isCaptureConvertCohortMember,
  isCaptureConvertWriterEnabled,
} from './captureConvertWriters.core.js'

/**
 * @param {{ captureId: string, title?: string }} input
 */
export async function convertCaptureViaHostedKenosWriter(input) {
  if (!isCaptureConvertWriterEnabled()) {
    throw new Error('Capture convert writer flags are off')
  }
  if (!supabase) {
    throw new Error('Supabase is not configured for Capture convert writer')
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUserId = session?.user?.id
  if (!authUserId) throw new Error('Authentication required for Capture convert')
  if (!isCaptureConvertCohortMember(session?.user?.email)) {
    throw new Error('Capture convert writer cohort does not include this account')
  }

  const action = buildCaptureConvertAction(input, { authUserId })
  const publicClient = lifeOsReadClient()
  if (!publicClient) {
    throw new Error('Public schema client unavailable for Capture convert')
  }
  const { data, error } = await publicClient.rpc('kenos_convert_capture_to_plan_task_action', {
    action_request: action,
  })
  if (error) {
    const err = new Error(error.message || 'Capture convert RPC failed')
    err.code = error.code || 'remote_rpc_failed'
    throw err
  }
  if (!data?.ok) {
    const err = new Error(data?.error?.message || 'Capture convert RPC rejected')
    err.code = data?.error?.code || 'remote_rpc_rejected'
    throw err
  }
  return data
}
