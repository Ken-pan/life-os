#!/usr/bin/env node
// AIOS 静态服务器 — 零依赖,serve apps/aios/build,SPA fallback 到 index.html
// 用法: node scripts/aios/serve.mjs   (AIOS_PORT 可覆盖端口,默认 5219)
// 注意: 5197-5200 是 aios 的 vite dev 预览端口,这里刻意避开,日常使用的数据(localStorage)绑定在 5219 这个 origin
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'aios', 'build')
const PORT = Number(process.env.AIOS_PORT ?? 5219)

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  if (url.pathname === '/__health') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    return res.end('ok')
  }
  // 去掉 .. 防目录穿越;去掉尾部 / 映射到目录 index
  let pathname = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(ROOT, pathname)

  try {
    const s = await stat(file)
    if (s.isDirectory()) file = join(file, 'index.html')
    await stat(file)
  } catch {
    file = join(ROOT, 'index.html') // SPA fallback
  }

  try {
    const body = await readFile(file)
    const immutable = file.includes('/_app/immutable/')
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[aios-web] serving ${ROOT} at http://127.0.0.1:${PORT}`)
})
