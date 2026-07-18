import { defineConfig, devices } from '@playwright/test'

// KnowledgeOS 浏览器 smoke（KNOW.EDITOR.7 可选项）：守块编辑器往返 + library 列表
// 渲染这两处纯单测覆盖不到的浏览器回归点。Web 模式（isTauri()=false）→ 条目走
// localStorage（key: knowledgeos_v1），测试直接种 storage 后深链进 /library。
const port = process.env.KNOWLEDGE_E2E_PORT || '5879'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: `npx svelte-kit sync && npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // 桌面双列工作台（列表 + 内联文档）；smoke 只跑一个投影，够守回归点。
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
})
