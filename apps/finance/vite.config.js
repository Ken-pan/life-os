/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig, loadEnv } from 'vite'
import { handleKimiBrief } from './server/kimiBrief.ts'

const STOOQ_BATCH_CONCURRENCY = 4

function symbolsFromReqUrl(url) {
  if (!url) return []
  const q = url.indexOf('?')
  if (q < 0) return []
  for (const part of url.slice(q + 1).split('&')) {
    if (!part.startsWith('symbols=')) continue
    return decodeURIComponent(part.slice('symbols='.length).replace(/\+/g, ' '))
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  }
  return []
}

function stooqBatchPlugin() {
  return {
    name: 'stooq-batch',
    configureServer(server) {
      server.middlewares.use('/api/stooq-batch', async (req, res) => {
        try {
          const symbols = symbolsFromReqUrl(req.url)
          const out = {}
          let i = 0
          const workers = Array.from(
            {
              length: Math.min(
                STOOQ_BATCH_CONCURRENCY,
                Math.max(symbols.length, 1),
              ),
            },
            async () => {
              while (i < symbols.length) {
                const sym = symbols[i++]
                const ticker = sym.toLowerCase()
                const endpoint = `https://stooq.com/q/l/?s=${encodeURIComponent(`${ticker}.us`)}&i=d`
                const response = await fetch(endpoint)
                if (!response.ok) continue
                const body = await response.text()
                const line = body
                  .trim()
                  .split('\n')
                  .map((x) => x.trim())
                  .find((x) => x.includes(',20'))
                if (!line) continue
                const parts = line.split(',')
                if (parts.length < 7) continue
                const price = Number(parts[6])
                if (!Number.isFinite(price)) continue
                out[sym] = {
                  symbol: sym,
                  price,
                  date: parts[1],
                  time: parts[2],
                }
              }
            },
          )
          await Promise.all(workers)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(out))
        } catch {
          res.statusCode = 502
          res.end(JSON.stringify({}))
        }
      })
    },
  }
}

function kimiBriefPlugin(apiKey) {
  return {
    name: 'kimi-ai-brief',
    configureServer(server) {
      server.middlewares.use('/api/ai/brief', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'method_not_allowed' }))
          return
        }
        let raw = ''
        req.on('data', (chunk) => {
          raw += chunk.toString('utf8')
        })
        req.on('end', () => {
          void (async () => {
            let payload
            try {
              payload = JSON.parse(raw || '{}')
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'bad_json' }))
              return
            }
            const result = await handleKimiBrief(apiKey, payload)
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.body))
          })()
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    sveltekit(),
    stooqBatchPlugin(),
    kimiBriefPlugin(loadEnv(mode, process.cwd(), '').KIMI_API_KEY),
  ],
  server: {
    proxy: {
      '/api/stooq': {
        target: 'https://stooq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/stooq/, ''),
      },
      '/api/news': {
        target: 'https://news.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/news/, ''),
      },
      '/api/ychart': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ychart/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,ts}'],
  },
}))
