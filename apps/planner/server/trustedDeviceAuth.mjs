/**
 * Owner Device Lock — pair / challenge / exchange / revoke (service role).
 * Hardening: audit events, challenge replay guard, revoke → signOut others,
 * optional App Attest gate, fresh-session step-up for revoke.
 */

import { createClient } from '@supabase/supabase-js'
import { createHmac, createPublicKey, createHash, randomBytes, timingSafeEqual, verify as cryptoVerify } from 'node:crypto'

/** Constant-time string compare for MAC/hash values (avoids timing side channel). */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
import {
  LIFE_OS_PERSONAL_OWNER_EMAIL,
  MAX_TRUSTED_DEVICES,
  TRUSTED_DEVICES_TABLE,
  TRUSTED_DEVICE_SELECT,
  findTrustedDeviceSlot,
  isLifeOsPersonalOwnerEmail,
  newTrustedDeviceRowId,
} from '@life-os/sync'
import { readEnv, readSupabaseServiceRoleKey, readSupabaseUrl } from './pushEnv.mjs'
import { appAttestConfig, verifyAppAssertion, verifyAppAttestation } from './appAttest.mjs'

const CHALLENGE_TTL_SEC = 120
/** Revoke / hang-up requires a session issued within this window (step-up). */
const REVOKE_MAX_SESSION_AGE_SEC = 15 * 60
const TABLE = TRUSTED_DEVICES_TABLE
const EVENTS = 'core_device_auth_events'
const NONCES = 'core_device_challenge_nonces'
const AUTH_STATE = 'core_device_auth_state'
const DEVICE_SELECT_LEGACY =
  'id,device_class,label,user_agent,device_id,created_at,last_seen_at,public_key,platform,paired_at,revoked_at,last_challenge_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} userId
 */
async function listActiveDevices(admin, userId) {
  let { data, error } = await admin
    .from(TABLE)
    .select(TRUSTED_DEVICE_SELECT)
    .eq('user_id', userId)
    .is('revoked_at', null)
  if (error) {
    ;({ data, error } = await admin
      .from(TABLE)
      .select(DEVICE_SELECT_LEGACY)
      .eq('user_id', userId)
      .is('revoked_at', null))
    if (error) throw error
  }
  return data ?? []
}

export function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

export function jsonResponse(status, body, headers = corsHeaders()) {
  return new Response(JSON.stringify(body), { status, headers })
}

export function getAdminClient() {
  const url = readSupabaseUrl()
  const key = readSupabaseServiceRoleKey()
  if (!url || !key) {
    throw new Error('Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not configured.')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function hmacSecret() {
  // Prefer a dedicated secret; fall back to the service-role key so existing
  // deployments keep working. Never fall back to a public literal — that would
  // let anyone forge challenges. Fail closed if neither is configured.
  const secret = readEnv('DEVICE_AUTH_HMAC_SECRET') || readSupabaseServiceRoleKey()
  if (!secret) {
    throw new Error('device_auth_hmac_secret_unconfigured')
  }
  return secret
}

function attestRequired() {
  return appAttestConfig().required
}

/**
 * @param {Request} [req]
 */
export function requestMeta(req) {
  if (!req?.headers) return { ip: null, userAgent: null }
  const fwd = req.headers.get('x-forwarded-for') || ''
  const ip = fwd.split(',')[0]?.trim() || req.headers.get('x-nf-client-connection-ip') || null
  return {
    ip,
    userAgent: req.headers.get('user-agent'),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {object} row
 */
export async function writeDeviceAuthEvent(admin, row) {
  try {
    await admin.from(EVENTS).insert({
      user_id: row.userId ?? null,
      device_row_id: row.deviceRowId ?? null,
      device_id: row.deviceId ?? null,
      event: row.event,
      result: row.result,
      error_code: row.errorCode ?? null,
      platform: row.platform ?? null,
      key_storage: row.keyStorage ?? null,
      attest_key_id: row.attestKeyId ?? null,
      ip: row.ip ?? null,
      user_agent: row.userAgent ?? null,
      metadata: row.metadata ?? {},
    })
  } catch {
    // Audit must not break auth path.
  }
}

/**
 * @param {string} bearerToken
 */
export async function requireUserFromBearer(admin, bearerToken) {
  if (!bearerToken) return { error: 'unauthorized', status: 401 }
  const token = bearerToken.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: 'unauthorized', status: 401 }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return { error: 'unauthorized', status: 401 }
  return { user: data.user, accessToken: token }
}

/**
 * @param {import('@supabase/supabase-js').User} user
 */
export function requirePersonalOwner(user) {
  if (!isLifeOsPersonalOwnerEmail(user?.email)) {
    return { error: 'owner_only', status: 403, message: 'Device lock is only for the personal owner.' }
  }
  return null
}

/**
 * JWT iat freshness check (step-up for revoke).
 * @param {string} accessToken
 * @param {number} [maxAgeSec]
 */
export function requireFreshAccessToken(accessToken, maxAgeSec = REVOKE_MAX_SESSION_AGE_SEC) {
  try {
    const parts = String(accessToken || '').split('.')
    if (parts.length < 2) return { error: 'step_up_required', status: 401, message: 'Re-authenticate to manage devices.' }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    const iat = Number(payload?.iat)
    if (!Number.isFinite(iat)) {
      return { error: 'step_up_required', status: 401, message: 'Re-authenticate to manage devices.' }
    }
    if (Math.floor(Date.now() / 1000) - iat > maxAgeSec) {
      return {
        error: 'step_up_required',
        status: 401,
        message: 'Session too old — sign in again (or refresh) before revoking a device.',
      }
    }
    return null
  } catch {
    return { error: 'step_up_required', status: 401, message: 'Re-authenticate to manage devices.' }
  }
}

/**
 * Stateless challenge: base64url(payload).hmac
 * @param {{ deviceId: string, nonce?: string }} opts
 */
export function issueChallenge({ deviceId, nonce }) {
  const n = nonce || randomBytes(16).toString('hex')
  const payload = {
    n,
    exp: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC,
    did: deviceId,
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const mac = createHmac('sha256', hmacSecret()).update(body).digest('base64url')
  return { challenge: `${body}.${mac}`, nonce: n, exp: payload.exp }
}

/**
 * @param {string} challenge
 * @returns {{ ok: true, deviceId: string, nonce: string, exp: number } | { ok: false, error: string }}
 */
export function parseAndVerifyChallenge(challenge) {
  if (typeof challenge !== 'string' || !challenge.includes('.')) {
    return { ok: false, error: 'invalid_challenge' }
  }
  const [body, mac] = challenge.split('.')
  const expected = createHmac('sha256', hmacSecret()).update(body).digest('base64url')
  if (!safeEqual(mac, expected)) return { ok: false, error: 'invalid_challenge' }
  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, error: 'invalid_challenge' }
  }
  if (!payload?.did || !payload?.exp || !payload?.n) return { ok: false, error: 'invalid_challenge' }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: 'challenge_expired' }
  }
  return { ok: true, deviceId: String(payload.did), nonce: String(payload.n), exp: Number(payload.exp) }
}

/**
 * @param {string} publicKeyX963B64
 * @param {string} challenge
 * @param {string} signatureB64
 */
export function verifyDeviceSignature(publicKeyX963B64, challenge, signatureB64) {
  try {
    const pub = Buffer.from(publicKeyX963B64, 'base64')
    if (pub.length !== 65 || pub[0] !== 0x04) return false
    const x = pub.subarray(1, 33).toString('base64url')
    const y = pub.subarray(33, 65).toString('base64url')
    const key = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x, y },
      format: 'jwk',
    })
    return cryptoVerify(
      'SHA256',
      Buffer.from(challenge, 'utf8'),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signatureB64, 'base64'),
    )
  } catch {
    return false
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} email
 */
export async function mintOwnerSession(admin, email = LIFE_OS_PERSONAL_OWNER_EMAIL) {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError) throw linkError
  const tokenHash = linkData?.properties?.hashed_token
  if (!tokenHash) throw new Error('generateLink did not return hashed_token')

  const { data, error } = await admin.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })
  if (error) throw error
  if (!data?.session?.access_token || !data?.session?.refresh_token) {
    throw new Error('verifyOtp did not return a session')
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user_id: data.user?.id ?? data.session.user?.id ?? null,
    expires_at: data.session.expires_at ?? null,
  }
}

/**
 * Bump session epoch after revoke (clients can detect stale vaults).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} userId
 */
export async function bumpSessionEpoch(admin, userId) {
  const { data: existing } = await admin
    .from(AUTH_STATE)
    .select('session_epoch')
    .eq('user_id', userId)
    .maybeSingle()
  const next = (existing?.session_epoch ?? 0) + 1
  await admin.from(AUTH_STATE).upsert({
    user_id: userId,
    session_epoch: next,
    updated_at: new Date().toISOString(),
  })
  return next
}

/**
 * Sign out other sessions so revoked device refresh tokens die, keep revoker JWT alive.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} accessToken
 */
export async function signOutOtherSessions(admin, accessToken) {
  if (!accessToken || typeof admin.auth.admin.signOut !== 'function') return { ok: false }
  try {
    const { error } = await admin.auth.admin.signOut(accessToken, 'others')
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Register challenge nonce; fails if already consumed (replay).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function persistChallengeNonce(admin, { nonce, deviceId, exp }) {
  const expiresAt = new Date(exp * 1000).toISOString()
  const { error } = await admin.from(NONCES).insert({
    nonce,
    device_id: deviceId,
    expires_at: expiresAt,
  })
  if (error && error.code !== '23505') throw error
}

/**
 * Atomically consume nonce — returns false if missing/expired/already used.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} nonce
 */
export async function consumeChallengeNonce(admin, nonce) {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from(NONCES)
    .update({ consumed_at: now })
    .eq('nonce', nonce)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .select('nonce')
    .maybeSingle()
  if (error) throw error
  return Boolean(data?.nonce)
}

/**
 * Pair: register pubkey into 1+1 slot (owner JWT required).
 */
export async function pairTrustedDevice(admin, user, body, meta = {}) {
  const ownerErr = requirePersonalOwner(user)
  if (ownerErr) {
    await writeDeviceAuthEvent(admin, {
      userId: user?.id,
      event: 'pair_denied',
      result: 'error',
      errorCode: ownerErr.error,
      ...meta,
    })
    return ownerErr
  }

  const deviceId = String(body?.deviceId || '').trim()
  const deviceClass = body?.deviceClass === 'mobile' ? 'mobile' : body?.deviceClass === 'desktop' ? 'desktop' : null
  const publicKey = String(body?.publicKey || '').trim()
  const platform = ['ios', 'macos', 'web'].includes(body?.platform) ? body.platform : null
  const keyStorage =
    body?.keyStorage === 'secure_enclave' || body?.keyStorage === 'software' ? body.keyStorage : null
  const attestKeyId = body?.attestKeyId != null ? String(body.attestKeyId).trim() : null
  const attestation = body?.attestation != null ? String(body.attestation).trim() : null
  const attestChallenge = body?.attestChallenge != null ? String(body.attestChallenge).trim() : null
  const label = String(body?.label || '').trim() || (deviceClass === 'mobile' ? 'iPhone' : 'Mac')
  const userAgent = body?.userAgent != null ? String(body.userAgent) : meta.userAgent

  if (!deviceId || !deviceClass || !publicKey) {
    return { error: 'invalid_body', status: 400, message: 'deviceId, deviceClass, publicKey required' }
  }
  const pubBuf = Buffer.from(publicKey, 'base64')
  if (pubBuf.length !== 65 || pubBuf[0] !== 0x04) {
    return { error: 'invalid_public_key', status: 400, message: 'publicKey must be P-256 X9.63 base64' }
  }

  /** @type {string|null} */
  let attestPublicKeyPem = null
  if (attestRequired() || (attestKeyId && attestation && attestChallenge)) {
    if (!attestKeyId || !attestation || !attestChallenge) {
      await writeDeviceAuthEvent(admin, {
        userId: user.id,
        deviceId,
        event: 'pair_denied',
        result: 'error',
        errorCode: 'attest_required',
        platform,
        keyStorage,
        ...meta,
      })
      return {
        error: 'attest_required',
        status: 403,
        message: 'App Attest attestation + challenge required for pairing.',
      }
    }
    const verified = await verifyAppAttestation({
      attestation,
      keyId: attestKeyId,
      challenge: attestChallenge,
    })
    if (!verified.ok) {
      await writeDeviceAuthEvent(admin, {
        userId: user.id,
        deviceId,
        event: 'attest_denied',
        result: 'error',
        errorCode: verified.error,
        platform,
        keyStorage,
        attestKeyId,
        ...meta,
        metadata: { message: verified.message },
      })
      return {
        error: verified.error || 'attest_invalid',
        status: 403,
        message: verified.message || 'App Attest verification failed.',
      }
    }
    attestPublicKeyPem = verified.publicKeyPem || null
    await writeDeviceAuthEvent(admin, {
      userId: user.id,
      deviceId,
      event: 'attest',
      result: 'ok',
      platform,
      keyStorage,
      attestKeyId,
      ...meta,
    })
  }

  const devices = await listActiveDevices(admin, user.id)
  const slot = findTrustedDeviceSlot(devices, { deviceId, deviceClass })
  const now = new Date().toISOString()

  const patch = {
    public_key: publicKey,
    platform,
    paired_at: now,
    last_seen_at: now,
    device_id: deviceId,
    label,
    user_agent: userAgent,
  }
  if (keyStorage) patch.key_storage = keyStorage
  if (attestKeyId) patch.attest_key_id = attestKeyId
  if (attestPublicKeyPem) {
    patch.attest_public_key_pem = attestPublicKeyPem
    patch.attest_sign_count = 0
  }

  if (slot) {
    const nextVersion = (slot.credential_version ?? 1) + (slot.public_key && slot.public_key !== publicKey ? 1 : 0)
    if (slot.credential_version != null || keyStorage || attestKeyId) {
      patch.credential_version = Math.max(1, nextVersion)
    }
    let { data, error } = await admin
      .from(TABLE)
      .update(patch)
      .eq('id', slot.id)
      .select(TRUSTED_DEVICE_SELECT)
      .single()
    if (error) {
      ;({ data, error } = await admin
        .from(TABLE)
        .update({
          public_key: publicKey,
          platform,
          paired_at: now,
          last_seen_at: now,
          device_id: deviceId,
          label,
          user_agent: userAgent,
        })
        .eq('id', slot.id)
        .select(DEVICE_SELECT_LEGACY)
        .single())
      if (error) throw error
    }
    await writeDeviceAuthEvent(admin, {
      userId: user.id,
      deviceRowId: data.id,
      deviceId,
      event: 'pair',
      result: 'ok',
      platform,
      keyStorage,
      attestKeyId,
      ...meta,
      metadata: { mode: 'update' },
    })
    return { status: 'authorized', device: data }
  }

  if (devices.length >= MAX_TRUSTED_DEVICES) {
    await writeDeviceAuthEvent(admin, {
      userId: user.id,
      deviceId,
      event: 'pair_denied',
      result: 'error',
      errorCode: 'limit_reached',
      platform,
      keyStorage,
      ...meta,
    })
    return { error: 'limit_reached', status: 409, message: 'Device slot limit reached (1 desktop + 1 mobile).' }
  }

  const row = {
    id: newTrustedDeviceRowId(),
    user_id: user.id,
    device_class: deviceClass,
    label,
    user_agent: userAgent,
    device_id: deviceId,
    last_seen_at: now,
    platform,
    public_key: publicKey,
    paired_at: now,
  }
  if (keyStorage) row.key_storage = keyStorage
  if (attestKeyId) row.attest_key_id = attestKeyId
  if (attestPublicKeyPem) {
    row.attest_public_key_pem = attestPublicKeyPem
    row.attest_sign_count = 0
  }
  row.credential_version = 1

  let { data, error } = await admin.from(TABLE).insert(row).select(TRUSTED_DEVICE_SELECT).single()
  if (error) {
    const legacyRow = { ...row }
    delete legacyRow.key_storage
    delete legacyRow.attest_key_id
    delete legacyRow.credential_version
    delete legacyRow.attest_public_key_pem
    delete legacyRow.attest_sign_count
    ;({ data, error } = await admin.from(TABLE).insert(legacyRow).select(DEVICE_SELECT_LEGACY).single())
  }
  if (error) {
    if (error.code === '23505') {
      return { error: 'limit_reached', status: 409, message: 'Device class slot already taken.' }
    }
    throw error
  }
  await writeDeviceAuthEvent(admin, {
    userId: user.id,
    deviceRowId: data.id,
    deviceId,
    event: 'pair',
    result: 'ok',
    platform,
    keyStorage,
    attestKeyId,
    ...meta,
    metadata: { mode: 'insert' },
  })
  return { status: 'authorized', device: data }
}

/**
 * Issue challenge + persist nonce for replay protection.
 */
export async function challengeTrustedDevice(admin, body, meta = {}) {
  const deviceId = String(body?.deviceId || '').trim()
  if (!deviceId) {
    return { error: 'invalid_body', status: 400, message: 'deviceId required' }
  }
  const issued = issueChallenge({ deviceId })
  try {
    await persistChallengeNonce(admin, {
      nonce: issued.nonce,
      deviceId,
      exp: issued.exp,
    })
  } catch {
    // Table may not exist pre-migration — still return challenge (HMAC binds it).
  }
  await writeDeviceAuthEvent(admin, {
    deviceId,
    event: 'challenge',
    result: 'ok',
    ...meta,
  })
  return { challenge: issued.challenge, expiresIn: CHALLENGE_TTL_SEC }
}

/**
 * Exchange signed challenge for SSO tokens.
 */
export async function exchangeTrustedDevice(admin, body, meta = {}) {
  const challenge = String(body?.challenge || '')
  const signature = String(body?.signature || '')
  const parsed = parseAndVerifyChallenge(challenge)
  if (!parsed.ok) {
    await writeDeviceAuthEvent(admin, {
      event: 'exchange_denied',
      result: 'error',
      errorCode: parsed.error,
      ...meta,
    })
    return { error: parsed.error, status: 401 }
  }

  try {
    const consumed = await consumeChallengeNonce(admin, parsed.nonce)
    if (!consumed) {
      // If nonce table empty/missing, fall back to HMAC-only (pre-migration).
      const { count } = await admin
        .from(NONCES)
        .select('nonce', { count: 'exact', head: true })
        .eq('nonce', parsed.nonce)
      if (count && count > 0) {
        await writeDeviceAuthEvent(admin, {
          deviceId: parsed.deviceId,
          event: 'exchange_denied',
          result: 'error',
          errorCode: 'challenge_replay',
          ...meta,
        })
        return { error: 'challenge_replay', status: 401, message: 'Challenge already used.' }
      }
    }
  } catch {
    // Pre-migration: skip replay table.
  }

  const { data: device, error } = await admin
    .from(TABLE)
    .select(`${TRUSTED_DEVICE_SELECT}, user_id`)
    .eq('device_id', parsed.deviceId)
    .is('revoked_at', null)
    .not('public_key', 'is', null)
    .maybeSingle()
  if (error) throw error
  if (!device?.public_key) {
    await writeDeviceAuthEvent(admin, {
      deviceId: parsed.deviceId,
      event: 'exchange_denied',
      result: 'error',
      errorCode: 'device_not_paired',
      ...meta,
    })
    return { error: 'device_not_paired', status: 401, message: 'Device is not paired or was revoked.' }
  }

  if (!verifyDeviceSignature(device.public_key, challenge, signature)) {
    await writeDeviceAuthEvent(admin, {
      userId: device.user_id,
      deviceRowId: device.id,
      deviceId: parsed.deviceId,
      event: 'exchange_denied',
      result: 'error',
      errorCode: 'invalid_signature',
      ...meta,
    })
    return { error: 'invalid_signature', status: 401 }
  }

  // When App Attest enforced (or device already attested), require assertion over challenge.
  const assertion = body?.assertion != null ? String(body.assertion).trim() : ''
  let nextSignCount = device.attest_sign_count ?? 0
  if (attestRequired() || device.attest_public_key_pem) {
    if (!assertion || !device.attest_public_key_pem) {
      await writeDeviceAuthEvent(admin, {
        userId: device.user_id,
        deviceRowId: device.id,
        deviceId: parsed.deviceId,
        event: 'exchange_denied',
        result: 'error',
        errorCode: 'attest_required',
        ...meta,
      })
      return {
        error: 'attest_required',
        status: 403,
        message: 'App Attest assertion required for exchange.',
      }
    }
    const asserted = await verifyAppAssertion({
      assertion,
      publicKeyPem: device.attest_public_key_pem,
      payload: challenge,
      signCount: nextSignCount,
    })
    if (!asserted.ok) {
      await writeDeviceAuthEvent(admin, {
        userId: device.user_id,
        deviceRowId: device.id,
        deviceId: parsed.deviceId,
        event: 'exchange_denied',
        result: 'error',
        errorCode: asserted.error,
        ...meta,
        metadata: { message: asserted.message },
      })
      return {
        error: asserted.error || 'assertion_invalid',
        status: 403,
        message: asserted.message || 'App Attest assertion failed.',
      }
    }
    nextSignCount = asserted.signCount ?? nextSignCount + 1
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(device.user_id)
  if (userError || !userData?.user) {
    return { error: 'user_not_found', status: 401 }
  }
  const ownerErr = requirePersonalOwner(userData.user)
  if (ownerErr) return ownerErr

  const session = await mintOwnerSession(admin, userData.user.email)
  await admin
    .from(TABLE)
    .update({
      last_seen_at: new Date().toISOString(),
      last_challenge_at: new Date().toISOString(),
      attest_sign_count: nextSignCount,
    })
    .eq('id', device.id)

  let sessionEpoch = 0
  try {
    const { data: state } = await admin
      .from(AUTH_STATE)
      .select('session_epoch')
      .eq('user_id', device.user_id)
      .maybeSingle()
    sessionEpoch = state?.session_epoch ?? 0
  } catch {
    /* pre-migration */
  }

  await writeDeviceAuthEvent(admin, {
    userId: device.user_id,
    deviceRowId: device.id,
    deviceId: parsed.deviceId,
    event: 'exchange',
    result: 'ok',
    platform: device.platform,
    keyStorage: device.key_storage,
    ...meta,
    metadata: { session_epoch: sessionEpoch },
  })

  return {
    status: 'ok',
    session: { ...session, session_epoch: sessionEpoch },
    device: {
      id: device.id,
      device_class: device.device_class,
      label: device.label,
      key_storage: device.key_storage ?? null,
    },
  }
}

/**
 * Soft-revoke + bump epoch + sign out other sessions (step-up required).
 */
export async function revokeTrustedDeviceRow(admin, user, body, meta = {}, accessToken = '') {
  const ownerErr = requirePersonalOwner(user)
  if (ownerErr) {
    await writeDeviceAuthEvent(admin, {
      userId: user?.id,
      event: 'revoke_denied',
      result: 'error',
      errorCode: ownerErr.error,
      ...meta,
    })
    return ownerErr
  }

  const freshErr = requireFreshAccessToken(accessToken)
  if (freshErr) {
    await writeDeviceAuthEvent(admin, {
      userId: user.id,
      event: 'revoke_denied',
      result: 'error',
      errorCode: freshErr.error,
      ...meta,
    })
    return freshErr
  }

  const id = String(body?.id || '').trim()
  if (!id) return { error: 'invalid_body', status: 400, message: 'id required' }

  const { data, error } = await admin
    .from(TABLE)
    .update({
      revoked_at: new Date().toISOString(),
      public_key: null,
      attest_key_id: null,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, device_id, platform')
    .maybeSingle()
  if (error) throw error
  if (!data) {
    await writeDeviceAuthEvent(admin, {
      userId: user.id,
      event: 'revoke_denied',
      result: 'error',
      errorCode: 'not_found',
      ...meta,
    })
    return { error: 'not_found', status: 404 }
  }

  let sessionEpoch = null
  try {
    sessionEpoch = await bumpSessionEpoch(admin, user.id)
  } catch {
    /* pre-migration */
  }

  const signOut = await signOutOtherSessions(admin, accessToken)

  await writeDeviceAuthEvent(admin, {
    userId: user.id,
    deviceRowId: data.id,
    deviceId: data.device_id,
    event: 'revoke',
    result: 'ok',
    platform: data.platform,
    ...meta,
    metadata: {
      session_epoch: sessionEpoch,
      sign_out_others: signOut.ok,
      sign_out_error: signOut.error ?? null,
    },
  })

  return {
    status: 'revoked',
    id: data.id,
    sessionEpoch,
    signedOutOthers: Boolean(signOut.ok),
  }
}

/**
 * Hang up all trusted devices (lost phone) — soft-revoke every slot + global sign-out.
 */
export async function hangupAllTrustedDevices(admin, user, meta = {}, accessToken = '') {
  const ownerErr = requirePersonalOwner(user)
  if (ownerErr) {
    await writeDeviceAuthEvent(admin, {
      userId: user?.id,
      event: 'hangup_denied',
      result: 'error',
      errorCode: ownerErr.error,
      ...meta,
    })
    return ownerErr
  }

  const freshErr = requireFreshAccessToken(accessToken)
  if (freshErr) {
    await writeDeviceAuthEvent(admin, {
      userId: user.id,
      event: 'hangup_denied',
      result: 'error',
      errorCode: freshErr.error,
      ...meta,
    })
    return freshErr
  }

  const now = new Date().toISOString()
  const { data: revoked, error } = await admin
    .from(TABLE)
    .update({
      revoked_at: now,
      public_key: null,
      attest_key_id: null,
      attest_public_key_pem: null,
    })
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .select('id, device_id')
  if (error) throw error

  let sessionEpoch = null
  try {
    sessionEpoch = await bumpSessionEpoch(admin, user.id)
  } catch {
    /* ignore */
  }

  // Global sign-out — owner must sign in again on every surface.
  let signedOutGlobal = false
  try {
    if (typeof admin.auth.admin.signOut === 'function' && accessToken) {
      const { error: soErr } = await admin.auth.admin.signOut(accessToken, 'global')
      signedOutGlobal = !soErr
    }
  } catch {
    signedOutGlobal = false
  }

  await writeDeviceAuthEvent(admin, {
    userId: user.id,
    event: 'hangup',
    result: 'ok',
    ...meta,
    metadata: {
      revoked_count: (revoked ?? []).length,
      session_epoch: sessionEpoch,
      signed_out_global: signedOutGlobal,
    },
  })

  return {
    status: 'hung_up',
    revokedCount: (revoked ?? []).length,
    ids: (revoked ?? []).map((r) => r.id),
    sessionEpoch,
    signedOutGlobal,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} userId
 */
export async function readSessionEpoch(admin, userId) {
  const { data, error } = await admin
    .from(AUTH_STATE)
    .select('session_epoch, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return {
    sessionEpoch: data?.session_epoch ?? 0,
    updatedAt: data?.updated_at ?? null,
  }
}

/** @deprecated test helper name */
export function challengeHash(challenge) {
  return createHash('sha256').update(challenge).digest('hex')
}
