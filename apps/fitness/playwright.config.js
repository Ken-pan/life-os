import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run dev',
    port: 5190,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5190',
    headless: true,
  },
})
