/**
 * Apple App Attest verify helpers (optional dependency: node-app-attest).
 * Enabled when DEVICE_ATTEST_REQUIRED=1 and APPLE_TEAM_ID + APPLE_BUNDLE_ID are set.
 */

import { createHash, randomBytes } from 'node:crypto'
import { readEnv } from './pushEnv.mjs'

export function appAttestConfig() {
  const required = readEnv('DEVICE_ATTEST_REQUIRED') === '1'
  const teamId = readEnv('APPLE_TEAM_ID') || '93NJ4CAU8B'
  const bundleId = readEnv('APPLE_BUNDLE_ID') || 'space.kenos.app.ios'
  const allowDev = readEnv('APPLE_APP_ATTEST_ALLOW_DEV') !== '0'
  return { required, teamId, bundleId, allowDev }
}

/**
 * Challenge bytes for attestation (client hashes with public key material).
 */
export function issueAttestChallenge() {
  return randomBytes(32).toString('base64url')
}

/**
 * @param {string} challengeB64url
 * @param {string} clientDataUtf8
 */
export function clientDataHash(challengeB64url, clientDataUtf8) {
  const payload = `${challengeB64url}.${clientDataUtf8}`
  return createHash('sha256').update(payload, 'utf8').digest()
}

/**
 * Verify first-time attestation; returns PEM public key + keyId.
 * @param {{
 *   attestation: string,
 *   keyId: string,
 *   challenge: string,
 *   clientData?: string,
 * }} input
 */
export async function verifyAppAttestation(input) {
  const cfg = appAttestConfig()
  let verifyAttestation
  try {
    ;({ verifyAttestation } = await import('node-app-attest'))
  } catch {
    return {
      ok: false,
      error: 'attest_library_missing',
      message: 'node-app-attest is not installed on the server.',
    }
  }

  try {
    const challenge = Buffer.from(String(input.challenge || ''), 'utf8')
    const result = verifyAttestation({
      attestation: Buffer.from(String(input.attestation || ''), 'base64'),
      challenge,
      keyId: String(input.keyId || ''),
      bundleIdentifier: cfg.bundleId,
      teamIdentifier: cfg.teamId,
      allowDevelopmentEnvironment: cfg.allowDev,
    })
    return {
      ok: true,
      keyId: result.keyId || input.keyId,
      publicKeyPem: result.publicKey,
    }
  } catch (err) {
    return {
      ok: false,
      error: 'attest_invalid',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Verify assertion for an already-attested key.
 * @param {{
 *   assertion: string,
 *   publicKeyPem: string,
 *   payload: string,
 *   signCount: number,
 * }} input
 */
export async function verifyAppAssertion(input) {
  const cfg = appAttestConfig()
  let verifyAssertion
  try {
    ;({ verifyAssertion } = await import('node-app-attest'))
  } catch {
    return {
      ok: false,
      error: 'attest_library_missing',
      message: 'node-app-attest is not installed on the server.',
    }
  }

  try {
    const result = verifyAssertion({
      assertion: Buffer.from(String(input.assertion || ''), 'base64'),
      payload: String(input.payload || ''),
      publicKey: String(input.publicKeyPem || ''),
      bundleIdentifier: cfg.bundleId,
      teamIdentifier: cfg.teamId,
      signCount: Number(input.signCount || 0),
    })
    return { ok: true, signCount: result.signCount }
  } catch (err) {
    return {
      ok: false,
      error: 'assertion_invalid',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
