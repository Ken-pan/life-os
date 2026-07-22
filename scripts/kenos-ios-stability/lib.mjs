/**
 * Shared helpers for Kenos iOS Daily Beta stability harness.
 * Never logs JWT, secrets, full emails, serials, or user payloads.
 */
import { spawnSync, execSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(__dirname, '../..')
export const EVID = join(
  ROOT,
  'docs/qa/evidence/kenos-ios-stability-2026-07-21',
)
export const DEVICE =
  process.env.KENOS_IOS_DEVICE || '8097F071-CAB6-5AF0-8258-BCD985E9D79E'
export const BUNDLE = 'space.kenos.app.ios'
export const FORMAL_BASELINE =
  '502d805c28b29d3d50c0efa2699ab717a301ac45'

export const PORTS = {
  aios: 5219,
  planner: 5188,
  fitness: 5190,
  finance: 5180,
  knowledge: 5879,
  music: 5189,
  home: 5196,
  health: 5192,
}

export const DOMAINS = [
  'work',
  'money',
  'library',
  'music',
  'home',
  'health',
  'paper',
]

export function ensureDirs() {
  for (const p of [
    EVID,
    join(EVID, 'logs'),
    join(EVID, 'smoke'),
    join(EVID, 'runs'),
    join(EVID, 'screenshots'),
  ]) {
    mkdirSync(p, { recursive: true })
  }
}

export function sh(cmd, args = [], opts = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    ...opts,
  })
}

export function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function nowIso() {
  return new Date().toISOString()
}

export function gitSha(full = true) {
  const a = full ? 'HEAD' : '--short'
  return sh('git', ['-C', ROOT, 'rev-parse', a]).stdout.trim()
}

export function lanIp() {
  return (
    process.env.KENOS_LAN_IP ||
    sh('ipconfig', ['getifaddr', 'en0']).stdout.trim() ||
    sh('ipconfig', ['getifaddr', 'en1']).stdout.trim() ||
    ''
  )
}

export function localHostName() {
  return (
    sh('scutil', ['--get', 'LocalHostName']).stdout.trim() ||
    sh('hostname', ['-s']).stdout.trim() ||
    ''
  )
}

export function originBase() {
  const fromEnv = process.env.KENOS_DAILY_BETA_ORIGIN
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const file = join(process.env.HOME || '', '.kenos-daily-beta/lan-origin.txt')
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8').trim().replace(/\/$/, '')
    // Prefer file when it is already a hostname (.local); skip sticky DHCP IP.
    try {
      const host = new URL(raw).hostname
      if (host && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) return raw
    } catch {
      /* fall through */
    }
  }
  const mdns = localHostName()
  if (mdns) return `http://${mdns}.local:5219`
  const ip = lanIp()
  return ip ? `http://${ip}:5219` : ''
}

export function originIsStableHostname(url = originBase()) {
  try {
    const host = new URL(url).hostname
    // mDNS (.local) or Tailscale MagicDNS (.ts.net) — both survive DHCP churn;
    // ts.net additionally works off-LAN. Raw IPs remain unstable.
    return (
      (host.endsWith('.local') || host.endsWith('.ts.net')) &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(host)
    )
  } catch {
    return false
  }
}

export function maskUid(uid) {
  if (!uid || typeof uid !== 'string') return null
  if (uid.length < 12) return 'uid_***'
  return `${uid.slice(0, 8)}…${uid.slice(-4)}`
}

export function maskEmail(email) {
  if (!email || typeof email !== 'string') return null
  const [u, d] = email.split('@')
  if (!d) return '***'
  return `${(u || '').slice(0, 2)}***@${d}`
}

export function readBuildMeta() {
  const home = process.env.HOME || ''
  const shaFile = join(home, '.kenos-daily-beta/ios-build-sha.txt')
  const numFile = join(home, '.kenos-daily-beta/ios-build-number.txt')
  const releaseLink = join(home, '.kenos-daily-beta/current')
  let releaseSha = null
  try {
    const meta = join(releaseLink, 'release.json')
    if (existsSync(meta)) {
      releaseSha = JSON.parse(readFileSync(meta, 'utf8')).sha || null
    }
  } catch {
    /* ignore */
  }
  return {
    iosBuildSha: existsSync(shaFile)
      ? readFileSync(shaFile, 'utf8').trim()
      : null,
    iosBuildNumber: existsSync(numFile)
      ? readFileSync(numFile, 'utf8').trim()
      : null,
    releaseSha,
    releaseShort: releaseSha ? releaseSha.slice(0, 9) : null,
  }
}

export function classifyLaunch(stdout, stderr, status) {
  const blob = `${stdout || ''}${stderr || ''}`
  if (/Locked/i.test(blob))
    return { ok: false, class: 'environment', reason: 'device_locked' }
  if (
    /unable to locate a device|CoreDeviceError|could not be established|invalidated|process identifier of the launched application could not be determined|may have already terminated/i.test(
      blob,
    )
  )
    return { ok: false, class: 'device', reason: 'device_unreachable' }
  if (status !== 0)
    return { ok: false, class: 'environment', reason: 'launch_failed' }
  return { ok: true, class: 'product', reason: 'launched' }
}

export function launchApp(
  payloadUrl,
  { terminate = true, retries = 4, delayMs = 2000 } = {},
) {
  let last = null
  const t0 = Date.now()
  for (let i = 1; i <= retries; i++) {
    const args = [
      'devicectl',
      'device',
      'process',
      'launch',
      '--device',
      DEVICE,
    ]
    if (terminate) args.push('--terminate-existing')
    if (payloadUrl) {
      args.push('--payload-url', payloadUrl)
    }
    args.push(BUNDLE)
    const r = sh('xcrun', args)
    const classified = classifyLaunch(r.stdout, r.stderr, r.status)
    last = {
      ...classified,
      ms: Date.now() - t0,
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      attempts: i,
    }
    if (classified.ok) return last
    // Retry transient device/environment only — not product failures.
    if (!['device', 'environment'].includes(classified.class)) return last
    if (classified.reason === 'device_locked' && i < retries) {
      sleep(delayMs)
      continue
    }
    if (
      ['device_unreachable', 'launch_failed'].includes(classified.reason) &&
      i < retries
    ) {
      sleep(delayMs)
      continue
    }
    return last
  }
  return last
}

export function terminateApp() {
  // Best-effort: relaunch with terminate flag without caring about payload
  return launchApp(null, { terminate: true })
}

export function probeUrl(label, url, { expectOk = true } = {}) {
  const t0 = Date.now()
  const r = sh('curl', [
    '-sf',
    '--max-time',
    '3',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    url,
  ])
  const ms = Date.now() - t0
  const code = (r.stdout || '').trim()
  const ok = r.status === 0 && /^2\d\d$/.test(code)
  return {
    label,
    host: safeHost(url),
    ok,
    expectOk,
    httpCode: code || null,
    ms,
    class: ok ? 'backend' : 'network',
  }
}

function safeHost(url) {
  try {
    return new URL(url).host
  } catch {
    return 'invalid'
  }
}

export function deviceOnline() {
  const r = sh('xcrun', ['devicectl', 'list', 'devices'])
  const line = (r.stdout || '')
    .split('\n')
    .find((l) => l.includes(DEVICE))
  if (!line) return { ok: false, class: 'device', reason: 'not_listed' }
  if (/available \(paired\)|connected/i.test(line))
    return { ok: true, class: 'device', reason: 'online', line: line.trim() }
  return { ok: false, class: 'device', reason: 'offline', line: line.trim() }
}

export function installedAppInfo() {
  const out = join(EVID, 'logs', 'doctor-apps.json')
  const r = sh('xcrun', [
    'devicectl',
    'device',
    'info',
    'apps',
    '--device',
    DEVICE,
    '--json-output',
    out,
  ])
  if (r.status !== 0 || !existsSync(out)) {
    return { ok: false, class: 'device', reason: 'apps_query_failed' }
  }
  const d = JSON.parse(readFileSync(out, 'utf8'))
  let found = null
  function walk(o) {
    if (!o || found) return
    if (typeof o === 'object' && !Array.isArray(o)) {
      if (o.bundleIdentifier === BUNDLE) {
        found = {
          version: o.version || null,
          bundleVersion: o.bundleVersion || null,
          name: o.name || null,
        }
        return
      }
      for (const v of Object.values(o)) walk(v)
    } else if (Array.isArray(o)) {
      for (const v of o) walk(v)
    }
  }
  walk(d)
  if (!found) return { ok: false, class: 'product', reason: 'not_installed' }
  return { ok: true, class: 'product', reason: 'installed', ...found }
}

export function kenosCtl(cmd) {
  const script = join(ROOT, 'scripts/kenos-daily-beta/kenos-ctl.sh')
  return sh('bash', [script, cmd], {
    env: { ...process.env, KENOS_STATIC_BIND: '0.0.0.0' },
  })
}

export function appendEvent(type, data = {}) {
  ensureDirs()
  const row = { ts: nowIso(), type, ...data }
  appendFileSync(join(EVID, 'dogfood-events.jsonl'), JSON.stringify(row) + '\n')
  return row
}

export function writeJson(rel, obj) {
  ensureDirs()
  const p = join(EVID, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n')
  return p
}

export function writeMd(rel, text) {
  ensureDirs()
  const p = join(EVID, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, text.endsWith('\n') ? text : text + '\n')
  return p
}

export function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export function stats(msList) {
  const sorted = [...msList].filter((n) => typeof n === 'number').sort((a, b) => a - b)
  if (!sorted.length) {
    return { count: 0, median: null, p50: null, p95: null, min: null, max: null }
  }
  return {
    count: sorted.length,
    median: percentile(sorted, 50),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

export function hashId(s) {
  return createHash('sha1').update(String(s)).digest('hex').slice(0, 12)
}

export function macInfo() {
  const model = sh('sysctl', ['-n', 'hw.model']).stdout.trim()
  const ver = sh('sw_vers', ['-productVersion']).stdout.trim()
  const build = sh('sw_vers', ['-buildVersion']).stdout.trim()
  return { model, macos: ver, build, arch: process.arch }
}

export function localAppPlist() {
  const app = join(
    ROOT,
    'clients/apple/Apps/build-device/Build/Products/Debug-iphoneos/KenosIOS.app/Info.plist',
  )
  if (!existsSync(app)) return null
  const get = (key) =>
    sh('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, app]).stdout.trim() ||
    null
  return {
    path: app,
    bundleId: get('CFBundleIdentifier'),
    version: get('CFBundleShortVersionString'),
    build: get('CFBundleVersion'),
    origin: get('KENOS_DAILY_BETA_ORIGIN'),
  }
}

export function rollbackTargetExists() {
  const prev = join(process.env.HOME || '', '.kenos-daily-beta/previous')
  return existsSync(prev)
}

export function domainLaunchUrl(domainId, base) {
  const map = {
    work: `${base}/spaces/work?iosNativeShell=1`,
    money: `${base}/?iosNativeShell=1&openDomain=money`,
    library: `${base}/?iosNativeShell=1&openDomain=library`,
    music: `${base}/?iosNativeShell=1&openDomain=music`,
    home: `${base}/?iosNativeShell=1&openDomain=home`,
    health: `${base}/?iosNativeShell=1&openDomain=health`,
    paper: `${base}/?iosNativeShell=1&openDomain=paper`,
  }
  return map[domainId] || `${base}/?iosNativeShell=1`
}

export function assertNoSecrets(text) {
  const bad = [
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, // JWT-ish
    /service_role/i,
    /sb_secret_/i,
  ]
  for (const re of bad) {
    if (re.test(text)) throw new Error('secret-like content blocked from evidence write')
  }
}
