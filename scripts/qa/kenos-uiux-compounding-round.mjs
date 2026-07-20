#!/usr/bin/env node
/**
 * Kenos UIUX compounding round harness — thin wrapper over uiux-review.
 * Writes index + copies contact sheets into output/uiux/kenos-compounding-YYYY-MM-DD/
 * (gitignored via output/). Does not invent a second screenshot system.
 *
 * Usage:
 *   node scripts/qa/kenos-uiux-compounding-round.mjs --round 00-baseline --app aios --theme light
 *   node scripts/qa/kenos-uiux-compounding-round.mjs --round 03-space-switcher --app aios --mobile
 */
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const dateStamp = '2026-07-20'
const outRoot = join(root, 'output/uiux', `kenos-compounding-${dateStamp}`)

function argValue(flag, fallback = '') {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const round = argValue('--round', '00-baseline')
const app = argValue('--app', 'aios')
const theme = process.argv.includes('--theme')
  ? argValue('--theme', 'light')
  : 'light'
const mobile = process.argv.includes('--mobile')

const roundDir = join(outRoot, `round-${round}`)
const afterDir = join(roundDir, 'after')
mkdirSync(afterDir, { recursive: true })
mkdirSync(join(roundDir, 'before'), { recursive: true })
mkdirSync(join(roundDir, 'diff'), { recursive: true })

const reviewArgs = ['scripts/qa/uiux-review.mjs', '--app', app, '--theme', theme]
if (mobile) reviewArgs.push('--mobile')

console.log(`[kenos-uiux] round=${round} app=${app} theme=${theme} mobile=${mobile}`)
const run = spawnSync(process.execPath, reviewArgs, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})
if (run.status !== 0) {
  process.exit(run.status ?? 1)
}

const shotDir = join(
  root,
  'docs/ui-qa-screenshots',
  app,
  'uiux-review',
  'latest',
)
const viewport = mobile ? 'mobile' : 'desktop'
const contactName = `${app}-uiux-review-${theme}-${viewport}.png`
const contactPath = join(shotDir, contactName)

if (existsSync(contactPath)) {
  const dest = join(afterDir, contactName)
  copyFileSync(contactPath, dest)
  copyFileSync(contactPath, join(roundDir, 'contact-sheet-after.png'))
  console.log(`[kenos-uiux] copied ${contactName} → ${dest}`)
} else {
  console.warn(`[kenos-uiux] missing contact sheet: ${contactPath}`)
}

const sha = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).stdout.trim()

const index = {
  round,
  app,
  theme,
  viewport,
  sha,
  generatedAt: new Date().toISOString(),
  contactSheet: existsSync(join(roundDir, 'contact-sheet-after.png'))
    ? 'contact-sheet-after.png'
    : null,
  shotDirRelative: `docs/ui-qa-screenshots/${app}/uiux-review/latest`,
  files: existsSync(shotDir) ? readdirSync(shotDir) : [],
}

writeFileSync(join(roundDir, 'manifest.json'), JSON.stringify(index, null, 2))
writeFileSync(
  join(roundDir, 'test-results.md'),
  `# Round ${round} test-results\n\n- uiux-review exit: ${run.status}\n- sha: \`${sha}\`\n`,
)

console.log(`[kenos-uiux] wrote ${join(roundDir, 'manifest.json')}`)
