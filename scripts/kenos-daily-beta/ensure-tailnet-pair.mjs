#!/usr/bin/env node
/**
 * Ensure Mac Tailscale is up and record the Mac↔iPhone device trust pair.
 *
 * Trust model: 2-node personal Tailnet — phone reaches Mac only via Tailscale
 * identity (MagicDNS / 100.x). LocalAI stays on 127.0.0.1; Daily Beta proxies
 * it at /__localai on the shell origin.
 *
 * Usage:
 *   node scripts/kenos-daily-beta/ensure-tailnet-pair.mjs
 *   node scripts/kenos-daily-beta/ensure-tailnet-pair.mjs --json
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const STATE_DIR = process.env.KENOS_DAILY_BETA_HOME || join(homedir(), '.kenos-daily-beta')
const TRUST_PATH = join(STATE_DIR, 'device-trust.json')
const ORIGIN_PATH = join(STATE_DIR, 'lan-origin.txt')
const WANT_JSON = process.argv.includes('--json')
const SHELL_PORT = Number(process.env.KENOS_AIOS_PORT || 5219)

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    ...opts,
  })
}

function die(msg) {
  if (WANT_JSON) {
    console.log(JSON.stringify({ ok: false, error: msg }))
  } else {
    console.error(`ERROR: ${msg}`)
  }
  process.exit(1)
}

function tailscaleBin() {
  const which = run('bash', ['-lc', 'command -v tailscale || true'])
  const p = (which.stdout || '').trim()
  if (p) return p
  for (const candidate of [
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    '/usr/local/bin/tailscale',
    '/opt/homebrew/bin/tailscale',
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function statusJson(bin) {
  const r = run(bin, ['status', '--json'])
  if (r.status !== 0) return null
  try {
    return JSON.parse(r.stdout || '{}')
  } catch {
    return null
  }
}

function ensureUp(bin) {
  let st = statusJson(bin)
  const backend = st?.BackendState || ''
  if (backend === 'Running') return st
  // Bring the tunnel up without rewriting prefs (MagicDNS stays as Owner configured).
  const up = run(bin, ['up'], {
    timeout: 60_000,
  })
  if (up.status !== 0) {
    // Prefs conflict: retry with --reset only when explicitly allowed.
    const err = (up.stderr || up.stdout || '').trim()
    if (/changed flags|Error: changing settings/i.test(err)) {
      const up2 = run(bin, ['up', '--reset'], { timeout: 60_000 })
      if (up2.status !== 0) {
        die(
          `tailscale up failed: ${(up2.stderr || up2.stdout || err).trim()} — open Tailscale.app and sign in`,
        )
      }
    } else {
      die(
        `tailscale up failed: ${err || 'unknown'} — open Tailscale.app and sign in`,
      )
    }
  }
  for (let i = 0; i < 40; i++) {
    st = statusJson(bin)
    if (st?.BackendState === 'Running') return st
    spawnSync('sleep', ['0.25'])
  }
  die('tailscale did not reach Running state')
}

function pickPhonePeer(peers) {
  const list = Object.values(peers || {})
  const ios = list.filter((p) => String(p.OS || '').toLowerCase() === 'ios')
  if (ios.length === 1) return ios[0]
  if (ios.length > 1) {
    // Prefer online; else first.
    return ios.find((p) => p.Online) || ios[0]
  }
  // Fallback: any non-self peer that looks like a phone hostname.
  return (
    list.find((p) => /iphone|ipad/i.test(String(p.HostName || p.DNSName || ''))) ||
    null
  )
}

function dnsName(node) {
  return String(node?.DNSName || '')
    .replace(/\.$/, '')
    .toLowerCase()
}

function ipv4(node) {
  const ips = node?.TailscaleIPs || []
  return ips.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) || null
}

const bin = tailscaleBin()
if (!bin) die('tailscale CLI not found')

const st = ensureUp(bin)
const self = st.Self || {}
const phone = pickPhonePeer(st.Peer || {})
const macDns = dnsName(self)
const macIp = ipv4(self)
const phoneDns = phone ? dnsName(phone) : null
const phoneIp = phone ? ipv4(phone) : null

if (!macDns || !macIp) die('could not read Mac Tailscale identity')

const shellOrigin = `http://${macDns}:${SHELL_PORT}`
const trust = {
  version: 1,
  updatedAt: new Date().toISOString(),
  trustModel: 'tailscale-pair',
  notes:
    'Mac LocalAI stays on 127.0.0.1:18888. Phone uses AIOS same-origin /__localai via MagicDNS. Daily Beta proxy enforces peer allowlist from this file (loopback + mac.ipv4 + phone.ipv4). Companions do not expose /__localai. Optional KENOS_LOCALAI_ALLOW_LAN=1 widens to RFC1918/CGNAT (weaker).',
  mac: {
    hostname: self.HostName || null,
    dns: macDns,
    ipv4: macIp,
  },
  phone: phone
    ? {
        hostname: phone.HostName || null,
        dns: phoneDns,
        ipv4: phoneIp,
        online: Boolean(phone.Online),
        os: phone.OS || null,
      }
    : null,
  shell: {
    origin: shellOrigin,
    port: SHELL_PORT,
    localaiProxyPath: '/__localai',
    localaiUpstream: 'http://127.0.0.1:18888',
  },
}

mkdirSync(STATE_DIR, { recursive: true })
writeFileSync(TRUST_PATH, JSON.stringify(trust, null, 2) + '\n')
writeFileSync(ORIGIN_PATH, shellOrigin + '\n')

// Prefer MagicDNS in device-build helper consumers.
const out = {
  ok: true,
  trustPath: TRUST_PATH,
  shellOrigin,
  macDns,
  macIp,
  phoneDns,
  phoneIp,
  phoneOnline: phone ? Boolean(phone.Online) : false,
  backendState: st.BackendState,
}

if (WANT_JSON) {
  console.log(JSON.stringify(out, null, 2))
} else {
  console.log(`✔ Tailscale pair ready (${st.BackendState})`)
  console.log(`  Mac    ${macDns} (${macIp})`)
  if (phone) {
    console.log(
      `  Phone  ${phoneDns} (${phoneIp || '?'}) ${phone.Online ? 'online' : 'offline'}`,
    )
  } else {
    console.log('  Phone  (no iOS peer yet — install Tailscale on iPhone and join this tailnet)')
  }
  console.log(`  Shell  ${shellOrigin}`)
  console.log(`  Trust  ${TRUST_PATH}`)
}
