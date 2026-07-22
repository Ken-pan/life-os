import { issueAttestChallenge } from '../../server/appAttest.mjs'
import { corsHeaders, jsonResponse } from '../../server/trustedDeviceAuth.mjs'

export default async (req) => {
  const headers = corsHeaders()
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse(405, { error: 'method_not_allowed' }, headers)
  }
  return jsonResponse(200, { challenge: issueAttestChallenge() }, headers)
}

export const config = { path: '/api/device/attest-challenge' }
