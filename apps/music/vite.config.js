import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { handleLyricsFetch } from './server/handleLyricsFetch.mjs';

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
  plugins: [sveltekit(), lyricsFetchPlugin()]
});
