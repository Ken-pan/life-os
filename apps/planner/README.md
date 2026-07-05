# PLANNER.OS

阳光感任务清单 Web 应用（SvelteKit 5），参考 FitnessOS / FinanceOS 的 UI 与架构模式。

## 功能

- 今天 / 收件箱 / 即将 / 日历 / 搜索 / 已完成 / 设置
- 自定义清单、优先级、标签、子任务
- **重复任务**（每天 / 每周 / 每月 / 每年，完成自动生成下一项）
- **提醒推送**（浏览器通知 + Service Worker 定时）
- **Supabase 云同步**（登录后备份与多设备同步）
- **AI 助手**（今日简报、任务拆分，经 Netlify Function 调用 Kimi）
- **PWA 离线**（Service Worker 预缓存 + 导航回退）
- 中英文、浅色/深色/跟随系统
- JSON 导入导出
- 移动端 BottomNav + 桌面 Sidebar

## 开发

```bash
npm install
cp .env.example .env   # 可选：本地 AI 代理需要 KIMI_API_KEY
npm run dev
```

E2E 测试使用端口 **5188**：

```bash
npm run dev -- --port 5188
npm run test:e2e
```

## 架构

| 层 | 路径 | 职责 |
|------|------|------|
| Persist | `src/lib/persist/` | localStorage 读写、schema 迁移 |
| State | `src/lib/state.svelte.js` | Svelte 5 响应式全局状态 |
| Index | `src/lib/domain/taskIndex.js` + `taskIndex.svelte.js` + `selectors.js` | 全局任务索引与 O(1) 查询 |
| Repo | `src/lib/repo.js` | Supabase 结构化 + legacy blob 读写 |
| Cache | `src/lib/localCache.js` | 登录用户 SWR 本地快照 |
| Reminders | `src/lib/persist/reminderStore.js` + `static/sw.js` | IndexedDB 持久化 + SW 重装 |
| Sync | `src/lib/sync.js` + `syncNotify.js` | 云同步编排与错误 banner |

## 测试

```bash
npm test          # Vitest 单元测试
npm run test:e2e  # Playwright E2E
```

GitHub Actions（`.github/workflows/ci.yml`）在 push/PR 时自动跑 unit + E2E。

## 环境变量

| 变量 | 说明 |
|------|------|
| `PUBLIC_SUPABASE_URL` | Supabase 项目 URL（未设置时使用内置开发默认值） |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `KIMI_API_KEY` | Kimi API 密钥，用于 `/api/ai/plan`（Netlify 生产环境在站点设置中配置） |
| `AI_ALLOWED_ORIGINS` | AI 接口允许的 Origin/Referer 片段（默认 `localhost,127.0.0.1,netlify.app`） |

Supabase 客户端配置见 `src/lib/supabase.js`（Life OS 统一项目 `iueozzuctstwvzbcxcyh`）。

## Supabase 迁移

在 Supabase SQL Editor 或 CLI 中执行：

1. `supabase/migrations/20260705130000_planner_core_schema.sql` — legacy JSON blob
2. `supabase/migrations/20260705140000_planner_structured_tables.sql` — 任务/清单分表（推荐）

应用会优先从 `planner_tasks` / `planner_lists` 读写；若表不存在则自动回退 JSON blob。

验证结构化表（Supabase CLI 已 link 到 Life OS 项目时）：

```bash
supabase db query --linked "select tablename from pg_tables where schemaname='public' and tablename like 'planner%';"
```

登录后在设置页执行「立即同步」，数据会写入 `planner_tasks` / `planner_lists`，同时保留 `planner_user_state` 作 settings 备份。

## 构建与部署

```bash
npm run build
npm run preview
```

部署到 Netlify 时，`netlify.toml` 已配置 SPA 回退与 `/api/ai/plan` 函数路由。

## 架构说明

| 模块 | 路径 |
|------|------|
| 重复规则 | `src/lib/domain/recurrence.js` |
| 提醒 | `src/lib/services/reminders.js` + `static/sw.js` |
| 云同步 | `src/lib/sync.js` + `src/lib/auth.svelte.js` |
| AI | `server/aiPlan.mjs` + `netlify/functions/ai-plan.mjs` |
| PWA | `static/sw.js` + `src/lib/swRegister.js` |

字体与字号规范见 [`docs/TYPOGRAPHY.md`](docs/TYPOGRAPHY.md)（与 FinanceOS 对齐）。

共享主题与同步包在 monorepo 内 **`packages/theme`**、**`packages/sync`**（`@life-os/theme`、`@life-os/sync`）。

本地数据优先存储于 `localStorage`（schema v2），登录后可选择与云端合并。
