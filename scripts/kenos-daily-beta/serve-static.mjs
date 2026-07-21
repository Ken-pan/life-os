#!/usr/bin/env node
/**
 * Zero-dep static SPA server for Kenos Personal Daily Beta.
 *
 * Env:
 *   KENOS_STATIC_ROOT  — absolute path to build/ (required)
 *   KENOS_STATIC_PORT  — listen port (required)
 *   KENOS_STATIC_APP   — app id for /__kenos/release (aios|planner|fitness)
 *   KENOS_RELEASE_META — path to release.json (optional)
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

const ROOT = process.env.KENOS_STATIC_ROOT
const PORT = Number(process.env.KENOS_STATIC_PORT)
const APP = process.env.KENOS_STATIC_APP || 'app'
const META_PATH = process.env.KENOS_RELEASE_META || ''

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

function releasePayload() {
  let meta = {
    app: APP,
    environment: 'local-daily-beta',
    port: PORT,
    root: ROOT,
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  if (url.pathname === '/__health') {
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[kenos-static:${APP}] ${ROOT} → http://127.0.0.1:${PORT}`)
})
