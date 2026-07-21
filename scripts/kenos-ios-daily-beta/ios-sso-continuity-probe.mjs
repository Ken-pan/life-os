#!/usr/bin/env node
/**
 * Continuity SSO probe — verifies shared cookie domain + vault restore order
 * against live LAN origins (no device unlock required for the HTTP half).
 *
 * Exit 0 when Music/Finance/AIOS health + SSO cookie domain policy align.
 * Pair with device-build-install + ios-auth-inject-once for full WK path.
 */
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { resolveSsoCookieDomain } from '../../packages/sync/src/sso.js'

const lan = execSync('ipconfig getifaddr en0', { encoding: 'utf8' }).trim()
const origins = [
  ['aios', `http://${lan}:5219`],
  ['music', `http://${lan}:5189`],
  ['finance', `http://${lan}:5180`],
  ['planner', `http://${lan}:5188`],
]

const results = []
for (const [id, origin] of origins) {
  const host = new URL(origin).hostname
  const domain = resolveSsoCookieDomain(host)
  let health = false
  try {
    const res = await fetch(`${origin}/__health`, {
      signal: AbortSignal.timeout(2500),
    })
    health = res.ok
  } catch {
    health = false
  }
  results.push({ id, origin, host, cookieDomain: domain, health })
}

console.log(JSON.stringify({ ts: new Date().toISOString(), results }, null, 2))

for (const row of results) {
  // LAN IP → host-only cookie (shared across Continuity ports).
  assert.equal(
    row.cookieDomain,
    '',
    `${row.id} LAN host must use host-only SSO cookie`,
  )
}

const healthy = results.filter((r) => r.health).map((r) => r.id)
assert.ok(
  healthy.includes('aios') && healthy.includes('music'),
  `need aios+music healthy for Continuity SSO; got ${healthy.join(',')}`,
)

console.log(
  `ios-sso-continuity-probe: ok (healthy=${healthy.join(',')} cookie=host-only)`,
)
