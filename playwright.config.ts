import { defineConfig, devices } from '@playwright/test'
import { getAppList } from './scripts/pwa/apps.config.mjs'

const apps = getAppList({ testEnabledOnly: true })
const filter = process.env.PWA_APP?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const projects = (
  filter?.length ? apps.filter((a) => filter.includes(a.id)) : apps
).map((app) => ({
  name: app.id,
  use: {
    baseURL: `http://127.0.0.1:${app.port}`,
    ...devices['iPhone 13'],
    colorScheme: 'dark',
    headless: true,
  },
  webServer: {
    command: `npm run preview -w ${app.workspace} -- --host 127.0.0.1 --port ${app.port}`,
    url: `http://127.0.0.1:${app.port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
}))

export default defineConfig({
  testDir: './tests/pwa',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  projects: projects.length ? projects : undefined,
  reporter: [['list']],
})
