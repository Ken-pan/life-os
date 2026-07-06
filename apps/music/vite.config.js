import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { handleLyricsFetch } from './server/handleLyricsFetch.mjs';

/** Inject deploy/build id into sw.js so PWA cache busts on each release. */
function musicPwaCacheVersionPlugin() {
  const buildId =
    process.env.COMMIT_REF ||
    process.env.DEPLOY_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    `dev-${Date.now().toString(36)}`;

  return {
    name: 'music-pwa-cache-version',
    apply: 'build',
    closeBundle() {
      const sw = readFileSync(join(process.cwd(), 'static/sw.js'), 'utf8').replaceAll(
        '__MUSICOS_BUILD_ID__',
        buildId
      );
      for (const outDir of [
        join(process.cwd(), '.svelte-kit/output/client'),
        join(process.cwd(), 'build')
      ]) {
        const swPath = join(outDir, 'sw.js');
        if (!existsSync(swPath)) continue;
        writeFileSync(swPath, sw);
      }
    }
  };
}

/** 开发环境歌词 API（生产由 netlify/functions/lyrics-fetch.mjs 承接同一路径）。 */
function lyricsFetchPlugin() {
  return {
    name: 'lyrics-fetch-api',
    configureServer(server) {
      server.middlewares.use('/api/lyrics/fetch', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
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
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'bad_json' }));
              return;
            }

            const result = await handleLyricsFetch(payload);
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          })();
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [sveltekit(), lyricsFetchPlugin(), musicPwaCacheVersionPlugin()]
});
