#!/usr/bin/env node
/**
 * Strict smoke: Mac↔iPhone Tailscale pair + Daily Beta /__localai → LocalAI.
 *
 * Usage:
 *   node scripts/kenos-daily-beta/localai-phone-smoke.mjs
 *   node scripts/kenos-daily-beta/localai-phone-smoke.mjs --recover
 *   node scripts/kenos-daily-beta/localai-phone-smoke.mjs --json
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const STATE = process.env.KENOS_DAILY_BETA_HOME || join(homedir(), '.kenos-daily-beta')
const TRUST = join(STATE, 'device-trust.json')
const WANT_JSON = process.argv.includes('--json')
const RECOVER = process.argv.includes('--recover')
const CHAT_TIMEOUT_MS = Number(process.env.KENOS_LOCALAI_CHAT_TIMEOUT_MS || 90_000)

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail: String(detail || '') })
  if (!WANT_JSON) {
    console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function fetchText(url, opts = {}, timeoutMs = 8_000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
  } catch (err) {
    return { ok: false, status: 0, text: String(err?.message || err) }
  } finally {
    clearTimeout(t)
  }
}

function loadTrust() {
  if (!existsSync(TRUST)) return null
  try {
    return JSON.parse(readFileSync(TRUST, 'utf8'))
  } catch {
    return null
  }
}

function ensurePair() {
  const r = spawnSync(process.execPath, [join(HERE, 'ensure-tailnet-pair.mjs'), '--json'], {
    encoding: 'utf8',
    timeout: 90_000,
  })
  if (r.status !== 0) return null
  try {
    return JSON.parse(r.stdout || '{}')
  } catch {
    return null
  }
}

function recoverWedgedLlmFast() {
  // Kill mlx_lm.server processes that look like the 35B llm-fast worker.
  const ps = spawnSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' })
  const lines = (ps.stdout || '').split('\n')
  let killed = 0
  for (const line of lines) {
    if (!/mlx_lm\.server/.test(line)) continue
    if (!/Qwen3\.6-35B|Qwen3\.6-35B-A3B/.test(line)) continue
    const pid = Number(String(line).trim().split(/\s+/)[0])
    if (!Number.isFinite(pid) || pid <= 1) continue
    spawnSync('kill', [String(pid)])
    killed += 1
  }
  return killed
}

const pair = ensurePair()
check('tailscale_pair', Boolean(pair?.ok), pair?.shellOrigin || pair?.error || '')

const trust = loadTrust() || {}
const origin = trust?.shell?.origin || pair?.shellOrigin
check('device_trust', Boolean(origin && trust?.mac?.dns && trust?.phone?.dns), origin || 'missing')

if (!origin) {
  const out = { ok: false, checks }
  if (WANT_JSON) console.log(JSON.stringify(out, null, 2))
  process.exit(2)
}

const health = await fetchText(`${origin}/__health`)
check('shell_health', health.ok && health.text.trim() === 'ok', `${health.status}`)

const deep = await fetchText(`${origin}/__health?deep=1`, {}, 4_000)
check('shell_health_deep', deep.ok && deep.text.trim() === 'ok', `${deep.status} ${deep.text.slice(0, 80)}`)

const models = await fetchText(`${origin}/__localai/v1/models`)
let modelCount = 0
try {
  modelCount = JSON.parse(models.text)?.data?.length || 0
} catch {
  /* ignore */
}
check('localai_models_proxy', models.ok && modelCount > 0, `${models.status} count=${modelCount}`)

let chat = await fetchText(
  `${origin}/__localai/v1/chat/completions`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'llm-fast',
      messages: [{ role: 'user', content: '只回复：好' }],
      stream: false,
      max_tokens: 8,
      chat_template_kwargs: { enable_thinking: false },
    }),
  },
  CHAT_TIMEOUT_MS,
)

if (!chat.ok && RECOVER) {
  const killed = recoverWedgedLlmFast()
  check('recover_kill_35b', killed > 0, `killed=${killed}`)
  // allow cold start
  await new Promise((r) => setTimeout(r, 1500))
  chat = await fetchText(
    `${origin}/__localai/v1/chat/completions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'llm-fast',
        messages: [{ role: 'user', content: '只回复：好' }],
        stream: false,
        max_tokens: 8,
        chat_template_kwargs: { enable_thinking: false },
      }),
    },
    CHAT_TIMEOUT_MS,
  )
}

let content = ''
try {
  content = JSON.parse(chat.text)?.choices?.[0]?.message?.content || ''
} catch {
  /* ignore */
}
check('localai_chat_proxy', chat.ok && Boolean(content), `${chat.status} content=${JSON.stringify(content).slice(0, 40)}`)

// Continuity companions on MagicDNS host
const host = new URL(origin).hostname
const ports = [5188, 5190, 5180, 5189, 5196, 5192, 5879]
let companionsOk = 0
let companionProxyLeak = 0
for (const port of ports) {
  const r = await fetchText(`http://${host}:${port}/__health`, {}, 4000)
  if (r.ok) companionsOk += 1
  const proxy = await fetchText(
    `http://${host}:${port}/__localai/v1/models`,
    {},
    4000,
  )
  if (proxy.status === 200) companionProxyLeak += 1
}
check('companions_magicdns', companionsOk >= 5, `${companionsOk}/${ports.length}`)
check(
  'companions_localai_closed',
  companionProxyLeak === 0,
  `leaks=${companionProxyLeak}`,
)

const ok = checks.every((c) => c.ok)
mkdirSync(STATE, { recursive: true })
writeFileSync(
  join(STATE, 'localai-phone-smoke-latest.json'),
  JSON.stringify({ ok, at: new Date().toISOString(), origin, checks }, null, 2) + '\n',
)

if (WANT_JSON) {
  console.log(JSON.stringify({ ok, origin, checks }, null, 2))
} else {
  console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
}
process.exit(ok ? 0 : 2)
