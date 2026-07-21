import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig, loadEnv } from 'vite'
import { handleAiChat } from './server/aiChat.mjs'

/**
 * Dev-only Kimi proxy (mirrors Netlify /api/ai/chat).
 * @param {string|undefined} apiKey
 */
function aiChatPlugin(apiKey) {
  return {
    name: 'aios-ai-chat',
    configureServer(server) {
      server.middlewares.use('/api/ai/chat', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
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
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'bad_json' }))
              return
            }
            const result = await handleAiChat(apiKey, payload, {
              origin: req.headers.origin,
              referer: req.headers.referer,
            })
            if (result.kind === 'stream') {
              res.statusCode = result.status
              for (const [k, v] of Object.entries(result.headers)) {
                res.setHeader(k, v)
              }
              const reader = result.body.getReader()
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  res.write(Buffer.from(value))
                }
                res.end()
              } catch (err) {
                if (!res.headersSent) {
                  res.statusCode = 502
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ error: 'stream_pipe_failed' }))
                } else {
                  res.end()
                }
                void err
              }
              return
            }
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.body))
          })()
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [sveltekit(), aiChatPlugin(env.KIMI_API_KEY)],
    server: {
      port: 5197,
      strictPort: true,
    },
    preview: {
      port: 4173,
    },
  }
})
