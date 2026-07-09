/**
 * Xcode iOS Simulator — PWA core-route screenshots (all Life OS apps).
 *
 * Opens each preview URL with ?pwa_sim=1 (standalone layout in Safari) and saves
 * shots under docs/ui-qa-screenshots/{app}/pwa-simulator/latest/.
 *
 * Usage (repo root):
 *   node scripts/pwa/capture-sim-screenshots.mjs
 *   PWA_APP=fitness,music node scripts/pwa/capture-sim-screenshots.mjs
 *   PWA_BUILD=1 node scripts/pwa/capture-sim-screenshots.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAppList } from './apps.config.mjs'
import {
  resolveScreenshotDir,
  resolveShotPath,
  writeManifest,
} from '../qa/screenshot-output.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = join(__dirname, '../..')
const DEVICE = process.env.DEVICE || 'iPhone 17 Pro'
const HOST = process.env.HOST || 'localhost'
const SETTLE_MS = Number(process.env.PWA_SIM_SETTLE_MS || 5000)
const FILTER = process.env.PWA_APP?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/** @param {number} port */
function killPort(port) {
  spawnSync('bash', ['-c', `lsof -ti :${port} | xargs kill -9 2>/dev/null || true`], {
    stdio: 'ignore',
  })
}

/** @param {string} appId */
function buildMarker(appId) {
  const markers = {
    planner: 'apps/planner/build/index.html',
    fitness: 'apps/fitness/build/index.html',
    music: 'apps/music/build/index.html',
    finance: 'apps/finance/build/index.html',
    portal: 'apps/portal/build/manifest.webmanifest',
    home: 'apps/home/build/index.html',
  }
  return join(REPO_ROOT, markers[appId])
}

/** @param {string} appId */
function ensureBuild(appId) {
  const workspaces = {
    planner: 'planner-os',
    fitness: 'fitness-os',
    music: 'music-os',
    finance: 'finance-os',
    portal: 'portal',
    home: 'home-os',
  }
  const marker = buildMarker(appId)
  if (process.env.PWA_BUILD === '1' || !existsSync(marker)) {
    console.log(`Building ${workspaces[appId]}…`)
    const r = spawnSync('npm', ['run', 'build', '-w', workspaces[appId]], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    })
    if (r.status !== 0) throw new Error(`Build failed: ${appId}`)
  }
}

/** @param {import('./apps.config.mjs').PwaAppConfig} app @returns {Promise<import('child_process').ChildProcess>} */
function startPreview(app) {
  killPort(app.port)
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npm',
      [
        'run',
        'preview',
        '-w',
        app.workspace,
        '--',
        '--host',
        '127.0.0.1',
        '--port',
        String(app.port),
      ],
      {
        cwd: REPO_ROOT,
        stdio: 'ignore',
        detached: true,
      },
    )
    child.unref()
    waitForPort(app.port)
      .then(() => resolve(child))
      .catch(reject)
  })
}

/** @param {number} port @param {number} [ms] */
async function waitForPort(port, ms = 90_000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Preview not ready on :${port}`)
}

function bootSimulator() {
  spawnSync('xcode-select', ['-p'], { stdio: 'ignore' })
  spawnSync('open', ['-a', 'Simulator'], { stdio: 'ignore' })
  spawnSync('xcrun', ['simctl', 'boot', DEVICE], { stdio: 'ignore' })
}

/** @param {string} url */
function openUrl(url) {
  const r = spawnSync('xcrun', ['simctl', 'openurl', 'booted', url], {
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    throw new Error(`simctl openurl failed: ${r.stderr || r.stdout}`)
  }
}

/** @param {string} outPath */
function takeScreenshot(outPath) {
  const r = spawnSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', outPath], {
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    throw new Error(`simctl screenshot failed: ${r.stderr || r.stdout}`)
  }
}

/** @param {string} path @param {string} [query] */
function withQuery(path, query = 'pwa_sim=1') {
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}${query}`
}

async function main() {
  const apps = FILTER?.length
    ? getAppList({ testEnabledOnly: false, ids: FILTER })
    : getAppList({ testEnabledOnly: false })

  bootSimulator()

  /** @type {Record<string, unknown>} */
  const summary = { device: DEVICE, host: HOST, apps: {} }

  for (const app of apps) {
    ensureBuild(app.id)
    const { dir } = resolveScreenshotDir({
      app: app.id,
      suite: 'pwa-simulator',
      importMetaUrl: import.meta.url,
    })

    console.log(`\n── ${app.id} (${app.port}) → ${dir}`)
    const child = await startPreview(app)

    /** @type {{ seq: number, route: string, path: string, file: string, url: string }[]} */
    const shots = []

    for (let i = 0; i < app.routes.length; i++) {
      const route = app.routes[i]
      const url = `http://${HOST}:${app.port}${withQuery(route.path)}`
      const outPath = resolveShotPath(dir, {
        seq: i + 1,
        viewport: 'mobile',
        surface: route.name,
        state: 'pwa-sim',
      })

      console.log(`  ${route.name}: ${url}`)
      openUrl(url)
      await new Promise((r) => setTimeout(r, SETTLE_MS))
      takeScreenshot(outPath)
      shots.push({
        seq: i + 1,
        route: route.name,
        path: route.path,
        file: outPath.split('/').pop(),
        url,
      })
      console.log(`  ✓ ${outPath.split('/').slice(-1)[0]}`)
    }

    writeManifest(dir, {
      app: app.id,
      port: app.port,
      device: DEVICE,
      mode: 'pwa-sim (?pwa_sim=1 standalone layout in iOS Simulator Safari)',
      shots,
    })

    summary.apps[app.id] = { dir, count: shots.length, shots }
    killPort(app.port)
    if (child.pid) {
      try {
        process.kill(child.pid, 'SIGTERM')
      } catch {
        /* already exited */
      }
    }
  }

  const reportPath = join(
    REPO_ROOT,
    'docs/ui-qa-screenshots/pwa/simulator/latest/pwa-sim-run.json',
  )
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(join(REPO_ROOT, 'docs/ui-qa-screenshots/pwa/simulator/latest'), {
    recursive: true,
  })
  writeFileSync(
    reportPath,
    `${JSON.stringify({ capturedAt: new Date().toISOString(), ...summary }, null, 2)}\n`,
  )
  console.log(`\nDone. Summary: ${reportPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
