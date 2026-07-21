#!/usr/bin/env node
/**
 * Bundle platform-web Health readiness (State Engine + stripper) for Kenos iOS
 * JavaScriptCore — used to inject privacy-safe `__KENOS_HEALTH_READINESS__` into
 * the Kenos shell without exposing raw HealthKit days.
 *
 * Usage: node scripts/bundle-kenos-health-readiness-native.mjs
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(root, 'packages/platform-web/src/kenosHealthReadiness.js')
const out = join(
  root,
  'clients/apple/Apps/iOS/Sources/Health/Resources/kenosHealthReadiness.native.js',
)

const r = spawnSync(
  'npx',
  [
    '--yes',
    'esbuild',
    entry,
    '--bundle',
    '--format=iife',
    '--global-name=KenosHealthReadiness',
    '--platform=neutral',
    `--outfile=${out}`,
  ],
  { cwd: root, encoding: 'utf8' },
)
if (r.status !== 0) {
  process.stderr.write(r.stderr || r.stdout || 'esbuild failed\n')
  process.exit(r.status ?? 1)
}

const banner = `/* GENERATED — do not edit.
 * Source: packages/platform-web/src/kenosHealthReadiness.js (+ state engine)
 * Regenerate: node scripts/bundle-kenos-health-readiness-native.mjs
 */
`
const body = readFileSync(out, 'utf8')
if (!body.startsWith('/* GENERATED')) {
  writeFileSync(out, banner + body)
}
console.log(`wrote ${out}`)
