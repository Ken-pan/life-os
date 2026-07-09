#!/usr/bin/env node
/**
 * Prune dated QA screenshot runs — keep `latest` and recent archives.
 *
 * Usage:
 *   node scripts/qa/prune-screenshots.mjs              # dry-run, keep 7 days
 *   node scripts/qa/prune-screenshots.mjs --apply      # delete
 *   node scripts/qa/prune-screenshots.mjs --days=14 --apply
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { resolveRepoRoot } from './screenshot-output.mjs'

const repoRoot = resolveRepoRoot(import.meta.url)
const qaRoot = join(repoRoot, 'docs', 'ui-qa-screenshots')
const apply = process.argv.includes('--apply')
const daysArg = process.argv.find((a) => a.startsWith('--days='))
const keepDays = daysArg ? Number(daysArg.split('=')[1]) : 7
const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000

/** @type {string[]} */
const removed = []

if (existsSync(qaRoot)) {
  for (const app of readdirSync(qaRoot, { withFileTypes: true })) {
    if (!app.isDirectory()) continue
    const appPath = join(qaRoot, app.name)
    for (const suite of readdirSync(appPath, { withFileTypes: true })) {
      if (!suite.isDirectory()) continue
      const suitePath = join(appPath, suite.name)
      for (const run of readdirSync(suitePath, { withFileTypes: true })) {
        if (!run.isDirectory() || run.name === 'latest') continue
        const runPath = join(suitePath, run.name)
        if (statSync(runPath).mtimeMs >= cutoff) continue
        removed.push(runPath.replace(`${repoRoot}/`, ''))
        if (apply) rmSync(runPath, { recursive: true, force: true })
      }
    }
  }
}

console.log(apply ? 'Pruned:' : 'Would prune (dry-run):')
if (removed.length === 0) {
  console.log(`  (nothing older than ${keepDays} days besides latest/)`)
} else {
  for (const p of removed.sort()) console.log(`  ${p}`)
}
if (!apply && removed.length) {
  console.log('\nRe-run with --apply to delete.')
}
