#!/usr/bin/env node
/**
 * Ticket naming v2 (APP3) drift guard.
 * SSOT: docs/roadmap/TICKET_NAMING.md
 *
 * Usage: node scripts/verify-ticket-naming.mjs
 * Exit 0 = pass; 1 = actionable drift found.
 */
import { readFileSync, existsSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)))
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.svelte-kit',
  '.netlify',
  'output',
  '__pycache__',
  '.claude',
])
const EXTS = new Set(['.md', '.mdc', '.js', '.mjs', '.ts', '.svelte'])
const ALLOW_FILES = new Set([
  'docs/roadmap/TICKET_NAMING.md',
  'scripts/verify-ticket-naming.mjs',
])

const HUB_FILES = [
  'docs/LIFEOS_ROADMAP.md',
  'docs/roadmap/AGENT_WORKSTREAMS.md',
  'docs/roadmap/apps/README.md',
  // PaperOS hub/QA docs moved to the standalone paperos repo (2026-07-12)
]

const LINK_CHECK_FILES = [
  'docs/LIFEOS_ROADMAP.md',
  'docs/roadmap/apps/README.md',
  'docs/roadmap/apps/fitness.md',
  'docs/roadmap/apps/finance.md',
  'docs/qa/README.md',
  'docs/roadmap/TICKET_NAMING.md',
]

const DEPRECATED_V2_RE =
  /\b(?:PLNR\.MOVE|PLNR\.PPOS|PPOS|FITN(?:\.[A-Z0-9]+)*)\b/
const ACTIVE_APP3 = [
  'PAPR',
  'PLNR',
  'FINC',
  'GYMS',
  'MUSC',
  'PORT',
  'HOME',
  'INTG',
]
const NON_CANONICAL_UI_RE = /\bPAPR\.UI Slice\b/
const LEGACY_RE =
  /\b(?:P-MOVE-BLOCK|P-MOVE-(?!SYS)[0-9]|P-P[0-9]|F-P[0-9]|FT-P[0-9]|M-P[0-9]|H-P[0-9]|G-P[0-9]|QA-P[0-9]|(?<![A-Z])F-0\b)/
const WRONG_FITNESS_RE = /GYMS\.SUB\.5-(substitution|ui-closure)\.md/
const LEGACY_SELF_RE = /legacy → `PLNR\.|legacy PLNR\./
const HUB_DUP_RE = /\*\*(PLNR\.[A-Z0-9.]+)\*\* \| `(PLNR\.[A-Z0-9.]+)`/
const LINK_RE = /\]\(([^)#]+)(?:#[^)]*)?\)/g

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walk(abs, out)
    else if (EXTS.has(abs.slice(abs.lastIndexOf('.')))) out.push(abs)
  }
  return out
}

function rel(p) {
  return relative(ROOT, p).replace(/\\/g, '/')
}

function isIntentionalLegacyLine(line, fileRel) {
  if (/Legacy|legacy/.test(line)) return true
  if (fileRel.endsWith('migrate.test.js') && line.includes('P-MOVE-3'))
    return true
  if (fileRel.includes('PRO_MOVE_P_MOVE_BLOCK_GATE')) return true
  if (fileRel.includes('archive/')) return true
  if (/FT-P5/.test(line) && /\.md/.test(line)) return true
  if (/`P-[A-Z*]/.test(line) && /[·|]/.test(line)) return true
  if (/`F-P[0-9]`/.test(line) && /\|/.test(line)) return true
  if (/`FT-P[0-9]`/.test(line) && /\|/.test(line)) return true
  if (/`G-P/.test(line) && /\|/.test(line)) return true
  if (/`M-P/.test(line) && /\|/.test(line)) return true
  if (/`H-P/.test(line) && /\|/.test(line)) return true
  if (/勿在新 ticket|原 `/.test(line)) return true
  if (/~~.*FITN|FITN\.\*|\/ FITN /.test(line)) return true
  if (/H-P8/.test(line) && /HOME\.SPATIAL/.test(line)) return true
  return false
}

function checkLegacyLeaks(files) {
  const issues = []
  for (const abs of files) {
    const fileRel = rel(abs)
    if (ALLOW_FILES.has(fileRel)) continue
    const lines = readFileSync(abs, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (isIntentionalLegacyLine(line, fileRel)) continue
      if (DEPRECATED_V2_RE.test(line)) {
        issues.push({
          kind: 'deprecated-plnr-move',
          file: fileRel,
          line: i + 1,
          text: line.trim(),
        })
        continue
      }
      if (NON_CANONICAL_UI_RE.test(line)) {
        issues.push({
          kind: 'non-canonical-ui-id',
          file: fileRel,
          line: i + 1,
          text: line.trim(),
        })
        continue
      }
      if (WRONG_FITNESS_RE.test(line)) {
        issues.push({
          kind: 'wrong-fitness-filename',
          file: fileRel,
          line: i + 1,
          text: line.trim(),
        })
        continue
      }
      if (LEGACY_SELF_RE.test(line)) {
        issues.push({
          kind: 'legacy-self-dup',
          file: fileRel,
          line: i + 1,
          text: line.trim(),
        })
        continue
      }
      const m = LEGACY_RE.exec(line)
      if (m)
        issues.push({
          kind: 'legacy-leak',
          file: fileRel,
          line: i + 1,
          match: m[0],
          text: line.trim(),
        })
    }
  }
  return issues
}

function checkHubDup() {
  const issues = []
  for (const fileRel of [
    'docs/roadmap/apps/README.md',
  ]) {
    const lines = readFileSync(join(ROOT, fileRel), 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = HUB_DUP_RE.exec(lines[i])
      if (m && m[1] === m[2]) {
        issues.push({
          kind: 'hub-legacy-self-dup',
          file: fileRel,
          line: i + 1,
          text: lines[i].trim(),
        })
      }
    }
  }
  return issues
}

function checkLinks() {
  const issues = []
  for (const fileRel of LINK_CHECK_FILES) {
    const abs = join(ROOT, fileRel)
    if (!existsSync(abs)) continue
    const dir = join(abs, '..')
    const text = readFileSync(abs, 'utf8')
    let m
    while ((m = LINK_RE.exec(text)) !== null) {
      const target = m[1]
      if (target.startsWith('http')) continue
      const resolved = join(dir, target)
      if (!existsSync(resolved)) {
        issues.push({ kind: 'broken-link', file: fileRel, target })
      }
    }
  }
  return issues
}

function checkApp3PrefixCollisions() {
  const issues = []
  const byPrefix = new Map()
  for (const code of ACTIVE_APP3) {
    const p2 = code.slice(0, 2)
    if (byPrefix.has(p2)) {
      issues.push({
        kind: 'app3-prefix-collision',
        prefix: p2,
        codes: [byPrefix.get(p2), code],
      })
    } else byPrefix.set(p2, code)
  }
  return issues
}

function checkActiveHubStrict() {
  const issues = []
  for (const fileRel of HUB_FILES) {
    const lines = readFileSync(join(ROOT, fileRel), 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (isIntentionalLegacyLine(line, fileRel)) continue
      if (DEPRECATED_V2_RE.test(line)) {
        issues.push({
          kind: 'deprecated-v2-prefix',
          file: fileRel,
          line: i + 1,
          text: line.trim(),
        })
        continue
      }
      if (/FT-P5/.test(line)) continue
      const m = LEGACY_RE.exec(line)
      if (m)
        issues.push({
          kind: 'active-hub-legacy',
          file: fileRel,
          line: i + 1,
          match: m[0],
          text: line.trim(),
        })
    }
  }
  return issues
}

const files = walk(ROOT)
const all = [
  ...checkLegacyLeaks(files),
  ...checkHubDup(),
  ...checkLinks(),
  ...checkApp3PrefixCollisions(),
  ...checkActiveHubStrict(),
]

if (all.length === 0) {
  console.log('verify:ticket-naming — PASS (0 issues)')
  process.exit(0)
}

console.error(`verify:ticket-naming — FAIL (${all.length} issue(s))`)
for (const issue of all.slice(0, 40)) {
  console.error(JSON.stringify(issue))
}
if (all.length > 40) console.error(`... +${all.length - 40} more`)
process.exit(1)
