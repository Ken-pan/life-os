/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite'
import { lifeOsBasicSwPlugin } from '@life-os/platform-web/pwa/basic-sw'
import { defineConfig, loadEnv } from 'vite'
import { handleKimiBrief } from './server/kimiBrief.ts'


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
    kimiBriefPlugin(loadEnv(mode, process.cwd(), '').KIMI_API_KEY),
    lifeOsBasicSwPlugin({
      cachePrefix: 'financeos',
      precache: [
        '/',
        '/manifest.webmanifest',
        '/assets/brand/favicon-16.png',
        '/assets/brand/favicon-32.png',
        '/assets/brand/icon-192.png',
        '/assets/brand/icon-512.png',
        '/assets/brand/icon-512-maskable.png',
        '/assets/brand/apple-touch-icon.png',
      ],
      navigationFallback: '/',
    }),
  ],
  server: {
    proxy: {
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
