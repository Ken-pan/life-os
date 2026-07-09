# Life OS E2E 测试问题记录

> **测试日期：** 2026-07-08–09（America/Los_Angeles）
> **环境：** 本地 monorepo，`CI=1`（Planner）/ 各 app 默认 Playwright 配置
> **原始日志：** `/tmp/lifeos-e2e-*.log`（本机；未入库）

## 总览

| App         | 命令                                         | 结果                         | 说明                                            |
| ----------- | -------------------------------------------- | ---------------------------- | ----------------------------------------------- |
| **Planner** | `cd apps/planner && CI=1 npm run test:e2e`   | ✅ desktop **22/22**         | **P-P2** ✅ `localDateKey()` 修复 P-1 Insight |
| **Fitness** | `cd apps/fitness && CI=1 npm run test:e2e` | ✅ **20/20** pass            | FT-P0 ✅（5190）                              |
| **Finance** | `qa:ia-routes` + `qa:ia-nav`                 | ✅ 22/22 + 31/31             | F-P0 ✅ `ia-qa-auth.mjs`（FN-1 已修）           |
| **Music**   | `test:sw:full` + `qa:ui-flow` + `qa:rec-behavior` | ✅ 21/21 + 15/15 + **6/6** (M-P5) | M-P2 + M-P5 ✅ |

**图例：** ✅ 通过 · ❌ 失败 · 🟡 部分通过 · ⚠️ 基础设施/配置问题

---

## Planner (`planner-os`)

**命令：** `CI=1 npm run test:e2e`（Playwright mobile + desktop，端口 5188）
**耗时：** ~16.3 min · **64 tests**（含 retry）

### 通过面

- **Desktop `[desktop]`**：**22/22** ✅（含 Insight 批量排期 — **P-P2** 2026-07-09）
- **Mobile `[mobile]`**：Insight 批量排期同步修复（`scheduling.js` `localDateKey()`）

### 问题 P-1 · Insight 批量排期（mobile + desktop）— ✅ 已修 2026-07-09

| 项           | 内容                                                                           |
| ------------ | ------------------------------------------------------------------------------ |
| **Spec**     | `tests/e2e.spec.js:409` — `Insight 批量排期无日期任务`                         |
| **根因**     | `scheduling.js` 用 UTC `toISOString()` 写 due，与 `todayKey()` 本地日不一致    |
| **修复**     | `localDateKey()` 本地日历键；desktop **22/22** pass                            |
| **Hub**      | **P-P2** §Shipped                                                              |

### 问题 P-2 · Desktop 项目与移动 UI 不匹配（19 个 fail）

| 项                      | 内容                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| **范围**                | `[desktop]` 下 `e2e.spec.js` 多数用例 + `screenshot-audit.spec.js` 3 项                                   |
| **现象**                | `getByTestId('fab-add')` 存在于 DOM 但 **不可见**（`display`/布局为移动端 FAB）                           |
| **典型错误**            | `locator.click: Test timeout` / `waiting for element to be visible`                                       |
| **根因**                | Playwright `desktop` project（1280×800）仍走移动壳；FAB 在桌面端隐藏，测试 helper `quickAddTask` 依赖 FAB |
| **建议**                | desktop project 改用侧栏/快捷键添加任务，或桌面 viewport 下显示 FAB；或 desktop 仅跑侧栏专用用例          |
| **已通过 desktop 用例** | `侧边栏导航（桌面端）`、部分只读路由/设置类用例                                                           |

### 问题 P-3 · 控制台警告（非阻断）

| 项       | 内容                                                         |
| -------- | ------------------------------------------------------------ |
| **现象** | `Multiple GoTrueClient instances detected`（`life_os_auth`） |
| **影响** | 未直接导致 fail；长期可能影响 SSO/会话稳定性                 |

### 复现

```bash
cd apps/planner && CI=1 npm run test:e2e
# 仅 mobile 核心：
cd apps/planner && CI=1 npm run test:e2e -- --project=mobile tests/e2e.spec.js
```

---

## Fitness (`fitness-os`)

### 问题 F-0 · 端口冲突（已修复 2026-07-08）✅

| 项       | 内容                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------- |
| **根因** | `playwright.config.js` 固定 `port: 5173` 且 `reuseExistingServer: true`；5173 被 Portal/Home 占用    |
| **修复** | Fitness `vite.config.js` dev 端口 **5190**；Playwright 同步 5190；CI 下 `reuseExistingServer: false` |
| **验收** | `cd apps/fitness && CI=1 npm run test:e2e` 或 `npm run test:e2e:ci`（dev 已跑在 5190 时）            |

### 问题 F-0 · 首次跑无效（历史记录）

| 项       | 内容                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| **命令** | `CI=1 npm run test:e2e`                                                                                                     |
| **现象** | 20/20 失败；`.hero-title` 等 Fitness 选择器全部找不到                                                                       |
| **根因** | `playwright.config.js` 固定 `port: 5173` 且 `reuseExistingServer: true`；当时 **5173 上是 Portal（HOME.OS）**，不是 Fitness |
| **证据** | `curl http://127.0.0.1:5173/` → `<title>HOME.OS</title>`                                                                    |

### 重跑结果 ✅

| 项       | 内容                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| **命令** | Fitness dev `@5190` + `FITNESS_E2E_BASE_URL=http://127.0.0.1:5190 npx playwright test --config playwright.e2e-ci.config.js` |
| **结果** | **20/20 passed**（~12.7s）                                                                                                  |
| **配置** | 新增 `apps/fitness/playwright.e2e-ci.config.js`（禁用 webServer，可指定 baseURL）                                           |

### 问题 F-1 · 默认 E2E 配置易踩坑（待修）

| 项         | 内容                                                                             |
| ---------- | -------------------------------------------------------------------------------- |
| **建议**   | `reuseExistingServer: !process.env.CI`；或与 Portal 错开端口（Portal 勿占 5173） |
| **优先级** | P1 — 否则 CI/并行 dev 会误报全红                                                 |

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

| 脚本                         | 用途                              |
| ---------------------------- | --------------------------------- |
| `scripts/ia-route-smoke.mjs` | 22 条 canonical 路由可渲染        |
| `scripts/ia-nav-qa.mjs`      | 桌面侧栏 + 移动底栏导航（需登录） |

### 问题 FN-1 · 路由 smoke 未注入 Auth — ✅ 已修复（F-P0）

| 项       | 内容                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| **命令** | `UI_QA_URL=http://127.0.0.1:5180 npm run qa:ia-routes`                             |
| **修复** | `scripts/ia-qa-auth.mjs` 共享模块；`ia-route-smoke.mjs` 登录 + 注入 `life_os_auth` |
| **结果** | **22/22 passed**（authenticated）                                                  |

### 问题 FN-2 · 路由 smoke 需先起 dev

| 项       | 内容                                              |
| -------- | ------------------------------------------------- |
| **现象** | dev 未监听 5180 时 22/22 `ERR_CONNECTION_REFUSED` |
| **建议** | 文档化前置步骤，或脚本内等待 `UI_QA_URL` 健康检查 |

### 通过 · 导航 QA ✅

| 项       | 内容                                                         |
| -------- | ------------------------------------------------------------ |
| **命令** | `UI_QA_URL=http://127.0.0.1:5180 node scripts/ia-nav-qa.mjs` |
| **前提** | `apps/finance/.env.local` 含 Supabase + 测试账号             |
| **结果** | **31/31 passed**（desktop + mobile 导航、Hub tab、滚动）     |

### 复现

```bash
cd apps/finance && npm run dev -- --port 5180 --host 127.0.0.1
UI_QA_URL=http://127.0.0.1:5180 node scripts/ia-nav-qa.mjs   # 需 .env.local
UI_QA_URL=http://127.0.0.1:5180 npm run qa:ia-routes         # 22/22 ✅（F-P0）
```

---

## Music (`music-os`)

**命令：** `npm run test:sw:full`（SW）· `npm run qa:ui-flow` / `test:e2e`（UI 流，**M-P2**）

### 结果 ✅

- **SW 21/21 passed**（static / lifecycle / precache / fetch / purge / trim / integration）
- 报告：`apps/music/.qa-screenshots/service-worker/REPORT.md`

### UI 流 E2E ✅（M-P2 · `scripts/qa-ui-flow.mjs`）

| 项       | 内容                                                                        |
| -------- | --------------------------------------------------------------------------- |
| **命令** | `MUSIC_QA_URL=http://127.0.0.1:5189 npm run qa:ui-flow`                     |
| **覆盖** | 8 条路由 smoke · IDB seed · 曲库播放 · 正在播放队列 · 导入页可达            |
| **Auth** | `ia-qa-auth.mjs` — `signInWithPassword` + `life_os_auth`（同 Finance F-P0） |

### 缺口 M-1 · 完整文件导入 E2E（可选）

| 项         | 内容                                                                      |
| ---------- | ------------------------------------------------------------------------- |
| **现状**   | UI 流用 IDB seed 模拟导入后状态；真实 mp3 导入见 `qa-import-pipeline.mjs` |
| **建议**   | CI 可选 `MUSIC_QA_IMPORT_FILE=…` 跑完整导入链                             |
| **优先级** | P3                                                                        |

---

## Portal (`portal`)

**命令：** `PORTAL_QA_URL=http://127.0.0.1:5195 npm run qa:screenshot` · `npm run qa:smoke` · `npm run test:cp`

### 通过面（2026-07-09 第二轮截图）

| 项 | 结果 |
| -- | ---- |
| **G-P8** pending 铃铛角标 + 状态区深链 | ✅ `.portal-inbox-btn` |
| **P-4/P-5/P-5b/P-7/P-9/P-11/P-12** UI 修复批次 | ✅ 2026-07-09 |
| **G-P9** smoke — 登录 · **五卡** · inbox href · ⌘K · Esc | ✅ |
| **G-P4b-M / G-P6 / G-P4b-H** | 五卡摘要 · 深链 · Home 储藏 | ✅ 截图 + smoke |
| **M-P5** Music 摘要有播放记录（seed 后） | ✅ `desktop-summary.png` |
| **P-1 / P-2 / P-6** 遮罩 · ICON_REGISTRY · `svelte-check` | ✅ |

### 遗留 UI

_无阻塞项；走查 P-4–P-12 均已关闭。见 [`portal-screenshot-audit.md`](./portal-screenshot-audit.md)。_

### 复现

```bash
cd apps/portal
npm run preview -- --host 127.0.0.1 --port 5195
PORTAL_QA_URL=http://127.0.0.1:5195 npm run qa:screenshot
PORTAL_QA_URL=http://127.0.0.1:5195 npm run qa:smoke
```

---

## 跨 App 基础设施

### 问题 X-1 · Portal 与 Fitness 争用 5173

| 项       | 内容                                                            |
| -------- | --------------------------------------------------------------- |
| **现象** | Portal 默认 Vite dev 占用 `5173`；Fitness Playwright 默认同端口 |
| **影响** | Fitness `test:e2e` 静默连错 app，全部失败                       |
| **建议** | Portal 改端口（如 5195）或 Fitness CI 强制独立端口              |

### 问题 X-2 · 并行跑 E2E 时的 shell 退出码

| 项       | 内容                                         |
| -------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| **现象** | `cmd                                         | tee log; EXIT=$?` 在 pipeline 下 `$?`可能为`tee` 的 0，而非测试脚本 exit code |
| **建议** | 使用 `set -o pipefail` 或 `${PIPESTATUS[0]}` |

---

## 建议修复优先级（与 [`POTENTIAL.md`](../roadmap/POTENTIAL.md) 对齐）

| 潜力序 | Hub ID      | App     | 摘要                         | 状态                    |
| ------ | ----------- | ------- | ---------------------------- | ----------------------- |
| —      | **F-P3**    | Finance | STS / Scenarios / Spend 对齐 | ✅ 2026-07-09           |
| —      | **G-P4b-M** | Portal  | Music 第四卡                 | ✅ 2026-07-09           |
| —      | **G-P6**    | Portal  | ⌘K 跨站深链                  | ✅ 2026-07-09 · 见走查  |
| —      | **P-P2**    | Planner | Insight 排期（P-1）          | ✅ desktop 22/22        |
| —      | **FT-P0**   | Fitness | E2E 20/20                    | ✅ 2026-07-09           |
| —      | **FT-P1**   | Fitness | workout_logged 触发器        | ✅ 2026-07-09           |
| —      | **M-P2**    | Music   | UI E2E `qa-ui-flow` 15/15    | ✅ 2026-07-09           |
| —      | **F-P0**    | Finance | route smoke 22/22            | ✅ 2026-07-09           |
| **M-P5**    | Music   | 行为分 `qa:rec-behavior` 6/6 | ✅ 2026-07-09           |
| —      | **G-P8**    | Portal  | pending → inbox 深链         | ✅ 2026-07-09 · 走查第二轮 |
| —      | **G-P4b-H** | Portal  | Home 第五卡                  | ✅ 2026-07-09           |
| —      | **H-P6a**   | Home    | 储藏元数据 → core_*          | ✅ 2026-07-09           |

---

## 相关文档

- [`portal-screenshot-audit.md`](./portal-screenshot-audit.md) — Portal UI 截图走查（第四轮 · UI 修复）
- [`../ops/netlify.md`](../ops/netlify.md) — 六站部署
- [`../ops/supabase.md`](../ops/supabase.md) — 共享 Auth
- [`../roadmap/POTENTIAL.md`](../roadmap/POTENTIAL.md) — ROI 研判
- [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) — 功能阶段

_本文件随 E2E 跑批更新；修复 issue 后请在对应条目打 ✅ 并注明 commit/日期。_
