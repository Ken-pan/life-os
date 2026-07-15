import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { lifeOsBasicSwPlugin } from '@life-os/platform-web/pwa/basic-sw';

export default defineConfig({
  plugins: [
    sveltekit(),
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
