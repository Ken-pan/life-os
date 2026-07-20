/**
 * CaptureEnvelope list read — projects kenos_list_capture_envelopes rows.
 * No auto-convert; UI decides when to call convert writer.
 */

export const CANONICAL_CAPTURE_LIST_SOURCE = 'public.kenos_list_capture_envelopes'

/**
 * @param {object | null | undefined} row
 * @returns {{ id: string, status: string, text: string, capturedAt: string | null } | null}
 */
export function projectCaptureEnvelopeRow(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id || '').trim()
  if (!id) return null

  const status = String(row.status || '').trim() || 'needs_review'
  const capturedAt = row.capturedAt || row.captured_at || null

  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  const nested =
    payload.capturePayload && typeof payload.capturePayload === 'object'
      ? payload.capturePayload
      : payload
  const text = String(
    nested.text ?? nested.body ?? payload.text ?? row.text ?? '',
  ).trim()

  return {
    id,
    status,
    text,
    capturedAt: capturedAt ? String(capturedAt) : null,
  }
}

/**
 * @param {unknown} rows
 * @returns {Array<{ id: string, status: string, text: string, capturedAt: string | null }>}
 */
export function projectCaptureEnvelopeRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map(projectCaptureEnvelopeRow).filter(Boolean)
}

/**
 * @param {{
 *   client: { rpc: Function } | null | undefined,
 *   limit?: number,
 *   before?: string | null,
 * }} opts
 */
export async function listCaptureEnvelopes({
  client,
  limit = 50,
  before = null,
} = {}) {
  if (!client) {
    throw new Error('Capture list client unavailable')
  }
  const p_limit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const args = { p_limit }
  if (before) args.p_before = before

  const { data, error } = await client.rpc('kenos_list_capture_envelopes', args)
  if (error) {
    const err = new Error(error.message || 'Capture list RPC failed')
    err.code = error.code || 'remote_rpc_failed'
    throw err
  }
  return projectCaptureEnvelopeRows(data)
}
