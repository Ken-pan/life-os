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
 * Filename (see formatShotFilename):
 *   [{seq}-]{viewport}-]{surface}[-{state}].png
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
 * Normalize a path/filename segment to kebab-case.
 * @param {string} input
 */
export function slugify(input) {
  return String(input)
    .trim()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Standard screenshot filename.
 *
 * Examples:
 *   formatShotFilename({ viewport: 'mobile', surface: 'today' })
 *     → mobile-today.png
 *   formatShotFilename({ seq: 1, surface: 'inbox' })
 *     → 01-inbox.png
 *   formatShotFilename({ viewport: 'desktop', surface: 'command-palette', state: 'filter' })
 *     → desktop-command-palette-filter.png
 *
 * @param {{
 *   seq?: number | string
 *   viewport?: string
 *   surface: string
 *   state?: string
 *   ext?: string
 * }} opts
 */
export function formatShotFilename(opts) {
  const parts = []
  if (opts.seq != null && opts.seq !== '') {
    parts.push(String(opts.seq).padStart(2, '0'))
  }
  if (opts.viewport) parts.push(slugify(opts.viewport))
  parts.push(slugify(opts.surface))
  if (opts.state) parts.push(slugify(opts.state))
  const ext = opts.ext ?? 'png'
  return `${parts.join('-')}.${ext}`
}

/**
 * Absolute path for a screenshot file under a run directory.
 * @param {string} dir
 * @param {Parameters<typeof formatShotFilename>[0]} opts
 */
export function resolveShotPath(dir, opts) {
  return join(dir, formatShotFilename(opts))
}

/**
 * Viewport subfolder helper: `{runDir}/{viewport}/{filename}.png`
 * @param {string} runDir
 * @param {string} viewport
 * @param {Omit<Parameters<typeof formatShotFilename>[0], 'viewport'>} opts
 */
export function resolveViewportShotPath(runDir, viewport, opts) {
  const sub = join(runDir, slugify(viewport))
  mkdirSync(sub, { recursive: true })
  return resolveShotPath(sub, { ...opts, viewport: undefined })
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
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        naming: 'kebab-case; optional seq + viewport + surface + state',
        ...data,
      },
      null,
      2,
    )}\n`,
  )
}

/** Report JSON alongside screenshots (non-manifest audits). */
export function writeReport(dir, basename, data) {
  writeFileSync(
    join(dir, `${slugify(basename)}.json`),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), ...data }, null, 2)}\n`,
  )
}
