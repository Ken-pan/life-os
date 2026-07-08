import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [svelte()],
  publicDir: 'static',
  resolve: {
    alias: {
      $lib: path.resolve(root, 'src/lib'),
    },
  },
})
