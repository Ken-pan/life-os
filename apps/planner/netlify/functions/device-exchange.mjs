import {
  corsHeaders,
  exchangeTrustedDevice,
  getAdminClient,
  jsonResponse,
  requestMeta,
} from '../../server/trustedDeviceAuth.mjs'

export default async (req) => {
  const headers = corsHeaders()
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, headers)

  try {
    const admin = getAdminClient()
    const body = await req.json().catch(() => ({}))
    const result = await exchangeTrustedDevice(admin, body, requestMeta(req))
    if (result.error) {
      return jsonResponse(result.status || 401, {
        error: result.error,
        message: result.message,
      }, headers)
    }
    return jsonResponse(200, result, headers)
  } catch (err) {
    return jsonResponse(500, { error: 'server_error', message: err.message }, headers)
  }
}

export const config = { path: '/api/device/exchange' }
