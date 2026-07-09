/**
 * Canonical QA screenshot output for Life OS monorepo.
 *
 * Ephemeral UI evidence (gitignored). Committed Playwright baselines stay under
 * tests/visual/*-snapshots/.
 *
 * Layout:
 *   docs/ui-qa-screenshots/{app}/{suite}/{runId}/
 *   runId defaults to "latest"; set QA_RUN_ID for dated archives.
 *
 * @example
 * import { resolveScreenshotDir, writeManifest } from '../../../scripts/qa/screenshot-output.mjs'
 * const { dir } = resolveScreenshotDir({ app: 'planner', suite: 'buttons', importMetaUrl: import.meta.url })
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const QA_SEGMENTS = ['docs', 'ui-qa-screenshots']

/** @param {string | URL} fromImportMetaUrl */
export function resolveRepoRoot(fromImportMetaUrl) {
  if (process.env.LIFE_OS_REPO_ROOT) {
    return resolve(process.env.LIFE_OS_REPO_ROOT)
  }
  let dir = dirname(fileURLToPath(fromImportMetaUrl))
  for (let i = 0; i < 10; i++) {
    if (
      existsSync(join(dir, 'package.json')) &&
      existsSync(join(dir, 'turbo.json'))
    ) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(
    `Could not resolve Life OS repo root from ${String(fromImportMetaUrl)}`,
  )
}

/** @param {Date} [date] */
export function formatRunId(date = new Date()) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

/**
 * @param {{
 *   app: string
 *   suite: string
 *   importMetaUrl: string | URL
 *   runId?: string
 * }} opts
 */
export function resolveScreenshotDir(opts) {
  const repoRoot = resolveRepoRoot(opts.importMetaUrl)
  const runId = opts.runId ?? process.env.QA_RUN_ID ?? 'latest'
  const dir = join(repoRoot, ...QA_SEGMENTS, opts.app, opts.suite, runId)
  mkdirSync(dir, { recursive: true })
  return { dir, repoRoot, runId, app: opts.app, suite: opts.suite }
}

/** Relative path from repo root (for docs links). */
export function screenshotDirRel({
  app,
  suite,
  runId = process.env.QA_RUN_ID ?? 'latest',
}) {
  return join(...QA_SEGMENTS, app, suite, runId)
}

/**
 * Copy a dated run into `{app}/{suite}/latest/` for stable doc links.
 * @param {string} runDir absolute path returned by resolveScreenshotDir
 * @param {string | URL} importMetaUrl
 */
export function syncToLatest(runDir, importMetaUrl) {
  const normalized = runDir.replace(/\\/g, '/')
  if (normalized.endsWith('/latest')) return runDir

  const latestDir = join(dirname(runDir), 'latest')
  if (existsSync(latestDir)) rmSync(latestDir, { recursive: true, force: true })
  cpSync(runDir, latestDir, { recursive: true })
  return latestDir
}

/** @param {string} dir @param {Record<string, unknown>} data */
export function writeManifest(dir, data) {
  writeFileSync(
    join(dir, 'manifest.json'),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), ...data }, null, 2)}\n`,
  )
}
