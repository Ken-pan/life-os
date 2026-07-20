/**
 * AIOS hosted CaptureEnvelope ingest — flag-gated; autoConvert always false on server.
 * Kenos RPCs live in public schema; AIOS default client uses aios schema.
 */

import { lifeOsReadClient } from '../lifeos.js'
import { supabase } from '../supabase.js'
import {
  buildCaptureIngestAction,
  isCaptureIngestWriterEnabled,
  isCaptureWriterCohortMember,
} from './captureWriters.core.js'

/**
 * @param {{ text: string }} input
 */
export async function ingestCaptureViaHostedKenosWriter(input) {
  if (!isCaptureIngestWriterEnabled()) {
    throw new Error('Capture ingest writer flags are off')
  }
  if (!supabase) {
    throw new Error('Supabase is not configured for Capture ingest writer')
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUserId = session?.user?.id
  if (!authUserId) throw new Error('Authentication required for Capture ingest')
  if (!isCaptureWriterCohortMember(session?.user?.email)) {
    throw new Error('Capture ingest writer cohort does not include this account')
  }

  const action = buildCaptureIngestAction(input, { authUserId })
  const publicClient = lifeOsReadClient()
  if (!publicClient) {
    throw new Error('Public schema client unavailable for Capture ingest')
  }
  const { data, error } = await publicClient.rpc('kenos_ingest_capture_envelope_action', {
    action_request: action,
  })
  if (error) {
    const err = new Error(error.message || 'Capture ingest RPC failed')
    err.code = error.code || 'remote_rpc_failed'
    throw err
  }
  if (!data?.ok) {
    const err = new Error(data?.error?.message || 'Capture ingest RPC rejected')
    err.code = data?.error?.code || 'remote_rpc_rejected'
    throw err
  }
  return data
}
