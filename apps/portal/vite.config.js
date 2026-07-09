import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

function portalPwaCacheVersionPlugin() {
  const buildId =
    process.env.COMMIT_REF ||
    process.env.DEPLOY_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    `dev-${Date.now().toString(36)}`

  return {
    name: 'portal-pwa-cache-version',
    apply: 'build',
    closeBundle() {
      const sw = readFileSync(join(process.cwd(), 'static/sw.js'), 'utf8').replaceAll(
        '__PORTAL_BUILD_ID__',
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

export default defineConfig({
  plugins: [sveltekit(), portalPwaCacheVersionPlugin()],
})
