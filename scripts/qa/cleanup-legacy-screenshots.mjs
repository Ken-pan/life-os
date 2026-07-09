#!/usr/bin/env node
/**
 * Remove legacy screenshot locations superseded by docs/ui-qa-screenshots/{app}/{suite}/latest/
 *
 * Usage:
 *   node scripts/qa/cleanup-legacy-screenshots.mjs           # dry-run
 *   node scripts/qa/cleanup-legacy-screenshots.mjs --apply
 */
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { resolveRepoRoot } from './screenshot-output.mjs'

const repoRoot = resolveRepoRoot(import.meta.url)
const apply = process.argv.includes('--apply')

/** Paths relative to repo root — pre-unification artifact roots. */
const LEGACY_DIRS = [
  'screenshots',
  'apps/music/.qa-screenshots',
  'apps/home/screenshots',
  'apps/planner/tests/screenshots',
  'apps/planner/docs/ui-qa-screenshots',
  'apps/finance/docs/ui-qa-screenshots',
  'apps/fitness/screenshots',
  'apps/music/docs/ui-qa-screenshots',
]

/** Flat / dated dirs under canonical root before app/suite/latest layout. */
const LEGACY_QA_DIRS = [
  'docs/ui-qa-screenshots/p2-theme-merge-gate-2026-07-08',
  'docs/ui-qa-screenshots/portal',
]

/** @type {string[]} */
const targets = []

for (const rel of [...LEGACY_DIRS, ...LEGACY_QA_DIRS]) {
  const abs = join(repoRoot, rel)
  if (existsSync(abs)) targets.push(rel)
}

console.log(
  apply ? 'Removing legacy screenshot dirs:' : 'Would remove (dry-run):',
)
if (targets.length === 0) {
  console.log('  (none found)')
} else {
  for (const rel of targets.sort()) {
    console.log(`  ${rel}`)
    if (apply) rmSync(join(repoRoot, rel), { recursive: true, force: true })
  }
}
if (!apply && targets.length) {
  console.log('\nRe-run with --apply to delete.')
}
