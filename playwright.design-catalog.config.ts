import { defineConfig, devices } from '@playwright/test'

const CATALOG_PORT = 5190
const baseURL = `http://127.0.0.1:${CATALOG_PORT}`

export default defineConfig({
  testDir: './tests/visual',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    headless: true,
  },
  webServer: {
    command: `npm run dev -w design-catalog -- --host 127.0.0.1 --port ${CATALOG_PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'catalog-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'catalog-mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
})
