#!/usr/bin/env node
/**
 * Zero-dep static SPA server for Kenos Personal Daily Beta.
 *
 * Env: see serve-static.py header (aligned behavior).
 */
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { URL } from 'node:url'
import { normalizeProxyPath, usesChatSlot } from './localai-proxy-path.mjs'

const ROOT = process.env.KENOS_STATIC_ROOT
const PORT = Number(process.env.KENOS_STATIC_PORT)
const APP = process.env.KENOS_STATIC_APP || 'app'
const META_PATH = process.env.KENOS_RELEASE_META || ''
const BIND = process.env.KENOS_STATIC_BIND || '0.0.0.0'
const LOCALAI_UPSTREAM = (
  process.env.KENOS_LOCALAI_UPSTREAM || 'http://127.0.0.1:18888'
).replace(/\/$/, '')
const LOCALAI_PROXY = process.env.KENOS_LOCALAI_PROXY !== '0'
const LOCALAI_PREFIX = '/__localai'
const TRUST_PATH =
  process.env.KENOS_DEVICE_TRUST ||
  join(homedir(), '.kenos-daily-beta', 'device-trust.json')
const ALLOW_LAN = process.env.KENOS_LOCALAI_ALLOW_LAN === '1'
const PROXY_TOKEN = String(process.env.KENOS_LOCALAI_PROXY_TOKEN || '').trim()
const MAX_INFLIGHT = Math.max(
  1,
  Number(process.env.KENOS_LOCALAI_MAX_INFLIGHT || 2) || 2,
)
const MAX_BODY = Math.max(
  1024,
  Number(process.env.KENOS_LOCALAI_MAX_BODY || 32 * 1024 * 1024) || 0,
)
const SSE_PING_MS = Math.max(
  500,
  Number(process.env.KENOS_LOCALAI_SSE_PING_S || 2) * 1000 || 2000,
)

if (!ROOT || !Number.isFinite(PORT) || PORT <= 0) {
  console.error('KENOS_STATIC_ROOT and KENOS_STATIC_PORT are required')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

const HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
])

const upstreamUrl = new URL(LOCALAI_UPSTREAM + '/')
let inflightChat = 0
let trustCache = { mtime: null, at: 0, ips: new Set() }

function releasePayload() {
  let meta = {
    app: APP,
    environment: 'local-daily-beta',
    port: PORT,
    root: ROOT,
    server: 'node-static',
    localaiProxy: LOCALAI_PROXY,
    localaiPrefix: LOCALAI_PROXY ? LOCALAI_PREFIX : null,
    localaiAllowLan: ALLOW_LAN,
    localaiMaxInflight: MAX_INFLIGHT,
    localaiMaxBody: MAX_BODY,
    deviceTrust: LOCALAI_PROXY ? TRUST_PATH : null,
  }
  if (META_PATH && existsSync(META_PATH)) {
    try {
      meta = { ...meta, ...JSON.parse(readFileSync(META_PATH, 'utf8')) }
    } catch {
      /* ignore */
    }
  }
  return meta
}

function normalizeClientIp(raw) {
  let host = String(raw || '').trim()
  if (host.startsWith('::ffff:')) host = host.slice(7)
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  return host
}

function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost'
}

function isPrivateOrCgnat(ip) {
  const parts = ip.split('.').map((x) => Number(x))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function loadTrustIps() {
  const now = Date.now()
  let mtime = null
  try {
    if (existsSync(TRUST_PATH)) mtime = statSync(TRUST_PATH).mtimeMs
  } catch {
    mtime = null
  }
  if (
    trustCache.ips.size &&
    trustCache.mtime === mtime &&
    now - trustCache.at < 30_000
  ) {
    return trustCache.ips
  }
  const ips = new Set()
  if (existsSync(TRUST_PATH)) {
    try {
      const data = JSON.parse(readFileSync(TRUST_PATH, 'utf8'))
      for (const key of ['mac', 'phone']) {
        const v4 = data?.[key]?.ipv4
        if (typeof v4 === 'string' && v4.trim()) ips.add(v4.trim())
      }
    } catch {
      /* ignore */
    }
  }
  trustCache = { mtime, at: now, ips }
  return ips
}

function bearerOk(req) {
  if (!PROXY_TOKEN) return false
  const auth = req.headers.authorization || ''
  if (auth.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === PROXY_TOKEN) {
    return true
  }
  const alt = req.headers['x-kenos-proxy-token'] || ''
  return String(alt).trim() === PROXY_TOKEN
}

function clientAllowed(req) {
  const ip = normalizeClientIp(req.socket?.remoteAddress || '')
  if (bearerOk(req)) return true
  if (isLoopback(ip)) return true
  if (loadTrustIps().has(ip)) return true
  if (ALLOW_LAN && isPrivateOrCgnat(ip)) return true
  return false
}

function sendPlain(res, code, msg, extra = {}) {
  const body = String(msg)
  res.writeHead(code, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    connection: 'close',
    ...extra,
  })
  res.end(body)
}

async function probeLocalAiModels(timeoutMs = 1500) {
  const lib = upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve) => {
    const req = lib(
      {
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || (upstreamUrl.protocol === 'https:' ? 443 : 80),
        path: '/v1/models',
        method: 'GET',
        headers: { connection: 'close' },
        timeout: timeoutMs,
      },
      (up) => {
        up.resume()
        resolve(up.statusCode === 200)
      },
    )
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.on('error', () => resolve(false))
    req.end()
  })
}

function proxyLocalAi(req, res, url) {
  if (!clientAllowed(req)) {
    return sendPlain(
      res,
      403,
      'localai_proxy_forbidden: peer not in device-trust allowlist',
    )
  }

  const rest = url.pathname.slice(LOCALAI_PREFIX.length) || '/'
  const norm = normalizeProxyPath(rest)
  if (!norm) return sendPlain(res, 400, 'localai_proxy_bad_path')

  const targetPath = norm + url.search
  const length = Number(req.headers['content-length'] || 0)
  if (Number.isFinite(length) && length > MAX_BODY) {
    return sendPlain(res, 413, 'localai_proxy_body_too_large')
  }

  const needSlot = usesChatSlot(req.method, targetPath)
  if (needSlot) {
    if (inflightChat >= MAX_INFLIGHT) {
      return sendPlain(res, 429, 'localai_proxy_busy: max concurrent chat reached', {
        'retry-after': '2',
      })
    }
    inflightChat += 1
  }

  const liberate = () => {
    if (needSlot) inflightChat = Math.max(0, inflightChat - 1)
  }

  const lib = upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP.has(String(k).toLowerCase()) && v != null) headers[k] = v
  }
  headers.host = upstreamUrl.host
  headers.connection = 'close'

  const upstream = lib(
    {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || (upstreamUrl.protocol === 'https:' ? 443 : 80),
      path: targetPath,
      method: req.method,
      headers,
      timeout: 600_000,
    },
    (upRes) => {
      const outHeaders = { connection: 'close' }
      let contentType = ''
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (!HOP.has(String(k).toLowerCase()) && v != null) outHeaders[k] = v
        if (String(k).toLowerCase() === 'content-type') contentType = String(v)
      }
      const isSse =
        contentType.includes('text/event-stream') ||
        contentType.includes('event-stream')
      if (isSse) {
        outHeaders['cache-control'] = 'no-cache'
        outHeaders['x-accel-buffering'] = 'no'
      }
      res.writeHead(upRes.statusCode || 502, outHeaders)
      upRes.on('end', liberate)
      upRes.on('error', liberate)
      if (!isSse) {
        upRes.pipe(res)
        return
      }
      // Keep SSE alive during long 35B prefill / quiet gaps (phone path).
      // Comment lines are ignored by OpenAI stream clients.
      let ping = setInterval(() => {
        if (res.writableEnded) return
        try {
          res.write(': ping\n\n')
        } catch {
          clearInterval(ping)
          ping = null
        }
      }, SSE_PING_MS)
      const stopPing = () => {
        if (ping) {
          clearInterval(ping)
          ping = null
        }
      }
      upRes.on('data', (chunk) => {
        if (!res.writableEnded) res.write(chunk)
      })
      upRes.on('end', () => {
        stopPing()
        if (!res.writableEnded) res.end()
      })
      upRes.on('error', stopPing)
      res.on('close', stopPing)
    },
  )
  upstream.on('error', (err) => {
    liberate()
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    }
    res.end(`localai_proxy_upstream_error: ${err?.message || err}`)
  })
  req.on('aborted', liberate)
  req.pipe(upstream)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  if (
    url.pathname === LOCALAI_PREFIX ||
    url.pathname.startsWith(LOCALAI_PREFIX + '/')
  ) {
    if (!LOCALAI_PROXY) {
      return sendPlain(res, 404, 'localai_proxy_disabled')
    }
    return proxyLocalAi(req, res, url)
  }
  if (url.pathname === '/__health') {
    if (url.searchParams.get('deep') === '1') {
      const ok = await probeLocalAiModels()
      if (ok) return sendPlain(res, 200, 'ok')
      return sendPlain(res, 503, 'localai_deep_fail')
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    return res.end('ok')
  }
  if (url.pathname === '/__kenos/release') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    return res.end(JSON.stringify(releasePayload()))
  }

  let pathname = normalize(decodeURIComponent(url.pathname)).replace(
    /^(\.\.[/\\])+/,
    '',
  )
  let file = join(ROOT, pathname)

  try {
    const s = await stat(file)
    if (s.isDirectory()) file = join(file, 'index.html')
    await stat(file)
  } catch {
    if (pathname.startsWith('/_app/') || pathname.startsWith('/assets/')) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      return res.end('not found')
    }
    file = join(ROOT, 'index.html')
  }

  try {
    const body = await readFile(file)
    const immutable = file.includes('/_app/immutable/')
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': immutable
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  }
})

server.listen(PORT, BIND, () => {
  console.log(
    `[kenos-static:${APP}] ${ROOT} → http://${BIND}:${PORT} (localai_proxy=${LOCALAI_PROXY}, allow_lan=${ALLOW_LAN}, max_inflight=${MAX_INFLIGHT})`,
  )
})
