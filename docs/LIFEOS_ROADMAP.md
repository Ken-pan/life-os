---
title: Life OS Roadmap
owner: kenpan
last_verified: 2026-07-12-paperos-device-gate
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
> **状态口径（2026-07-12 device gate）：** 对照生产 HTTP、迁移文件与两次 exact-binary PaperOS 真机 gate；PR #27/#28 当前均 BLOCKED，未 un-draft。Canonical ticket ID → [`roadmap/TICKET_NAMING.md`](./roadmap/TICKET_NAMING.md)。

## 深度复核摘要（2026-07-11 · P-SCHED-0）


| 项                       | 原记录                       | 复核结论                                                                                                                                                                |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P-MOVE-BLOCK**        | 生产 `/api/paper/today` 404 | **路由正常** — `curl` 无 token → **401**；`_redirects` + `apps/planner/netlify/functions` 已接线。2026-07-09 Shell MVP 的 404 为当时测试窗口现象。**剩余：** 设备 + token + Netlify env 端到端复验 |
| **P-MOVE-UI Slice 1.1** | toolbar P0 blocker        | **代码已修** — `52ae55e0`（InkModeController）· `d7c52858`（QML）· visual delta gate PASS。**剩余：** 设备复验后进入 Slice 2                                                           |
| **FT-P2**               | §Next                     | **已发货** — migration `20260710203000` **远程已应用**（Supabase 复核）· Portal UI · verify PASS                                                                                |
| **P-SCHED-0 SCH-0**     | legacy tags 崩溃            | **PASS — 根因已修** — `cb11fbcc`：`migrateTask()` 在唯一边界输出合法 `tags: string[]`；migration unit · check · build 均通过                                                                 |
| **P-SCHED-0 SCH-10**    | mobile 无裁切                | **仍开放** — PWA mobile sanity（Today/Settings/Calendar）✅；standalone shell guard / `qa:mobile-scroll` 仍失败；**真机 iPhone Home Screen standalone 未验**                                      |
| **P-SCHED-0 整体**        | 进行中                       | **BLOCKED** — 无已确认产品 P0；剩余为测试注入/fixture 债务 + 物理 standalone 签收                                                                                              |
| **PaperOS 生命周期**        | 仅 UI/sync                 | **缺口** — 启动/退出/睡眠/唤醒/崩溃 → `**P-MOVE-SYS-*`**                                                                                                                        |

| 项                                                              | 原记录                      | 复核结论                                                                                                                                                                                 |
| --------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PAPR.DATA.verify**（legacy `P-MOVE.verify` · `P-MOVE-BLOCK`） | 生产 `/api/paper/today` 404 | **已关闭** — 2026-07-11 设备 `ApiClient` → **200**；schema、cache、UI、retry、401 last-good 行为 PASS                                                                                    |
| **PAPR.UI.1.1**                                                 | toolbar P0 blocker          | **PR #27 真机 BLOCKED** — launch/Drawer/Gallery/recovery PASS；`pmUTC/amUTC` FAIL；physical stylus tool/color gate 未完成。PR #28 亦因 locale + visual FAIL blocked。见 [`qa/paperos/ui-spec.md`](./qa/paperos/ui-spec.md) §4.8/§5.9 |
| **GYMS.PORTAL.2**                                               | §Next                       | **已发货** — migration `20260710203000` **远程已应用**（Supabase 复核）· Portal UI · verify PASS                                                                                         |
| **PLNR.SCHED.0.migrate** | legacy tags 崩溃            | **✅ Shipped** — #15 `migrateTask` 默认 `tags: []` + `migrate.integration.test.js`                                                                                       |
| **PLNR.SCHED.0** · `PLNR.SCHED.10.pwa`                          | mobile 无裁切               | **10A** simulated ✅ · **migrate ✅ #15** · **10B** 真机 iOS PWA 待 Ken                                                                                   |
| **PaperOS 生命周期**                                            | 仅 UI/sync                  | **Discovery ✅ · 2026-07-12 主航道 Active** — `PAPR.SYS.1` design→分步 impl；明日 **最多强 AI 算力** → [`qa/paperos/README.md`](./qa/paperos/README.md) |

## PaperOS 系统生命周期（2026-07-11）

PaperOS 正升级为主 **device Shell**。在 **P-MOVE-VERIFY** 之后、**P-MOVE-6** 之前插入 **`P-MOVE-SYS`**；Slice 2 可做 IA，真机合并不绕过 **SYS-1**。

**启动模式（2026-07-11 定案）：** **Mode A — Xochitl 默认**；架构 **A 默认、B-ready**（`SYS-3` Beta「解锁后自动进入 PaperOS」，默认 Off）。

```text
VERIFY → SYS-0 → SYS-1 enter/exit → SYS-2 sleep/wake → SYS-3 → P-MOVE-6 → SYS-GATE
```

[`AGENT_WORKSTREAMS.md`](./roadmap/AGENT_WORKSTREAMS.md) §PaperOS lifecycle · [`qa/paperos-device-lifecycle-discovery.md`](./qa/paperos-device-lifecycle-discovery.md) §产品假设

## 一句话

Life OS 是 **六 app 个人生活平台**（Planner / Fitness / Finance / Music 四生产站 + Portal 启动器 + **Home 实验**），通过共享身份、事件总线和设计 token 保持各 app 独立又一致。

## 状态面板（每周扫一眼）

图例：✅ 完成 · 🟡 进行中 · ⏳ 已排期 · ⏸️ 搁置 · ❌ 未开始

**性价比标签：** 🔥 最高 · ◆ 高 · ○ 按需 · ✗ 暂缓

### Now — 当前在飞（按推荐顺序）


| 序  | ID                  | 主题                                         | App         | 桶      | ROI | Agent 线                    | 验收                                                                                                                                                                      |
| --- | ------------------- | -------------------------------------------- | ----------- | ------- | --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | **PAPR.SYS.***    | **PaperOS 设备生命周期（主航道）**           | **PaperOS** | Product | 🔥🔥 | **B · Ken + Codex 强算力**  | `PAPR.SYS.1` design→分步 impl · Slice 1.1 设备 · lifecycle gate                                                                                                           |
| 1   | **PLNR.SCHED.0**    | 日程视图 debug + 可用性闭环                  | Planner     | Product | 🔥  | A · Fable/Cursor | migrate ✅ #15 · 10.pwa ✅ #18 · **10b.ios** 待 Ken |
| 2   | **GYMS.SUB.5**      | 替代动作完整训练流                           | Fitness     | Product | 🔥  | C · Complete  | **✅ Complete** · Engineering PASS · Product gate PASS · #19 `67e72b81` |
| 3   | **FINC.PURCHASE.6** | 支出审核（商品明细 + 后续处理）              | Finance     | Product | 🔥  | F · Fable owner             | Discovery **CONDITIONAL PASS**（2026-07-11）；**`FINC.PURCHASE.6.a` BLOCKED** — [`apps/finance/docs/FP6_PURCHASE_REVIEW.md`](../apps/finance/docs/FP6_PURCHASE_REVIEW.md) |
| 4   | **PAPR.UI**         | PaperOS clean PR device closure               | **PaperOS** | Product | ◆◆  | B · Ken + Codex             | #27/#28 **BLOCKED** · 先修 `NoteStore` locale + test，再复验 #27；不得 un-draft                                                                                |
| 5   | **PLNR.CORE.4** / **FINC.SYNC.1b** | 快赢 — 计数对齐 / 扩展 sync 状态 | Planner / Finance | Growth | ◆ | D · Cursor / Codex（快赢副线） | ~0.5d 各 · 见 AGENT_WORKSTREAMS §快赢任务池                                                                                                                              |
| —   | **PAPR.WRITE.5**    | PaperOS controlled write staging gate        | **PaperOS** | Product | ◆   | E · Codex                   | **Deferred** — 复杂度高 · 不占明日主算力                                                                                                                                  |

**Agent 分线全文：** `[roadmap/AGENT_WORKSTREAMS.md](./roadmap/AGENT_WORKSTREAMS.md)`

**P-SCHED-0 进度（canonical：`fable/p-sched-0` · worktree `.claude/worktrees/p-sched-0`）：** Antigravity baseline ✅ · **SCH-0 PASS** `cb11fbcc` · PWA harness `29f0c2ed` · Planner build/check/unit ✅ · desktop E2E **72 passed / 8 skipped** · PWA mobile sanity ✅ · **无已确认产品 P0**。阻塞：**standalone shell guard**（Today `display` 断言 / Settings·Calendar `Execution context was destroyed`）· **`qa:mobile-scroll`** 同类失败 · isolated `schedule-usability.spec.js` fixture 债务 · **真机 iPhone Home Screen standalone 未验** · Fable 最终 sign-off 未完成。**F-P6a / P-UIUX-0 禁止开始。**

**PaperOS 生命周期：** 见 §PaperOS 系统生命周期 · **P-MOVE-SYS-0** 与 VERIFY 同一设备窗口优先。

**Agent 分线全文：** `[roadmap/AGENT_WORKSTREAMS.md](./roadmap/AGENT_WORKSTREAMS.md)`

**GYMS.SUB.5 进度：** 状态模型与归因工程 gate **PASS**（focused tests 8/8）；产品 gate **BLOCKED** — closure 指南 [`apps/fitness/docs/FT-P5-ui-closure-guide.md`](../apps/fitness/docs/FT-P5-ui-closure-guide.md)（推荐方案 1 · PR-A/B/C）。

**PLNR.SCHED.0 进度：** Antigravity baseline ✅ · **PLNR.SCHED.10a.sim** simulated PASS（2026-07-11）· **开放 P0** = `PLNR.SCHED.0.migrate`（`migrateTask` 缺 `tags` 默认 — **代码待合入**）· **`PLNR.SCHED.10b.ios`** 真机 PWA 待 Ken。

**PaperOS 数据面：** **`PAPR.DATA.verify` PASS**（2026-07-11）— 设备生产 200 + schema + cache/UI refresh；证据见 [`qa/paperos-data-plane-verify-2026-07-11.md`](./qa/paperos-data-plane-verify-2026-07-11.md)。

**PaperOS 生命周期：** `PAPR.DATA.verify` ✅ · `PAPR.SYS.0` accepted · `PAPR.SYS.1` architecture discovery **complete** · `PAPR.SYS.1b.jrn` conditional pass · **`PAPR.SYS.1` implementation paused / not started** — [`qa/paperos-device-lifecycle/README.md`](./qa/paperos-device-lifecycle/README.md)。

**PaperOS UI device gate（2026-07-12）：** PR #27 exact binary launch/Drawer/Gallery/recovery PASS，但 `pmUTC/amUTC` 与 physical stylus gate 阻塞；PR #28 routing/data/refresh PASS，但 note-tile whitespace、Today task truncation、Settings layout 与 locale FAIL。两 PR 均保持 draft。

**PaperOS UI device gate（2026-07-12）：** PR #27 exact binary launch/Drawer/Gallery/recovery PASS，但 `pmUTC/amUTC` 与 physical stylus gate 阻塞；PR #28 routing/data/refresh PASS，但 note-tile whitespace、Today task truncation、Settings layout 与 locale FAIL。两 PR 均保持 draft。

**2026-07-09 已验收（见 §Shipped）：** Phase 0–6 — **FINC.CORE.3** · **PORT.GROWTH.4b-M/H** · **PORT.GROWTH.6** · **PORT.GROWTH.8** · **PORT.GROWTH.9** · **MUSC.PIPE.5** · **HOME.PROJ.6a** · **PLNR.CORE.2** · **GYMS.CORE.0/GYMS.EVENTS.1** · **INTG.EVENTS.1b** · CI 接线。

### Next — 已排期


| ID                  | 主题                                | App     | 桶       | ROI | Agent 线     | 触发 / 范围                                                                        |
| ------------------- | --------------------------------- | ------- | ------- | --- | ----------- | ------------------------------------------------------------------------------ |
| **P-UIUX-0**        | Planner 全站 UI/UX 走查（非日程）          | Planner | Product | ◆   | A · Fable   | **禁止开始** — 须 P-SCHED-0 合并关闭后；Today/Inbox/Projects 截图走查                              |
| **P-ATTACH-0**      | Task / Project 附件底座               | Planner | Core    | ◆◆  | Codex       | Supabase Storage + metadata；在线上传/删除/预览                                         |
| **P-P4**            | Today 与 Portal 今日任务计数对齐           | Planner | Growth  | ◆   | D · Codex   | 同账号、同日期口径一致                                                                    |
| **P-MOVE-SYS-1**    | enter / exit / recovery · systemd | Planner | Product | ◆◆  | B · Codex   | 安全返回 xochitl + rm-sync · 无 Mac 进出                                              |
| **P-MOVE-SYS-2**    | sleep / wake / idle · sync 补偿     | Planner | Product | ◆◆  | B · Codex   | suspend 下 timer 不运行；唤醒 `lastSyncAt`                                            |
| **P-MOVE-SYS-3**    | 生命周期 Settings UI                  | Planner | Product | ◆   | B · Cursor  | Fable ≤30m review                                                              |
| **P-MOVE-6**        | Sync now + 活跃期定时 + 唤醒补偿           | Planner | Product | ◆   | E · Codex   | **依赖 SYS-2**；非单纯 15min timer                                                   |
| **P-MOVE-SYS-GATE** | 真机可靠性矩阵                           | Planner | Product | ◆◆  | Ken + Codex | `[qa/paperos-device-lifecycle-gate.md](./qa/paperos-device-lifecycle-gate.md)` |
| **F-P1b**           | Finance 扩展 last sync + retry      | Finance | Growth  | ◆   | D · Codex   | popup 显示 timestamp、失败原因与重试                                                     |
| **H-P7**            | Home 多项目 localStorage 切换          | Home    | Product | ◆   | Fable       | H-W0–W5 发货后的下一项                                                                |


分 app 细节 → `[roadmap/apps/](./roadmap/apps/README.md)` · Growth / Home Integration → `[roadmap/GROWTH.md](./roadmap/GROWTH.md)` · `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`

### 推荐执行顺序（2026-07-10 状态复核 · 单人）

研判全文 → `[roadmap/POTENTIAL.md](./roadmap/POTENTIAL.md)`

```text
Phase 7 — 日程 + 训练 + 审核（本周 🔥）
  P-SCHED-0 standalone guard + 真机 iPhone 签收（SCH-0 ✅）· FT-P5 · F-P6 待 P-SCHED-0 关单

Phase 8 — PaperOS 生命周期 + 写路径
  VERIFY → SYS-0 discovery → SYS-1 exit/recovery → SYS-2 sleep/wake → SYS-3 settings
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
  HOME.PROJ.6a Home 储藏元数据 → core_*
  PORT.GROWTH.4b-H Portal 第五卡（储藏审计 · 实验）

已完成（2026-07-09 Phase 5）
  MUSC.PIPE.5 qa:rec-behavior 6/6 ✅
  PORT.GROWTH.8 · PORT.GROWTH.9 · P-1 遮罩 ✅
```

**已完成（2026-07-08 四轮计划）：** I-P1 redirect/DB · P2 `schema.sql` · CI-补 · QA-F0 · G-P1–G-P3 · G-P5 · M-P1/F-P1 代码 · AppBrandSwitcher — 详情 `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`。

### Shipped — 近期已落地（摘要）


| 主线          | 摘要                                                                                 | 详情                                                                     |
| ----------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Core        | **F-P3** Finance STS 口径统一 · **P-P2** Planner Insight E2E 22/22                     | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` 2026-07-09                |
| Growth      | **FT-P2** Portal Fitness `workedOutToday` · **G-P4b-H** · **G-P8/G-P9** · **M-P5** | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)` · `todaySummaryFormat.js` |
| Design      | Portal UI 走查 **P-1–P-12** ✅ · **P-5b/P-12**                                        | `[qa/portal-screenshot-audit.md](./qa/portal-screenshot-audit.md)`     |
| Integration | **FT-P1** / **I-P1.5b** 完练 → Planner 打卡                                            | `fitness_workout_event_trigger` migration                              |
| Infra       | CI `planner-e2e-desktop` · `finance-ia-routes` · `portal-qa-smoke`；FT-P0 **20/20** | `.github/workflows/ci.yml`                                             |
| Integration | `core_profiles` 远程 ✅；`life_events` outbox + Planner inbox ✅                        | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md)`                   |
| Platform    | C-P0–C-P1 ✅；C-P2 Wave 1–3 P1+ ✅                                                    | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`                         |
| Design      | D-P0–D-P5 ✅（tokens + catalog 172 smoke / 80 snapshots）                             | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`                             |
| Integration | I-P0 生产 SSO E2E ✅；H-P2/H-P3 Home SSO + redirect ✅                                  | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`                           |
| Growth      | G-P4 Portal 今日摘要 ✅；G-P2/F-P1/M-P1 生产验收 ✅                                           | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                             |
| Integration | I-P1 Portal DB + redirect · P2 `schema.sql` · G-P1–G-P3 · G-P5 · CI-补 · QA-F0      | `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`                           |
| Portal      | `portal.kenos.space` 读 `core_*`（继续/默认跳转/角标/今日摘要/PWA 引导）                            | `apps/portal`                                                          |
| Platform    | AppBrandSwitcher 六站侧栏跨 app 切换（Svelte）                                              | `packages/platform-web` · `packages/theme/launcher.js`                 |
| Home        | `home.kenos.space` 生产；SSO + PWA + 平面 UX ✅（H-P5）；H-P4 云同步搁置                         | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`              |
| CI          | build + design-catalog（smoke/a11y/snapshots）+ integration-smoke 进 GHA              | `.github/workflows/ci.yml`                                             |


完整发货记录与 commit 锚点 → `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`

### Parked — 搁置 / 实验


| ID                 | 说明                                             |
| ------------------ | ---------------------------------------------- |
| **I-P2** 跨应用智能     | 依赖更多 `life_events` 消费端                         |
| **H-P4** Home 云同步  | spatial 项目 Supabase 持久化（现 `localStorage` only） |


---

## Not doing（防止 scope creep）

直到对应阶段触发，**明确不做**：


| 类别       | 不做的事                                                                  | 原因                                                  |
| -------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| 工具链      | Jira / ProductPlan / 重型 PM SaaS                                       | 单人团队；repo 内 Markdown 即真源                            |
| 设计流程     | Storybook-first / **Figma / Figma-first**                             | 无 Figma；已定 token-first + design-catalog             |
| 架构       | 合并各 app 业务表；app 互引                                                    | 边界硬规则                                               |
| 抽象       | `sync.js` 引擎、`nav.js` 内容、业务 Row 组件                                    | 见 `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)` §不提取 |
| 产品       | Home 升四站同级（云同步、默认 Launcher、life_events）                               | Home 实验性；H-P4 搁置；H-P5 平面 UX ✅；H-P2/3 SSO ✅          |
| 产品       | I-P2 智能推荐；无场景的 `life_events` 扩展                                       | I-P2 无消费者                                           |
| 产品       | 全模块 AI Life OS；第三方 SaaS 聚合（Todoist/Notion/Chase）；自动打电话 Agent          | 对标 FluxOS/PAI/Iddu；单人不可维护                           |
| 页面       | production app 页面 token 迁移；六 app 全量 a11y audit                        | D 线只做共享 primitive + catalog                         |
| Platform | ~~Finance `ui-react` / nav mirror / i18n 统一~~ Finance SvelteKit 迁移已完成 | 见 Finance SvelteKit 分支 ✓                            |


---

## 架构不变量（Present）

```text
严格边界 · 统一身份 · 事件驱动 · 受控互通
```


| 规则         | 要点                                                              |
| ---------- | --------------------------------------------------------------- |
| 依赖         | `@life-os/contracts` 为根；`apps/*` **禁止**互引                       |
| 数据         | 业务表各 app 自有；跨 app 走 `core_*` 或 `life_events`                    |
| 身份         | `auth.uid()` + `.kenos.space` 跨子域 Cookie（`setupCrossDomainSSO`） |
| 设计         | `packages/design-tokens` → generated CSS；catalog 只做 preview     |
| Package 方向 | `contracts` ← `platform-web` ← `apps`；`theme` / `sync` 侧向共享     |


Package 依赖表、提取决策矩阵、do-not-abstract 全表 → `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)`

契约白名单 → `[architecture/contracts.md](./architecture/contracts.md)`

---

## 主线速览

命名：**v2 APP3** — **`PAPR.*` PaperOS** · `PLNR.*` Planner · `FINC.*` Finance · `GYMS.*` Fitness · `MUSC.*` Music · `PORT.*` Portal/Growth · `HOME.*` Home · `INTG.*` Integration · `DSGN.*` Design · `PLAT.*` Platform · E2E **`QA-GYMS-0`**。对照 [`roadmap/TICKET_NAMING.md`](./roadmap/TICKET_NAMING.md)


| 主线                   | 当前状态                                                       | 深度文档                                                                           |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **I-P0** 统一身份        | ✅ 生产 E2E（2026-07-09）                                       | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p0)`                      |
| **I-P1** Portal      | ✅ 已上线；Growth G-P1–G-P5 已接                                  | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p1)`                      |
| **I-P1.5** 事件中心      | ✅ 管道通；**I-P1.5b** Fitness 完练打卡 ✅（2026-07-09）               | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p15)`                     |
| **G-P1–G-P5** Growth | ✅ 生产验收完成（含 F-P1/G-P2）                                      | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                                     |
| **H-P0** Home 实验     | 🟡 已部署；SSO + PWA + H-P5 平面 UX ✅；H-P4 云同步搁置                 | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`                      |
| **H-W** 空间编辑         | ✅ **H-W0–W5** · Wave A/B/C UX · `test:plan-edit` 13 checks | `[roadmap/apps/home-spatial-editor.md](./roadmap/apps/home-spatial-editor.md)` |
| **C-P1+** 平台扩容       | 🟡 Finance 部分接入；低优先                                        | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`                                 |
| **D-P6** 设计系统        | ✅ catalog a11y gates（2026-07-08）                           | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`                                     |


### 六 app 一览


| App     | 层级  | URL                                                | Workspace    | SSO | Portal | Top Next（→ 分卷）                               |
| ------- | --- | -------------------------------------------------- | ------------ | --- | ------ | -------------------------------------------- |
| Planner | 生产  | [planner.kenos.space](https://planner.kenos.space) | `planner-os` | ✅   | ✅      | **P-SCHED-0** · **VERIFY→SYS-0** · P-MOVE-UI |
| Fitness | 生产  | [fitness.kenos.space](https://fitness.kenos.space) | `fitness-os` | ✅   | ✅      | **FT-P5** · FT-P2 ✅                          |
| Finance | 生产  | [finance.kenos.space](https://finance.kenos.space) | `finance-os` | ✅   | ✅      | **F-P6** 支出审核 · F-P1b 按需                     |
| Music   | 生产  | [music.kenos.space](https://music.kenos.space)     | `music-os`   | ✅   | ✅      | M-P5 ✅ · 维护推荐管道                              |
| Portal  | 启动器 | [portal.kenos.space](https://portal.kenos.space)   | `portal`     | ✅   | —      | 当前无阻塞项；维护 smoke                              |
| Home    | 实验  | [home.kenos.space](https://home.kenos.space)       | `home-os`    | ✅   | ✅      | **H-P7** 多项目切换                               |


**分卷：** `[roadmap/apps/](./roadmap/apps/README.md)` · 插件：Finance OS Sync — `apps/finance/extension`

部署与 Site ID → `[ops/netlify.md](./ops/netlify.md)` · Portal → `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p1)` · Home → `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#h-p0)`

## 验收命令

```bash
./scripts/verify-life-os-identity-p0.sh    # INTG.IDENTITY.0
./scripts/test-outbox-trigger.sh --smoke   # INTG.EVENTS.1.5
npm run check:lifeos-boundaries            # PLAT.CONTRACTS.0 (legacy C-P0)
npm run test:viewport -w home-os           # HOME.PROJ.5 平面定位（需 dev/preview）
npm run test:plan-edit -w home-os          # H-W 墙图 smoke（13 checks）
npm run validate:tokens                    # D 线 token 完整性
npm run test:design-catalog                # 172 smoke
npm run test:design-catalog:snapshots    # 80 pixel baselines
```

**CI（`.github/workflows/ci.yml`）：** build · design-catalog · integration-smoke · planner-e2e-desktop · finance-ia-routes · **portal-qa-smoke** · **music-qa-rec-behavior**（secrets 缺则 skip）。

## 运维索引


| 主题                         | 文档                                                                    |
| -------------------------- | --------------------------------------------------------------------- |
| Supabase 迁移 / `schema.sql` | `[ops/supabase.md](./ops/supabase.md)`                                |
| Netlify 六站                 | `[ops/netlify.md](./ops/netlify.md)`                                  |
| 契约                         | `[architecture/contracts.md](./architecture/contracts.md)`            |
| 事件 RFC                     | `[architecture/events-rfc.md](./architecture/events-rfc.md)`          |
| PWA / iOS                  | `[qa/pwa-ios.md](./qa/pwa-ios.md)`                                    |
| 文档地图                       | `[README.md](./README.md)` · `[MAINTENANCE.md](./MAINTENANCE.md)`     |
| Growth / Portal / 单 App 闭环 | `[roadmap/GROWTH.md](./roadmap/GROWTH.md)`                            |
| **六 app 产品排期**             | `[roadmap/apps/](./roadmap/apps/README.md)`                           |
| **潜力研判（ROI 排序）**           | `[roadmap/POTENTIAL.md](./roadmap/POTENTIAL.md)`                      |
| **Agent 执行分线**             | `[roadmap/AGENT_WORKSTREAMS.md](./roadmap/AGENT_WORKSTREAMS.md)`      |
| 历史归档 / 分卷                  | `[roadmap/](./roadmap/README.md)` · `[archive/](./archive/README.md)` |


## 维护约定

详见 `[MAINTENANCE.md](./MAINTENANCE.md)`。Hub 只维护 §Now / §Next / §Shipped / §Not doing；阶段史与证据写入 `roadmap/` 分卷。

*旧版单文件长篇阶段史已拆分至 `docs/roadmap/`（2026-07-08 结构优化）。*
