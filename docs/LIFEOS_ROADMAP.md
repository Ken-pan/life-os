---
title: Life OS Roadmap
owner: kenpan
last_verified: 2026-07-11-lifecycle
review_cadence: weekly
doc_role: status-hub
priority_model: 2026-07-11-lifecycle-correction
---

# Life OS Roadmap

> **读这份文档要回答三件事：** 现在在做什么？接下来做什么？明确不做什么？
>
> 详细阶段史、Wave 完成记录、提取决策矩阵 → `[roadmap/](./roadmap/README.md)`
> **六 app 产品排期** → `[roadmap/apps/](./roadmap/apps/README.md)`
>
> **状态口径（2026-07-10 深度复核）：** 对照生产 HTTP、迁移文件、设备 gate 与 Antigravity 证据；修正 Paper API 404 误判、Slice 1.1 已修项、FT-P2 代码发货与 P-SCHED-0 根因锚点。

## 深度复核摘要（2026-07-10）

| 项                      | 原记录                      | 复核结论                                                                                                                                                                                           |
| ----------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P-MOVE-BLOCK**        | 生产 `/api/paper/today` 404 | **已关闭** — 2026-07-11 设备 `ApiClient` → **200**；schema、cache、UI、retry、401 last-good 行为 PASS                                                                                                     |
| **P-MOVE-UI Slice 1.1** | toolbar P0 blocker          | **代码已修** — `52ae55e0`（InkModeController）· `d7c52858`（QML）· visual delta gate PASS。**剩余：** 设备复验后进入 Slice 2                                                                       |
| **FT-P2**               | §Next                       | **已发货** — migration `20260710203000` **远程已应用**（Supabase 复核）· Portal UI · verify PASS                                                                                                   |
| **P-SCHED-0 SCH-0**     | legacy tags 崩溃            | **根因：** `migrateTask()` 不补 `tags: []`（`persist/migrate.js`）；消费端 `taskIndex.js` 等直接 `for (task.tags)`                                                                                 |
| **P-SCHED-0 SCH-10**    | mobile 无裁切               | baseline **未**加 `standalone-pwa` — **待** `qa:pwa` / iOS Sim                                                                                                                                     |
| **PaperOS 生命周期**    | 仅 UI/sync                  | **缺口** — 启动/退出/睡眠/唤醒/崩溃 → `**P-MOVE-SYS-`\*\*\*                                                                                                                                        |

## PaperOS 系统生命周期（2026-07-11）

PaperOS 正升级为主 **device Shell**。在 **P-MOVE-VERIFY** 之后、**P-MOVE-6** 之前插入 `**P-MOVE-SYS`**；Slice 2 可做 IA，真机合并不绕过 **SYS-1\*\*。

**启动模式（2026-07-11 定案）：** **Mode A — Xochitl 默认**；架构 **A 默认、B-ready**（`SYS-3` Beta「解锁后自动进入 PaperOS」，默认 Off）。

```text
VERIFY ✅ → SYS-0 🟡 accepted → SYS-1 launch-surface discovery 🔄 → SYS-1 impl 🔒 → SYS-2 🔒 → P-MOVE-6 🔒 → SYS-GATE 🔒
```

**当前（2026-07-11）：** SYS-0 accepted · SYS-1A closed · SYS-1B active/incomplete · SYS-1 implementation blocked · SYS-2 hard blocked。

`[AGENT_WORKSTREAMS.md](./roadmap/AGENT_WORKSTREAMS.md)` §PaperOS lifecycle · `[qa/paperos-device-lifecycle-discovery.md](./qa/paperos-device-lifecycle-discovery.md)` §产品假设

## 一句话

Life OS 是 **六 app 个人生活平台**（Planner / Fitness / Finance / Music 四生产站 + Portal 启动器 + **Home 实验**），通过共享身份、事件总线和设计 token 保持各 app 独立又一致。

## 状态面板（每周扫一眼）

图例：✅ 完成 · 🟡 进行中 · ⏳ 已排期 · ⏸️ 搁置 · ❌ 未开始

**性价比标签：** 🔥 最高 · ◆ 高 · ○ 按需 · ✗ 暂缓

### Now — 当前在飞（按推荐顺序）

| 序  | ID                | 主题                                   | App     | 桶      | ROI | Agent 线                     | 验收                                                                                     |
| --- | ----------------- | -------------------------------------- | ------- | ------- | --- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | **P-SCHED-0**     | 日程视图 debug + 可用性闭环            | Planner | Product | 🔥  | A · **Claude Fable**         | baseline ✅ · 修 `migrateTask` tags · PWA 滚动复测                                       |
| 2   | **FT-P5**         | 替代动作完整训练流                     | Fitness | Product | 🔥  | C · Codex · UI closure 待审 | 工程 **PASS** · 产品 **BLOCKED** — [`FT-P5-substitution.md`](./apps/fitness/docs/FT-P5-substitution.md) |
| 3   | **F-P6**          | 支出审核（商品明细 + 后续处理）        | Finance | Product | 🔥  | F · Fable owner              | Discovery **CONDITIONAL PASS**（2026-07-11）；F-P6a **BLOCKED** — [`apps/finance/docs/FP6_PURCHASE_REVIEW.md`](./apps/finance/docs/FP6_PURCHASE_REVIEW.md) |
| 4   | **P-MOVE-UI**     | PaperOS Slice 1.1 设备复验 → Slice 2   | Planner | Product | ◆◆  | B · Cursor Auto + Codex      | 1.1 代码 ✅ · 见 `qa/paperos-next-ui-update-guide.md`                                    |
| 5   | **P-MOVE-SYS-1B** | Launcher Document launch-surface discovery | Planner | Product | ◆◆  | B · Codex + Ken              | read-only · **ACTIVE / INCOMPLETE** — [`qa/paperos-device-lifecycle-discovery.md`](./qa/paperos-device-lifecycle-discovery.md) |
| 6   | **P-MOVE-5**      | PaperOS controlled write staging gate  | Planner | Product | ◆   | E · Codex                    | 数据层可并行；**非**日用发布门槛                                                         |

**Agent 分线全文：** `[roadmap/AGENT_WORKSTREAMS.md](./roadmap/AGENT_WORKSTREAMS.md)`

**FT-P5 进度：** 状态模型与归因工程 gate **PASS**（focused tests 8/8）；产品 gate **BLOCKED** — closure 指南 [`apps/fitness/docs/FT-P5-ui-closure-guide.md`](./apps/fitness/docs/FT-P5-ui-closure-guide.md)（推荐方案 1 · PR-A/B/C）。

**P-SCHED-0 进度：** Antigravity baseline ✅；**开放 P0** = `migrateTask` 缺 `tags` 默认（`migrate.js`）；**SCH-10** 待 `standalone-pwa` 专项复测。

**PaperOS 数据面：** **P-MOVE-VERIFY PASS**（2026-07-11）— 设备生产 200 + schema + cache/UI refresh；证据见 [`qa/paperos-data-plane-verify-2026-07-11.md`](./qa/paperos-data-plane-verify-2026-07-11.md)。

**PaperOS 生命周期：** VERIFY ✅ · SYS-0 accepted · **SYS-1 launch surface 未解决**（SYS-1B discovery 进行中）— [`qa/paperos-device-lifecycle-discovery.md`](./qa/paperos-device-lifecycle-discovery.md)。

**2026-07-09 已验收（见 §Shipped）：** Phase 0–6 — **F-P3** · **G-P4b-M/H** · **G-P6** · **G-P8** · **G-P9** · **M-P5** · **H-P6a** · **P-P2** · **FT-P0/FT-P1** · **I-P1.5b** · CI 接线。

### Next — 已排期

| ID                  | 主题                              | App     | 桶      | ROI | Agent 线    | 触发 / 范围                                                                    |
| ------------------- | --------------------------------- | ------- | ------- | --- | ----------- | ------------------------------------------------------------------------------ |
| **P-UIUX-0**        | Planner 全站 UI/UX 走查（非日程） | Planner | Product | ◆   | A · Fable   | Today/Inbox/Projects 截图走查；日程后并行                                      |
| **P-ATTACH-0**      | Task / Project 附件底座           | Planner | Core    | ◆◆  | Codex       | Supabase Storage + metadata；在线上传/删除/预览                                |
| **P-P4**            | Today 与 Portal 今日任务计数对齐  | Planner | Growth  | ◆   | D · Codex   | 同账号、同日期口径一致                                                         |
| **P-MOVE-SYS-1**    | enter / exit / recovery · systemd | Planner | Product | ◆◆  | B · Codex   | **BLOCKED** — launch surface 未解决 · SYS-1A closed                              |
| **P-MOVE-SYS-2**    | sleep / wake / idle · sync 补偿   | Planner | Product | ◆◆  | B · Codex   | **NOT STARTED** — hard blocked by SYS-1                                        |
| **P-MOVE-SYS-3**    | 生命周期 Settings UI              | Planner | Product | ◆   | B · Cursor  | Fable ≤30m review                                                              |
| **P-MOVE-6**        | Sync now + 活跃期定时 + 唤醒补偿  | Planner | Product | ◆   | E · Codex   | **依赖 SYS-2**；非单纯 15min timer                                             |
| **P-MOVE-SYS-GATE** | 真机可靠性矩阵                    | Planner | Product | ◆◆  | Ken + Codex | `[qa/paperos-device-lifecycle-gate.md](./qa/paperos-device-lifecycle-gate.md)` |
| **F-P1b**           | Finance 扩展 last sync + retry    | Finance | Growth  | ◆   | D · Codex   | popup 显示 timestamp、失败原因与重试                                           |
| **H-P7**            | Home 多项目 localStorage 切换     | Home    | Product | ◆   | Fable       | H-W0–W5 发货后的下一项                                                         |

分 app 细节 → `[roadmap/apps/](./roadmap/apps/README.md)` · Growth / Home Integration → `[roadmap/GROWTH.md](./roadmap/GROWTH.md)` · `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`

### 推荐执行顺序（2026-07-10 状态复核 · 单人）

研判全文 → `[roadmap/POTENTIAL.md](./roadmap/POTENTIAL.md)`

```text
Phase 7 — 日程 + 训练 + 审核（本周 🔥）
  P-SCHED-0 migrateTask tags + PWA 复测 · FT-P5 UI closure · F-P6a 审核 UI

Phase 8 — PaperOS 生命周期 + 写路径
  VERIFY ✅ → SYS-0 accepted → SYS-1B launch discovery → SYS-1 impl → SYS-2 → SYS-3
  → P-MOVE-6（SYS-2 后）→ SYS-GATE · P-MOVE-5 staging 可并行
  Slice 2 IA 可早做；真机合并等 SYS-1

Phase 9 — 半天级跨站快赢（Codex 并行）
  F-P1b · P-P4

Phase 10 — 产品增量
  P-UIUX-0 Planner 走查 · P-ATTACH-0 附件 · H-P7 Home 多项目

已完成（2026-07-10）
  FT-P2 Portal Fitness「今日是否已练」代码 + migration · PaperOS Slice 1.1 commits

已完成（2026-07-08 Home 墙图）
  H-W0–W2c · Wave A/B/C UX — 见 `[qa/home-spatial-uiux-audit-2026-07-08.md](./qa/home-spatial-uiux-audit-2026-07-08.md)`

已完成（2026-07-09 Phase 6）
  H-P6a Home 储藏元数据 → core_*
  G-P4b-H Portal 第五卡（储藏审计 · 实验）

已完成（2026-07-09 Phase 5）
  M-P5 qa:rec-behavior 6/6 ✅
  G-P8 · G-P9 · P-1 遮罩 ✅
```

**已完成（2026-07-08 四轮计划）：** I-P1 redirect/DB · P2 `schema.sql` · CI-补 · QA-F0 · G-P1–G-P3 · G-P5 · M-P1/F-P1 代码 · AppBrandSwitcher — 详情 `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`。

### Shipped — 近期已落地（摘要）

| 主线        | 摘要                                                                                | 详情                                                                   |
| ----------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Core        | **F-P3** Finance STS 口径统一 · **P-P2** Planner Insight E2E 22/22                  | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-09                |
| Growth      | **FT-P2** Portal Fitness `workedOutToday` · **G-P4b-H** · **G-P8/G-P9** · **M-P5**  | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` · `todaySummaryFormat.js` |
| Design      | Portal UI 走查 **P-1–P-12** ✅ · **P-5b/P-12**                                      | `[qa/portal-screenshot-audit.md](./qa/portal-screenshot-audit.md)`     |
| Integration | **FT-P1** / **I-P1.5b** 完练 → Planner 打卡                                         | `fitness_workout_event_trigger` migration                              |
| Infra       | CI `planner-e2e-desktop` · `finance-ia-routes` · `portal-qa-smoke`；FT-P0 **20/20** | `.github/workflows/ci.yml`                                             |
| Integration | `core_profiles` 远程 ✅；`life_events` outbox + Planner inbox ✅                    | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md)`                   |
| Platform    | C-P0–C-P1 ✅；C-P2 Wave 1–3 P1+ ✅                                                  | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`                         |
| Design      | D-P0–D-P5 ✅（tokens + catalog 172 smoke / 80 snapshots）                           | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`                             |
| Integration | I-P0 生产 SSO E2E ✅；H-P2/H-P3 Home SSO + redirect ✅                              | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`                           |
| Growth      | G-P4 Portal 今日摘要 ✅；G-P2/F-P1/M-P1 生产验收 ✅                                 | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                             |
| Integration | I-P1 Portal DB + redirect · P2 `schema.sql` · G-P1–G-P3 · G-P5 · CI-补 · QA-F0      | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`                           |
| Portal      | `portal.kenos.space` 读 `core_*`（继续/默认跳转/角标/今日摘要/PWA 引导）            | `apps/portal`                                                          |
| Platform    | AppBrandSwitcher 六站侧栏跨 app 切换（Svelte）                                      | `packages/platform-web` · `packages/theme/launcher.js`                 |
| Home        | `home.kenos.space` 生产；SSO + PWA + 平面 UX ✅（H-P5）；H-P4 云同步搁置            | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`              |
| CI          | build + design-catalog（smoke/a11y/snapshots）+ integration-smoke 进 GHA            | `.github/workflows/ci.yml`                                             |

完整发货记录与 commit 锚点 → `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`

### Parked — 搁置 / 实验

| ID                   | 说明                                                   |
| -------------------- | ------------------------------------------------------ |
| **I-P2** 跨应用智能  | 依赖更多 `life_events` 消费端                          |
| **H-P4** Home 云同步 | spatial 项目 Supabase 持久化（现 `localStorage` only） |

---

## Not doing（防止 scope creep）

直到对应阶段触发，**明确不做**：

| 类别     | 不做的事                                                                      | 原因                                                    |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| 工具链   | Jira / ProductPlan / 重型 PM SaaS                                             | 单人团队；repo 内 Markdown 即真源                       |
| 设计流程 | Storybook-first / **Figma / Figma-first**                                     | 无 Figma；已定 token-first + design-catalog             |
| 架构     | 合并各 app 业务表；app 互引                                                   | 边界硬规则                                              |
| 抽象     | `sync.js` 引擎、`nav.js` 内容、业务 Row 组件                                  | 见 `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)` §不提取 |
| 产品     | Home 升四站同级（云同步、默认 Launcher、life_events）                         | Home 实验性；H-P4 搁置；H-P5 平面 UX ✅；H-P2/3 SSO ✅  |
| 产品     | I-P2 智能推荐；无场景的 `life_events` 扩展                                    | I-P2 无消费者                                           |
| 产品     | 全模块 AI Life OS；第三方 SaaS 聚合（Todoist/Notion/Chase）；自动打电话 Agent | 对标 FluxOS/PAI/Iddu；单人不可维护                      |
| 页面     | production app 页面 token 迁移；六 app 全量 a11y audit                        | D 线只做共享 primitive + catalog                        |
| Platform | ~~Finance `ui-react` / nav mirror / i18n 统一~~ Finance SvelteKit 迁移已完成  | 见 Finance SvelteKit 分支 ✓                             |

---

## 架构不变量（Present）

```text
严格边界 · 统一身份 · 事件驱动 · 受控互通
```

| 规则         | 要点                                                                 |
| ------------ | -------------------------------------------------------------------- |
| 依赖         | `@life-os/contracts` 为根；`apps/*` **禁止**互引                     |
| 数据         | 业务表各 app 自有；跨 app 走 `core_*` 或 `life_events`               |
| 身份         | `auth.uid()` + `.kenos.space` 跨子域 Cookie（`setupCrossDomainSSO`） |
| 设计         | `packages/design-tokens` → generated CSS；catalog 只做 preview       |
| Package 方向 | `contracts` ← `platform-web` ← `apps`；`theme` / `sync` 侧向共享     |

Package 依赖表、提取决策矩阵、do-not-abstract 全表 → `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)`

契约白名单 → `[architecture/contracts.md](./architecture/contracts.md)`

---

## 主线速览

命名：`I-*` Integration · `C-*` Platform · `D-*` Design · `G-*` Growth · `P-P*`/`QA-P*` Planner · `FT-P*` Fitness · `F-P*` Finance · `M-P*` Music · `H-P*` Home · `H-W*` Home 空间编辑（墙图三步编辑器）

| 主线                 | 当前状态                                                    | 深度文档                                                                       |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **I-P0** 统一身份    | ✅ 生产 E2E（2026-07-09）                                   | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p0)`                      |
| **I-P1** Portal      | ✅ 已上线；Growth G-P1–G-P5 已接                            | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p1)`                      |
| **I-P1.5** 事件中心  | ✅ 管道通；**I-P1.5b** Fitness 完练打卡 ✅（2026-07-09）    | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p15)`                     |
| **G-P1–G-P5** Growth | ✅ 生产验收完成（含 F-P1/G-P2）                             | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                                     |
| **H-P0** Home 实验   | 🟡 已部署；SSO + PWA + H-P5 平面 UX ✅；H-P4 云同步搁置     | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`                      |
| **H-W** 空间编辑     | ✅ **H-W0–W5** · Wave A/B/C UX · `test:plan-edit` 13 checks | `[roadmap/apps/home-spatial-editor.md](./roadmap/apps/home-spatial-editor.md)` |
| **C-P1+** 平台扩容   | 🟡 Finance 部分接入；低优先                                 | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`                                 |
| **D-P6** 设计系统    | ✅ catalog a11y gates（2026-07-08）                         | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`                                     |

### 六 app 一览

| App     | 层级   | URL                                                | Workspace    | SSO | Portal | Top Next（→ 分卷）                           |
| ------- | ------ | -------------------------------------------------- | ------------ | --- | ------ | -------------------------------------------- |
| Planner | 生产   | [planner.kenos.space](https://planner.kenos.space) | `planner-os` | ✅  | ✅     | **P-SCHED-0** · **SYS-1B** · P-MOVE-UI |
| Fitness | 生产   | [fitness.kenos.space](https://fitness.kenos.space) | `fitness-os` | ✅  | ✅     | **FT-P5** 工程 ✅ · 产品 UI closure · FT-P2 ✅ |
| Finance | 生产   | [finance.kenos.space](https://finance.kenos.space) | `finance-os` | ✅  | ✅     | **F-P6** 支出审核 · F-P1b 按需               |
| Music   | 生产   | [music.kenos.space](https://music.kenos.space)     | `music-os`   | ✅  | ✅     | M-P5 ✅ · 维护推荐管道                       |
| Portal  | 启动器 | [portal.kenos.space](https://portal.kenos.space)   | `portal`     | ✅  | —      | 当前无阻塞项；维护 smoke                     |
| Home    | 实验   | [home.kenos.space](https://home.kenos.space)       | `home-os`    | ✅  | ✅     | **H-P7** 多项目切换                          |

**分卷：** `[roadmap/apps/](./roadmap/apps/README.md)` · 插件：Finance OS Sync — `apps/finance/extension`

部署与 Site ID → `[ops/netlify.md](./ops/netlify.md)` · Portal → `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p1)` · Home → `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`

## 验收命令

```bash
./scripts/verify-life-os-identity-p0.sh    # I-P0
./scripts/test-outbox-trigger.sh --smoke   # I-P1.5
npm run check:lifeos-boundaries            # C-P0
npm run test:viewport -w home-os           # H-P5 平面定位（需 dev/preview）
npm run test:plan-edit -w home-os          # H-W 墙图 smoke（13 checks）
npm run validate:tokens                    # D 线 token 完整性
npm run test:design-catalog                # 172 smoke
npm run test:design-catalog:snapshots    # 80 pixel baselines
```

**CI（`.github/workflows/ci.yml`）：** build · design-catalog · integration-smoke · planner-e2e-desktop · finance-ia-routes · **portal-qa-smoke** · **music-qa-rec-behavior**（secrets 缺则 skip）。

## 运维索引

| 主题                          | 文档                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| Supabase 迁移 / `schema.sql`  | `[ops/supabase.md](./ops/supabase.md)`                                |
| Netlify 六站                  | `[ops/netlify.md](./ops/netlify.md)`                                  |
| 契约                          | `[architecture/contracts.md](./architecture/contracts.md)`            |
| 事件 RFC                      | `[architecture/events-rfc.md](./architecture/events-rfc.md)`          |
| PWA / iOS                     | `[qa/pwa-ios.md](./qa/pwa-ios.md)`                                    |
| 文档地图                      | `[README.md](./README.md)` · `[MAINTENANCE.md](./MAINTENANCE.md)`     |
| Growth / Portal / 单 App 闭环 | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                            |
| **六 app 产品排期**           | `[roadmap/apps/](./roadmap/apps/README.md)`                           |
| **潜力研判（ROI 排序）**      | `[roadmap/POTENTIAL.md](./roadmap/POTENTIAL.md)`                      |
| **Agent 执行分线**            | `[roadmap/AGENT_WORKSTREAMS.md](./roadmap/AGENT_WORKSTREAMS.md)`      |
| 历史归档 / 分卷               | `[roadmap/](./roadmap/README.md)` · `[archive/](./archive/README.md)` |

## 维护约定

详见 `[MAINTENANCE.md](./MAINTENANCE.md)`。Hub 只维护 §Now / §Next / §Shipped / §Not doing；阶段史与证据写入 `roadmap/` 分卷。

_旧版单文件长篇阶段史已拆分至 `docs/roadmap/`（2026-07-08 结构优化）。_
