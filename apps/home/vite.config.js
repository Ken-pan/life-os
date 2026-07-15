import { execSync } from 'node:child_process';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { lifeOsBasicSwPlugin } from '@life-os/platform-web/pwa/basic-sw';

// —— 开发免登录同步(只在 dev server 存在)——
// 每个 agent 的预览浏览器都是全新无登录态,/plan 横幅(要 auth)看不到云端
// 优化副本。这个端点在 node 侧用本机钥匙串的 Supabase CLI token 换
// service key,把最新 server-optimized 副本喂给 /__dev/canonical-scan;
// 密钥全程不进浏览器,生产是静态站根本没有这个端点。
const SUPA_REF = 'iueozzuctstwvzbcxcyh';

function devCanonicalScanPlugin() {
  /** @type {Promise<string> | null} */
  let serviceKeyPromise = null;
  let cache = { at: 0, body: /** @type {string | null} */ (null) };

  function serviceKey() {
    if (!serviceKeyPromise) {
      serviceKeyPromise = (async () => {
        let token = process.env.SUPABASE_ACCESS_TOKEN;
        if (!token) {
          try {
            token = execSync(
              'security find-generic-password -s "Supabase CLI" -w',
              { stdio: ['ignore', 'pipe', 'ignore'] },
            )
              .toString()
              .trim();
          } catch {
            /* 本机没跑过 supabase login */
          }
        }
        if (!token) throw new Error('缺 Supabase token(supabase login 或 SUPABASE_ACCESS_TOKEN)');
        const res = await fetch(
          `https://api.supabase.com/v1/projects/${SUPA_REF}/api-keys?reveal=true`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`api-keys ${res.status}`);
        const keys = await res.json();
        const key = Array.isArray(keys)
          ? keys.find((k) => k?.name === 'service_role')?.api_key
          : null;
        if (!key) throw new Error('没拿到 service_role key');
        return key;
      })();
      // 失败别缓存住,下次请求重试(比如刚 supabase login 完)
      serviceKeyPromise.catch(() => {
        serviceKeyPromise = null;
      });
    }
    return serviceKeyPromise;
  }

  return {
    name: 'homeos-dev-canonical-scan',
    apply: /** @type {const} */ ('serve'),
    configureServer(server) {
      server.middlewares.use('/__dev/canonical-scan', async (_req, res) => {
        try {
          if (!cache.body || Date.now() - cache.at > 10_000) {
            const key = await serviceKey();
            const q =
              'select=id,label,device,updated_at,payload' +
              '&deleted=eq.false&device=eq.server-optimized' +
              '&order=updated_at.desc&limit=1';
            const r = await fetch(`https://${SUPA_REF}.supabase.co/rest/v1/scans?${q}`, {
              headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                'Accept-Profile': 'home',
              },
            });
            if (!r.ok) throw new Error(`scans ${r.status}`);
            const rows = await r.json();
            cache = { at: Date.now(), body: JSON.stringify(rows?.[0] ?? null) };
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(cache.body);
        } catch (err) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    sveltekit(),
    devCanonicalScanPlugin(),
    lifeOsBasicSwPlugin({
      cachePrefix: 'homeos',
      precache: [
        '/',
        '/manifest.webmanifest',
        '/favicon-16.png',
        '/favicon-32.png',
        '/icon-192.png',
        '/icon-512.png',
        '/icon-512-maskable.png',
        '/apple-touch-icon.png',
        '/notify-192.png',
        '/brand-circle-dark-48.png',
        '/brand-circle-dark-64.png',
        '/brand-circle-dark-96.png',
        '/brand-circle-light-48.png',
        '/brand-circle-light-64.png',
        '/brand-circle-light-96.png',
        '/icon-dark.png',
        '/icon-light.png',
      ],
      navigationFallback: '/',
    }),
  ],
  server: {
    proxy: {
      // 本机 local-ai 网关只绑 127.0.0.1，手机直连不到。走 dev 代理后，手机连
      // 局域网上的这台 dev server 也能用上 VLM。生产是静态站，这个路径会 404 ——
      // 前端据此自动隐藏「认房间」，不要改成硬编码 IP。
      '/upstream/vlm': {
        target: 'http://127.0.0.1:18888',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/upstream\/vlm/, ''),
      },
    },
  },
});
