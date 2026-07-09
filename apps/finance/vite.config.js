/// <reference types="vitest/config" />
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig, loadEnv } from 'vite'
import { handleKimiBrief } from './server/kimiBrief.ts'

// Stamps a per-deploy build id into static/sw.js's cache name so a new deploy
// gets a fresh cache instead of serving stale precached assets forever.
// Same pattern as apps/music/vite.config.js's musicPwaCacheVersionPlugin.
function financePwaCacheVersionPlugin() {
  const buildId =
    process.env.COMMIT_REF ||
    process.env.DEPLOY_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    `dev-${Date.now().toString(36)}`

  return {
    name: 'finance-pwa-cache-version',
    apply: 'build',
    closeBundle() {
      const sw = readFileSync(join(process.cwd(), 'static/sw.js'), 'utf8').replaceAll(
        '__FINANCE_BUILD_ID__',
        buildId,
      )
      for (const outDir of [
        join(process.cwd(), '.svelte-kit/output/client'),
        join(process.cwd(), 'build'),
      ]) {
        const swPath = join(outDir, 'sw.js')
        if (!existsSync(swPath)) continue
        writeFileSync(swPath, sw)
      }
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
    kimiBriefPlugin(loadEnv(mode, process.cwd(), '').KIMI_API_KEY),
    financePwaCacheVersionPlugin(),
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
