import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { lifeOsBasicSwPlugin } from '@life-os/platform-web/pwa/basic-sw'

export default defineConfig({
  plugins: [
    sveltekit(),
    lifeOsBasicSwPlugin({
      cachePrefix: 'portalos',
      precache: [
        '/offline.html',
        '/manifest.webmanifest',
        '/favicon-32.png',
        '/icon-192.png',
        '/icon-512.png',
        '/apple-touch-icon.png',
        '/brand-circle-dark-96.png',
        '/logo-mark.svg',
      ],
      navigationFallback: '/offline.html',
    }),
  ],
})
