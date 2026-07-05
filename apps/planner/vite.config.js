/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { handleAiPlan } from './server/aiPlan.mjs';

function aiPlanPlugin(apiKey) {
  return {
    name: 'planos-ai-plan',
    configureServer(server) {
      server.middlewares.use('/api/ai/plan', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'method_not_allowed' }));
          return;
        }
        let raw = '';
        req.on('data', (chunk) => {
          raw += chunk.toString('utf8');
        });
        req.on('end', () => {
          void (async () => {
            let payload;
            try {
              payload = JSON.parse(raw || '{}');
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'bad_json' }));
              return;
            }
            const result = await handleAiPlan(apiKey, payload, {
              origin: req.headers.origin,
              referer: req.headers.referer
            });
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          })();
        });
      });
    }
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [sveltekit(), aiPlanPlugin(loadEnv(mode, process.cwd(), '').KIMI_API_KEY)],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js']
  }
}));
