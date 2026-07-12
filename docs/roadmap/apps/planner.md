# Planner Roadmap

**URL：** [planner.kenos.space](https://planner.kenos.space) · **Workspace：** `planner-os`
**Hub：** [`../../LIFEOS_ROADMAP.md`](../../LIFEOS_ROADMAP.md) · **E2E：** [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md#planner-planner-os)

## 一句话

个人任务/日历中枢 + AI 简报；Life OS 里 **`life_events` 唯一消费端**（Finance 账单 → inbox 任务）。

## 当前能力（生产）

| 域             | 状态 | 要点                                                                                                  |
| -------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| 任务流         | ✅   | Today / Inbox / Upcoming / Calendar / Search / Lists / Completed                                      |
| AI             | ✅   | Kimi 今日简报、任务拆分（`/api/ai/plan`）                                                             |
| 云同步         | ✅   | `planner_tasks` / `planner_lists` / `planner_projects` + LWW                                          |
| 项目管理       | ✅   | Projects 列表/详情 · Active/Paused/Shipped · 自动进度 · 共享 `@项目` + Sheet picker |
| PWA            | ✅   | SW + IndexedDB 提醒 + 通知                                                                            |
| Integration    | ✅   | SSO · `finance.bill_due` → `lifeEventsInbox.js`                                                       |
| Insight        | ✅   | 批量排期 E2E **PLNR.CORE.2** desktop 22/22 ✅                                                         |
| Paper Pro Move | 🟡   | PAPR.DEV.1–4 ✅ · **PAPR.DATA.verify** ✅ · **PAPR.SYS.*** 主航道 · **PAPR.WRITE.5** migration 待 apply |

## Next（按 ROI）

| ID                   | 主题                                       | ROI | 桶      | 投入 | Agent                  | 验收                                                                    | Hub         |
| -------------------- | ------------------------------------------ | --- | ------- | ---- | ---------------------- | ----------------------------------------------------------------------- | ----------- |
| **PLNR.SCHED.0**     | 日程视图 debug + 可用性闭环                | 🔥  | Product | 2–4d | Fable / Ken        | migrate ✅ #15 · 10.pwa ✅ #18 · **10b.ios** 待 Ken | §Now        |
| **P-TASK-DISPLAY-0** | 任务行小字 + 类别视觉规范                  | ◆   | Product | —    | **并入 PLNR.SCHED.0**  | [`planner-task-display-spec.md`](../../qa/planner-task-display-spec.md) | PLNR.UIUX.0 |
| **PLNR.UIUX.0**      | 全站 UI/UX 走查（Today/Inbox/Projects 等） | ◆   | Product | 1–2d | Fable（PLNR.SCHED 后） | 截图走查；含 P-TASK-DISPLAY 若未在 A 完成                               | §Next       |
| **PLNR.CAPTURE.0**   | iOS/移动端任务捕获统一 | ◆   | Product | gate | Code ✅ · Ken iOS | unit/E2E/截图 ✅；真机 IME + 键盘 gate ⏳ | PLNR.UIUX.0 |
| **PAPR.UI**          | PaperOS Slice 1.1 设备复验 → Slice 2       | ◆◆  | Product | XL   | Cursor Auto + Codex    | 1.1 代码 ✅ `52ae55e0`/`d7c52858` · 见 pro-move 分卷                    | §Now        |
| **PAPR.WRITE.5**     | Controlled write staging gate              | ◆   | Product | 1d   | Codex（Deferred）      | 代码 ✅ · **DB** `paper_device_actions` ❌ · staging gate 开放        | Deferred    |
| **PLNR.CORE.4**      | Today 计数与 `portal_today_summary` 对齐   | ◆   | Growth  | 0.5d | Cursor / Codex（快赢） | RPC ✅ · **计数口径未对齐**（`todayOpen` vs `remaining`）             | §Next Open  |
| **PAPR.SYNC.6**      | 定时缓存 + 手动 Sync now                   | ◆   | Product | 1–2d | Codex                  | scheduled cache + 性能 baseline（**BLOCKED on PAPR.SYS.2**）            | §Next       |
| **PLNR.ATTACH.0**    | Task / Project 附件底座                    | ◆◆  | Core    | 1–2d | Codex                  | Supabase Storage + metadata；在线上传/删除/预览                         | §Next       |
| **PLNR.ATTACH.1**    | 图片与截图体验                             | ◆   | Product | 1d   | Fable                  | paste / drag-drop / mobile picker / thumbnail / retry                   | —           |

### 近期已完成

| ID                                                    | 结果                                                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| PLNR.CORE.2 / PLNR.CORE.3 / PLNR.CORE.5 / PLNR.CORE.6 | E2E、Insight、事件徽章/深链、Fitness 打卡与 Auth 单例均已发货                                                                       |
| **PLNR.CAPTURE.0 code**                               | Tier 0 主区、`@` / project picker、IME、dirty guard、focus trap、undo 与 mobile/desktop E2E 已完成；真机 iOS gate 待 Ken |
| PAPR.DEV.1–4                                          | Launcher、离线读、CJK/分页、退出/崩溃恢复/systemd launcher 已通过                                                                   |
| **PAPR.DATA.verify**                                  | 设备生产 sync E2E PASS（2026-07-11）— [`paperos/data-plane-2026-07-11.md`](../../qa/paperos/data-plane-2026-07-11.md) |
| PLNR.PROJ.0–3                                         | 项目实体与远程表、Projects 列表/详情、QuickAddBar `@项目`、project chip 与只读 Roadmap/代码引用已落地（**Sheet 项目选择仍为 select**） |

## Supabase（ticket 状态 · 2026-07-12）

> **运维真源（三层：Migration / App / Gate）：** [`../../ops/supabase.md`](../../ops/supabase.md) §PlannerOS

| Hub Ticket | Migration 生产 | App | Gate | **状态** |
| ---------- | -------------- | --- | ---- | -------- |
| 结构化同步 | ✅ | ✅ | ✅ | **✅ Shipped** |
| **PLNR.PROJ.0–3** | ✅ `planner_projects` | ✅ | ✅ E2E | **✅ Shipped** |
| **PLNR.CORE.1** | ✅ push 表 | ✅ | 🟡 VAPID ops 按需 | **🟡 Shipped（schema+code）** |
| **PLNR.CORE.3** / **PLNR.CORE.5** | ✅ 平台 migration | ✅ inbox | ✅ | **✅ Shipped** |
| **PLNR.CORE.6** | N/A | ✅ | ✅ | **✅ Shipped** |
| **PAPR.DATA.verify** | ✅ snapshot RPC | ✅ | ✅ 2026-07-11 | **✅ Shipped** |
| **PAPR.WRITE.5** | ❌ `paper_device_actions` | ✅ `paperService` | ⏳ staging | **🟡 Code ✅ · DB blocked** |
| **PLNR.CORE.4** | ✅ RPC 已有 | ⏳ 计数未对齐 | ⏳ | **⏳ Open** |
| **PLNR.ATTACH.0** | ❌ | ❌ | ❌ | **❌ Not started** |
| **PAPR.SYNC.6** | 🔒 | 🟡 | 🔒 PAPR.SYS.2 | **🔒 Blocked** |

**非 DB：** **PLNR.SCHED.0.migrate** ✅ Shipped（#15）· 父 ticket **PLNR.SCHED.0** ⏳ Open（PWA 10.pwa / 10b.ios）

### Project / Attachment 设计边界

Planner 的项目系统只负责「当前执行状态」；repo roadmap 继续负责长期规划与技术决策；附件负责执行证据与上下文。

**PLNR.PROJ.0 已交付范围：**

- 新增 `PlannerProject` 稳定实体与 `AppState.projects`
- 保留 `task.projectId`，不把项目名复制进任务
- `progressMode: automatic | manual`，V1 不保存独立 `currentMilestone` 或 `nextAction`
- `areaId` 预留为字符串，不新增写死产品 enum
- `roadmapRefs` / `repoRefs` 只定义兼容结构，不做 UI
- structured sync 必须包含 `planner_projects`，避免 structured-first pull 丢失项目

**阶段边界：** PLNR.PROJ.1/2 已分别交付 `/projects` 与 QuickAddBar `@项目`；**PLNR.CAPTURE.0** 统一 Sheet 与 QuickAdd 捕获体验；附件属于 PLNR.ATTACH，roadmap 展示属于 PLNR.PROJ.3。AI 项目总结、GitHub/Deploy 自动同步仍不在范围内。

**PLNR.CAPTURE.0 范围：**

- TaskEditorSheet 主区字段分层（Tier 0 ≤ 4：标题、日期、项目）
- `@项目` 协议抽共享模块，FAB 路径与 Inbox QuickAdd 一致
- 修新建 draft 默认值（`priority` 等）与 `needsAdvancedOpen` 误触发
- 验收见 [`planner-task-capture-spec.md`](../../qa/planner-task-capture-spec.md)

**PLNR.CAPTURE.0 Not doing：** 自然语言日期、`#tag` 语法、向量/语义项目检索、从标题解析 `PLNR.*` ticket ID、独立搜索基础设施。

### 实现锚点

| ID             | 文件 / 位置                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLNR.CORE.2    | `tests/e2e.spec.js` · Insight CTA · Today 列表写入路径（legacy `QA-P2` / `P-P2`）                                                                                    |
| PLNR.CORE.3    | `src/lib/services/lifeEventsInbox.js` · inbox UI                                                                                                                     |
| PLNR.CORE.5    | `lifeEventsInbox.js` 扩 type 分支；依赖 `packages/contracts/src/events.ts`                                                                                           |
| PLNR.CORE.6    | `packages/sync/src/supabaseClient.js` · `scripts/supabaseClient.test.mjs`                                                                                            |
| PLNR.PROJ.0–3  | `src/lib/domain/projects.js` · `routes/projects/` · `QuickAddBar.svelte` · `TaskEditorSheet.svelte` · `TaskRow.svelte` · `supabase/migrations/*planner_projects.sql` |
| PAPR           | [`paper-device/`](../../../apps/planner/paper-device/) templates · `/api/paper/*`（provider：**PLNR**）· `server/paperService.mjs`                                   |
| PLNR.SCHED     | `routes/calendar/` · `components/schedule/*` · `domain/schedule.js` · **`persist/migrate.js` `migrateTask`（缺 `tags` 默认）**                                       |
| P-TASK-DISPLAY | `TaskRow.svelte` · `domain/taskMetaLine.js` · `domain/taskKind.js` · `lifeEventSource.js`                                                                            |
| PLNR.CAPTURE.0 | `QuickAddBar.svelte` · `TaskEditorSheet.svelte` · `Fab.svelte` · `taskEditorDefaults.js` · `ui.svelte.js` · [`planner-task-capture-spec.md`](../../qa/planner-task-capture-spec.md) |

## 验收命令

```bash
cd apps/planner
CI=1 npm run test:e2e                              # 全量（含 desktop）
CI=1 npm run test:e2e -- --project=mobile tests/e2e.spec.js
npm run test                                       # vitest 单元
```

## Parked / Not doing

| ID          | 说明                                                                             |
| ----------- | -------------------------------------------------------------------------------- |
| PLNR.CORE.7 | CSV / 外部日历导入                                                               |
| PLNR.CORE.8 | Planner 生产 `life_events`（需第二消费端）                                       |
| —           | PLNR.CAPTURE 范围外：NL 日期解析 · 向量项目检索 · 标题解析 `PLNR.*` ticket ID   |
| —           | 合并他站业务表 · 全站 AI Agent · 页面级 token 迁移                               |
| —           | xochitl patch / sidebar 注入 / boot replacement（Paper Pro Move track 明确不做） |

## 集成

```text
finance.bill_due ──consume──► lifeEventsInbox ──► inbox 任务
portal_today_summary ──read──► planner_tasks 计数
fitness.workout_logged (GYMS.EVENTS.1) ──► habit 打卡 (PLNR.CORE.5)
```
