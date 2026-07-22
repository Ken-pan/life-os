#!/usr/bin/env node
// Production authorization GATE — default DENY. Call this before any
// production-mutating operation. On success it RECORDS one execution against
// the authorization's max count (so the same artifact cannot be reused past its
// budget) and exits 0. On any failure it exits non-zero and mutates nothing.
//
//   node scripts/require-prod-authorization.mjs --operation apply_migration --project iueozzuctstwvzbcxcyh
//
// Wrappers (scripts/supabase-apply.sh, deploy-all-netlify.sh, worker install)
// and the documented agent workflow must gate on this. It never reads or holds
// credentials — it only decides whether a scoped, unexpired, unexhausted,
// Owner-issued authorization exists for this exact operation + project.
import {
  ARTIFACT_PATH, evaluateAuthorization, readArtifact, readUsage, recordUsage,
} from './lib/prodAuthorization.mjs'

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const operation = arg('operation')
const project = arg('project') || process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'
const dryRun = process.argv.includes('--check-only') // evaluate without consuming

if (!operation) {
  console.error('require-prod-authorization: --operation <class> is required')
  process.exit(2)
}

const { artifact, permsSafe } = readArtifact()
if (artifact && !permsSafe) {
  console.error(`✗ DENY: authorization artifact ${ARTIFACT_PATH} has unsafe permissions (must be chmod 600)`)
  process.exit(1)
}

const priorUsage = artifact?.authorizationId ? readUsage(artifact.authorizationId) : 0
const decision = evaluateAuthorization({
  artifact, nowMs: Date.now(), requestedOperation: operation, requestedProject: project, priorUsage,
})

if (!decision.ok) {
  console.error(`✗ DENY production ${operation} on ${project}: ${decision.reason}`)
  console.error(`  An Owner must issue a scoped authorization: npm run prod:authorize -- --operation ${operation} --ttl 1h`)
  process.exit(1)
}

if (dryRun) {
  console.log(`✓ would authorize ${operation} on ${project} (${decision.remaining} execution(s) would remain) — not consumed (--check-only)`)
  process.exit(0)
}

const used = recordUsage(decision.authorizationId)
console.log(`✓ AUTHORIZED ${operation} on ${project} — authorization ${decision.authorizationId} used ${used}/${artifact.maxExecutions}`)
process.exit(0)
