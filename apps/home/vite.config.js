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
});
