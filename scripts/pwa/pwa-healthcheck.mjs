#!/usr/bin/env node
/**
 * PWA debug preflight — all Life OS apps.
 * Usage: npm run pwa:healthcheck
 *        PWA_APP=fitness npm run pwa:healthcheck
 */
import { spawnSync } from 'node:child_process'
import { accessSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getAppList, appBaseUrl, resolveAppFilter } from './apps.config.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** @type {{ id: string, ok: boolean, detail: string }[]} */
const results = []

function record(id, ok, detail) {
  results.push({ id, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${id}: ${detail}`)
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout || r.stderr || '').trim() }
}

const xcode = run('xcode-select', ['-p'])
record('xcode-cli', xcode.ok, xcode.ok ? xcode.out : 'Xcode CLI not found')

const pw = run('npx', ['playwright', '--version'])
record('playwright', pw.ok, pw.ok ? pw.out : 'run npm install at repo root')

try {
  accessSync(join(root, 'packages/theme/src/ios-safari.css'))
  record('theme-ios-safari', true, 'packages/theme/src/ios-safari.css')
} catch {
  record('theme-ios-safari', false, 'missing ios-safari.css')
}

try {
  accessSync(join(root, 'packages/theme/src/scroll-shell.css'))
  record('theme-scroll-shell', true, 'packages/theme/src/scroll-shell.css')
} catch {
  record('theme-scroll-shell', false, 'missing scroll-shell.css')
}

try {
  accessSync(join(root, 'packages/theme/src/shell.js'))
  record('theme-shell-js', true, 'packages/theme/src/shell.js')
} catch {
  record('theme-shell-js', false, 'missing shell.js')
}

const apps = resolveAppFilter(process.env.PWA_APP)

console.log('\n── Preview servers ──')
for (const app of apps) {
  const base = appBaseUrl(app)
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(2500) })
    record(
      `preview:${app.id}`,
      res.ok,
      `${base} (${app.workspace}:${app.port})`,
    )
  } catch {
    record(
      `preview:${app.id}`,
      false,
      `${base} down — npm run pwa:preview:${app.id}`,
    )
  }
}

console.log('\n── Shell reference ──')
for (const app of getAppList()) {
  console.log(
    `  ${app.id.padEnd(8)} ${app.shellType.padEnd(18)} port ${app.port}`,
  )
}

console.log('\n── Commands ──')
console.log('  npm run pwa:build')
console.log('  npm run test:pwa                    # all apps')
console.log('  PWA_APP=fitness npm run test:pwa    # one app')
console.log('  npm run qa:mobile-scroll            # production apps scroll QA')
console.log('  npm run pwa:sim:open -- fitness /discover')
console.log('  node scripts/pwa/collect-viewport-metrics.mjs')

const failed = results.filter((r) => !r.ok)
const previewDown = failed.some((f) => f.id.startsWith('preview:'))
process.exit(previewDown && process.env.PWA_HEALTHCHECK_STRICT === '1' ? 1 : 0)
