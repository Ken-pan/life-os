import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  webServer: {
    command: 'npm run dev -- --port 5190 --strictPort --host 127.0.0.1',
    port: 5190,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: process.env.FITNESS_E2E_BASE_URL ?? 'http://127.0.0.1:5190',
    headless: true,
  },
})
