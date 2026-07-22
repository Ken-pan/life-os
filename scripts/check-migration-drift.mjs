#!/usr/bin/env node
// Migration-version drift detector (read-only). Run BEFORE any production DB
// operation (supabase db push / apply_migration).
//
// The shared Supabase project accumulates a UNION of per-app migration dirs.
// When a migration is applied out-of-band (e.g. the Supabase MCP apply_migration
// tool assigns its own wall-clock version stamp), the production
// schema_migrations history records a version that differs from the committed
// filename — even though the DDL is identical. A later `supabase db push` then
// sees the committed file as "not applied" and re-runs the DDL under a second
// version, and `migration repair` becomes tempting (and dangerous — see
// docs memory: repair --reverted deletes real history).
//
// This detector flags "drift pairs": a production migration NAME that also
// exists as a committed migration file, but under a DIFFERENT version stamp.
// That is the actionable signal. It never mutates anything.
//
// Auth: SUPABASE_ACCESS_TOKEN env, else macOS keychain ("Supabase CLI").
// No token → SKIP (exit 0) so it is safe in CI without secrets.
//
// Exit: 0 = no drift pairs (or skipped); 1 = drift pairs found.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'
const BASELINE_PATH = join(ROOT, 'scripts', 'migration-drift-baseline.json')

// Pre-existing drift pairs the owner has not yet reconciled — the detector
// ignores these so it fails only on NEW drift. Keyed by `${name}@${repoVersion}`.
function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return new Set()
  try {
    const j = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    return new Set((j.acceptedDriftPairs || []).map((p) => `${p.name}@${p.repoVersion}`))
  } catch {
    return new Set()
  }
}

function resolveToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  try {
    return execSync('security find-generic-password -s "Supabase CLI" -w', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

// Collect committed migrations: version -> { name, files: [relpath] }
function collectRepoMigrations() {
  const out = new Map()
  const dirs = execSync(
    "git ls-files '*/supabase/migrations/*.sql'", { cwd: ROOT, encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean)
  for (const rel of dirs) {
    const base = rel.split('/').pop()
    const m = base.match(/^(\d{14})_(.+)\.sql$/)
    if (!m) continue
    const [, version, name] = m
    if (!out.has(version)) out.set(version, { name, files: [] })
    out.get(version).files.push(rel)
  }
  return out
}

async function fetchProdMigrations(token) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'select version, name from supabase_migrations.schema_migrations order by version',
      }),
    },
  )
  if (!res.ok) throw new Error(`management API ${res.status}: ${await res.text()}`)
  return await res.json() // [{version, name}]
}

export function normalizeName(name) {
  // committed files sometimes carry a redundant leading timestamp in the name
  // segment (e.g. 20260719130100_kenos_wave1_...); prod stores just the tail.
  return String(name || '').replace(/^\d{14}_/, '')
}

/**
 * Pure drift diff. Testable without network/git.
 * @param {Map<string,{name:string,files:string[]}>} repo  version -> meta
 * @param {Array<{version:string,name:string}>} prod
 * @param {Set<string>} baseline  set of `${name}@${repoVersion}`
 * @returns {{ driftPairs, baselinedPairs, orphanProd, pendingRepo }}
 */
export function computeDrift(repo, prod, baseline = new Set()) {
  const prodByVersion = new Map(prod.map((r) => [r.version, normalizeName(r.name)]))
  const prodNames = new Map()
  for (const r of prod) {
    const n = normalizeName(r.name)
    if (!prodNames.has(n)) prodNames.set(n, [])
    prodNames.get(n).push(r.version)
  }
  const driftPairs = []
  const baselinedPairs = []
  for (const [version, { name, files }] of repo) {
    const nn = normalizeName(name)
    if (prodByVersion.has(version)) continue
    const prodVersions = (prodNames.get(nn) || []).filter((v) => !repo.has(v))
    if (prodVersions.length > 0) {
      const pair = { name: nn, repoVersion: version, prodVersions, files }
      if (baseline.has(`${nn}@${version}`)) baselinedPairs.push(pair)
      else driftPairs.push(pair)
    }
  }
  const repoVersions = new Set(repo.keys())
  const orphanProd = prod.filter((r) => !repoVersions.has(r.version) &&
    ![...driftPairs, ...baselinedPairs].some((d) => d.prodVersions.includes(r.version)))
  const pendingRepo = [...repo.entries()].filter(([v]) => !prodByVersion.has(v) &&
    ![...driftPairs, ...baselinedPairs].some((d) => d.repoVersion === v))
  return { driftPairs, baselinedPairs, orphanProd, pendingRepo }
}

async function main() {
  const token = resolveToken()
  if (!token) {
    console.log('check-migration-drift: SKIP (no SUPABASE_ACCESS_TOKEN / keychain entry)')
    process.exit(0)
  }
  const repo = collectRepoMigrations()
  const prod = await fetchProdMigrations(token)
  const baseline = loadBaseline()
  const { driftPairs, baselinedPairs, orphanProd, pendingRepo } = computeDrift(repo, prod, baseline)

  console.log(`check-migration-drift: repo=${repo.size} prod=${prod.length}`)
  if (pendingRepo.length) {
    console.log(`  pending (committed, not yet applied): ${pendingRepo.length}`)
  }
  if (orphanProd.length) {
    console.log(`  orphan (applied, no committed source): ${orphanProd.length}`)
    for (const r of orphanProd) console.log(`    - ${r.version} ${r.name}`)
  }

  if (baselinedPairs.length) {
    console.log(`  baselined (pre-existing, owner-to-reconcile): ${baselinedPairs.length}`)
    for (const d of baselinedPairs) console.log(`    - ${d.name}: repo ${d.repoVersion} vs prod ${d.prodVersions.join(',')}`)
  }
  if (driftPairs.length === 0) {
    console.log('check-migration-drift OK — no NEW version-drift pairs')
    process.exit(0)
  }
  console.error(`\ncheck-migration-drift FAIL — ${driftPairs.length} drift pair(s):`)
  for (const d of driftPairs) {
    console.error(`  ✗ "${d.name}"`)
    console.error(`      repo file version : ${d.repoVersion} (${d.files.join(', ')})`)
    console.error(`      prod version(s)   : ${d.prodVersions.join(', ')}`)
    console.error(`      fix: git mv the repo file to ${d.prodVersions[0]}_${d.name}.sql`)
  }
  console.error('\nSee docs/productivity/MIGRATION_RECONCILIATION.md before any db push.')
  process.exit(1)
}

main().catch((e) => {
  console.error('check-migration-drift ERROR:', e.message)
  process.exit(existsSync ? 2 : 2)
})
