import assert from 'node:assert/strict'
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto'
import {
  issueChallenge,
  parseAndVerifyChallenge,
  requireFreshAccessToken,
  verifyDeviceSignature,
} from './trustedDeviceAuth.mjs'

process.env.DEVICE_AUTH_HMAC_SECRET = 'test-device-auth-hmac'

const issued = issueChallenge({ deviceId: 'device-abc' })
assert.ok(issued.challenge)
assert.ok(issued.nonce)
const parsed = parseAndVerifyChallenge(issued.challenge)
assert.equal(parsed.ok, true)
assert.equal(parsed.deviceId, 'device-abc')
assert.equal(parsed.nonce, issued.nonce)

assert.equal(parseAndVerifyChallenge('not-a-challenge').ok, false)
assert.equal(parseAndVerifyChallenge(`${issued.challenge}x`).ok, false)

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const jwk = publicKey.export({ format: 'jwk' })
const x = Buffer.from(jwk.x, 'base64url')
const y = Buffer.from(jwk.y, 'base64url')
const x963 = Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64')
const signature = cryptoSign('SHA256', Buffer.from(issued.challenge, 'utf8'), {
  key: privateKey,
  dsaEncoding: 'ieee-p1363',
}).toString('base64')

assert.equal(verifyDeviceSignature(x963, issued.challenge, signature), true)
assert.equal(verifyDeviceSignature(x963, `${issued.challenge}-tamper`, signature), false)

// Fresh JWT (iat now) passes; old iat fails step-up.
const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
function fakeJwt(iat) {
  const payload = Buffer.from(JSON.stringify({ iat, sub: 'u1' })).toString('base64url')
  return `${header}.${payload}.sig`
}
assert.equal(requireFreshAccessToken(fakeJwt(Math.floor(Date.now() / 1000))), null)
assert.equal(requireFreshAccessToken(fakeJwt(Math.floor(Date.now() / 1000) - 3600))?.error, 'step_up_required')

console.log('trustedDeviceAuth.test.mjs — OK')
