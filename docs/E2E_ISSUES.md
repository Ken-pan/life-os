# Life OS E2E 测试问题记录

> **测试日期：** 2026-07-08（America/Los_Angeles）  
> **环境：** 本地 monorepo，`CI=1`（Planner）/ 各 app 默认 Playwright 配置  
> **原始日志：** `/tmp/lifeos-e2e-*.log`（本机；未入库）

## 总览

| App | 命令 | 结果 | 说明 |
| --- | --- | --- | --- |
| **Planner** | `cd apps/planner && CI=1 npm run test:e2e` | ❌ 20 fail / 40 pass / 4 skip | 移动端基本通过；桌面项目大量失败 |
| **Fitness** | `cd apps/fitness && npm run test:e2e` | ❌ 20/20 fail（**无效跑**） | 5173 被 Portal 占用，非 Fitness 页面 |
| **Fitness** | 重跑：`5190` + `playwright.e2e-ci.config.js` | ✅ 20/20 pass | 见下方「Fitness 端口冲突」 |
| **Finance** | `ia-route-smoke.mjs` + `ia-nav-qa.mjs` | 🟡 路由 ❌ / 导航 ✅ | 路由 smoke 无登录；导航 QA 注入 session |
| **Music** | `cd apps/music && npm run test:sw:full` | ✅ 21/21 pass | Service Worker E2E |

**图例：** ✅ 通过 · ❌ 失败 · 🟡 部分通过 · ⚠️ 基础设施/配置问题

---

## Planner (`planner-os`)

**命令：** `CI=1 npm run test:e2e`（Playwright mobile + desktop，端口 5188）  
**耗时：** ~16.3 min · **64 tests**（含 retry）

### 通过面

- **Mobile `[mobile]`**：`tests/e2e.spec.js` 核心流程 23/24 通过（仅 Insight 批量排期失败）
- 截图类 spec（`mobile-flow-walkthrough`、`screenshot-achievement-schedule` mobile 等）通过

### 问题 P-1 · Insight 批量排期（mobile + desktop）

| 项 | 内容 |
| --- | --- |
| **Spec** | `tests/e2e.spec.js:409` — `Insight 批量排期无日期任务` |
| **现象** | 点击 Insight CTA 后 toast 可能出现，但回到 Today 找不到 `.task-title`「排期A」 |
| **断言** | `expect(page.locator('.task-title', { hasText: '排期A' })).toBeVisible()` 超时 |
| **可能原因** | 批量排期逻辑未写入 Today 列表，或 Insight 行为/文案与测试不同步 |
| **证据** | `apps/planner/test-results/e2e-PlannerOS-E2E-Insight-批量排期无日期任务-*/` |

### 问题 P-2 · Desktop 项目与移动 UI 不匹配（19 个 fail）

| 项 | 内容 |
| --- | --- |
| **范围** | `[desktop]` 下 `e2e.spec.js` 多数用例 + `screenshot-audit.spec.js` 3 项 |
| **现象** | `getByTestId('fab-add')` 存在于 DOM 但 **不可见**（`display`/布局为移动端 FAB） |
| **典型错误** | `locator.click: Test timeout` / `waiting for element to be visible` |
| **根因** | Playwright `desktop` project（1280×800）仍走移动壳；FAB 在桌面端隐藏，测试 helper `quickAddTask` 依赖 FAB |
| **建议** | desktop project 改用侧栏/快捷键添加任务，或桌面 viewport 下显示 FAB；或 desktop 仅跑侧栏专用用例 |
| **已通过 desktop 用例** | `侧边栏导航（桌面端）`、部分只读路由/设置类用例 |

### 问题 P-3 · 控制台警告（非阻断）

| 项 | 内容 |
| --- | --- |
| **现象** | `Multiple GoTrueClient instances detected`（`life_os_auth`） |
| **影响** | 未直接导致 fail；长期可能影响 SSO/会话稳定性 |

### 复现

```bash
cd apps/planner && CI=1 npm run test:e2e
# 仅 mobile 核心：
cd apps/planner && CI=1 npm run test:e2e -- --project=mobile tests/e2e.spec.js
```

---

## Fitness (`fitness-os`)

### 问题 F-0 · 首次跑无效（端口冲突）⚠️

| 项 | 内容 |
| --- | --- |
| **命令** | `CI=1 npm run test:e2e` |
| **现象** | 20/20 失败；`.hero-title` 等 Fitness 选择器全部找不到 |
| **根因** | `playwright.config.js` 固定 `port: 5173` 且 `reuseExistingServer: true`；当时 **5173 上是 Portal（HOME.OS）**，不是 Fitness |
| **证据** | `curl http://127.0.0.1:5173/` → `<title>HOME.OS</title>` |

### 重跑结果 ✅

| 项 | 内容 |
| --- | --- |
| **命令** | Fitness dev `@5190` + `FITNESS_E2E_BASE_URL=http://127.0.0.1:5190 npx playwright test --config playwright.e2e-ci.config.js` |
| **结果** | **20/20 passed**（~12.7s） |
| **配置** | 新增 `apps/fitness/playwright.e2e-ci.config.js`（禁用 webServer，可指定 baseURL） |

### 问题 F-1 · 默认 E2E 配置易踩坑（待修）

| 项 | 内容 |
| --- | --- |
| **建议** | `reuseExistingServer: !process.env.CI`；或与 Portal 错开端口（Portal 勿占 5173） |
| **优先级** | P1 — 否则 CI/并行 dev 会误报全红 |

### 复现

```bash
# 错误（若 5173 非 Fitness）：
cd apps/fitness && npm run test:e2e

# 推荐：
cd apps/fitness && npm run dev -- --port 5190 --strictPort &
FITNESS_E2E_BASE_URL=http://127.0.0.1:5190 npx playwright test --config playwright.e2e-ci.config.js
```

---

## Finance (`finance-os`)

Finance **无** `test:e2e` npm script；使用 Playwright 脚本：

| 脚本 | 用途 |
| --- | --- |
| `scripts/ia-route-smoke.mjs` | 22 条 canonical 路由可渲染 |
| `scripts/ia-nav-qa.mjs` | 桌面侧栏 + 移动底栏导航（需登录） |

### 问题 FN-1 · 路由 smoke 未注入 Auth（22/22 fail）

| 项 | 内容 |
| --- | --- |
| **命令** | `UI_QA_URL=http://127.0.0.1:5180 node scripts/ia-route-smoke.mjs`（dev 已启动） |
| **现象** | 全部路由 `waitForSelector('.app-shell')` 15s 超时 |
| **根因** | Finance AuthGate 未登录时不挂载 `.app-shell`；脚本未像 `ia-nav-qa` 一样注入 `life_os_auth` |
| **建议** | 复用 `ia-nav-qa.mjs` 的 session 注入，或 smoke 接受登录页并单独断言 redirect |
| **优先级** | P1 — 当前脚本无法作为「已登录 IA」回归 |

### 问题 FN-2 · 路由 smoke 需先起 dev

| 项 | 内容 |
| --- | --- |
| **现象** | dev 未监听 5180 时 22/22 `ERR_CONNECTION_REFUSED` |
| **建议** | 文档化前置步骤，或脚本内等待 `UI_QA_URL` 健康检查 |

### 通过 · 导航 QA ✅

| 项 | 内容 |
| --- | --- |
| **命令** | `UI_QA_URL=http://127.0.0.1:5180 node scripts/ia-nav-qa.mjs` |
| **前提** | `apps/finance/.env.local` 含 Supabase + 测试账号 |
| **结果** | **31/31 passed**（desktop + mobile 导航、Hub tab、滚动） |

### 复现

```bash
cd apps/finance && npm run dev -- --port 5180 --host 127.0.0.1
UI_QA_URL=http://127.0.0.1:5180 node scripts/ia-nav-qa.mjs   # 需 .env.local
UI_QA_URL=http://127.0.0.1:5180 node scripts/ia-route-smoke.mjs  # 当前会 fail（FN-1）
```

---

## Music (`music-os`)

**命令：** `npm run test:sw:full`（build + `scripts/qa-service-worker.mjs`）

### 结果 ✅

- **21/21 passed**（static / lifecycle / precache / fetch / purge / trim / integration）
- 报告：`apps/music/.qa-screenshots/service-worker/REPORT.md`

### 缺口 M-1 · 无 UI 流 E2E

| 项 | 内容 |
| --- | --- |
| **现状** | 仅有 Service Worker 层 E2E；无 Playwright 覆盖播放/歌单/导航 |
| **建议** | 后续增加 `test:e2e`（可参考 Finance `ia-nav-qa` 模式） |
| **优先级** | P2 |

---

## 跨 App 基础设施

### 问题 X-1 · Portal 与 Fitness 争用 5173

| 项 | 内容 |
| --- | --- |
| **现象** | Portal 默认 Vite dev 占用 `5173`；Fitness Playwright 默认同端口 |
| **影响** | Fitness `test:e2e` 静默连错 app，全部失败 |
| **建议** | Portal 改端口（如 5195）或 Fitness CI 强制独立端口 |

### 问题 X-2 · 并行跑 E2E 时的 shell 退出码

| 项 | 内容 |
| --- | --- |
| **现象** | `cmd | tee log; EXIT=$?` 在 pipeline 下 `$?` 可能为 `tee` 的 0，而非测试脚本 exit code |
| **建议** | 使用 `set -o pipefail` 或 `${PIPESTATUS[0]}` |

---

## 建议修复优先级

| 优先级 | ID | App | 摘要 |
| --- | --- | --- | --- |
| P0 | F-0 / X-1 | Fitness | 修复 5173 端口/reuseExistingServer，避免误报 |
| P1 | FN-1 | Finance | `ia-route-smoke` 注入 session 或拆分未登录 smoke |
| P1 | P-2 | Planner | 桌面 Playwright 项目与 FAB/侧栏添加路径对齐 |
| P2 | P-1 | Planner | Insight 批量排期行为或测试同步 |
| P2 | P-3 | Planner | 合并/单例 Supabase client，消除 GoTrue 警告 |
| P2 | M-1 | Music | 补充 UI E2E |

---

## 相关文档

- [`NETLIFY.md`](./NETLIFY.md) — 四站部署
- [`SUPABASE.md`](./SUPABASE.md) — 共享 Auth
- [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) — 功能阶段

_本文件随 E2E 跑批更新；修复 issue 后请在对应条目打 ✅ 并注明 commit/日期。_
