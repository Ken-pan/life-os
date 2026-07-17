# Planner Roadmap

**URL：** [planner.kenos.space](https://planner.kenos.space) · **Workspace：** `planner-os`
**Hub：** [`../../LIFEOS_ROADMAP.md`](../../LIFEOS_ROADMAP.md) · **E2E：** [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md#planner-planner-os)

## 一句话

个人任务/日历中枢 + AI 简报；Life OS 里 **`life_events` 唯一消费端**（Finance 账单 → inbox 任务）。

## 当前能力（生产）

| 域             | 状态 | 要点                                                             |
| -------------- | ---- | ---------------------------------------------------------------- |
| 任务流         | ✅   | Today / Inbox / Upcoming / Calendar / Search / Lists / Completed |
| AI             | ✅   | Kimi 今日简报、任务拆分（`/api/ai/plan`）                        |
| 云同步         | ✅   | `planner_tasks` / `planner_lists` / `planner_projects` + LWW     |
| 项目管理       | ✅   | Projects 列表/详情 · Active/Paused/Shipped · 自动进度 · `@项目`  |
| PWA            | ✅   | SW + IndexedDB 提醒 + 通知                                       |
| Integration    | ✅   | SSO · `finance.bill_due` → `lifeEventsInbox.js`                  |
| Insight        | ✅   | 批量排期 E2E **PLNR.CORE.2** desktop 22/22 ✅                    |
| Knowledge 联动 | ✅   | 项目详情经本机 local-ai Vault 服务语义检索 KnowledgeOS 笔记；不可达时优雅降级 |
| Paper 数据 provider | ✅   | `/api/paper/*` 生产端；设备 Shell（PaperOS）已迁出独立仓库 — 见 [`paperos.md`](./paperos.md) |

## Next（按 ROI）

| ID                   | 主题                                       | ROI | 桶      | 投入 | Agent                  | 验收                                                                    | Hub         |
| -------------------- | ------------------------------------------ | --- | ------- | ---- | ---------------------- | ----------------------------------------------------------------------- | ----------- |
| **PLNR.SCHED.10b.ios** | 日程真机 standalone 签收                 | 🔥  | User gate | <0.5d | Ken | 代码/E2E/PWA 全绿；只签收或记录可复现问题，不占 Agent 主航道 | User Gate |
| **P-TASK-DISPLAY-0** | 任务行小字 + 类别视觉规范                  | ◆   | Product | —    | **并入 PLNR.SCHED.0**  | [`planner-task-display-spec.md`](../../qa/planner-task-display-spec.md) | PLNR.UIUX.0 |
| **PLNR.UIUX.0**      | 定向 UI 收口（未覆盖页 + 静态 warning） | ◆   | Product | 1d | Fable | PageShell/核心页已收敛；只检查未覆盖页面、4 条现存 warning 与 task display，不做全站重构 | §Next |
| **PLNR.CAPTURE.0**   | iOS/移动端任务捕获统一 | ◆   | Product | gate | Code ✅ · Ken iOS | unit/E2E/截图 ✅；真机 IME + 键盘 gate ⏳ | PLNR.UIUX.0 |
| ~~**PLNR.CORE.4**~~  | Today 计数与 `portal_today_summary` 对齐   | ◆   | Growth  | —    | Cursor / Codex（快赢） | ✅ 已发货 2026-07-13 — RPC tz+tombstone (`ce475c75`) · `selectTodayGroups` 谓词与 RPC `todayOpen`/`overdue` 逐项一致（Portal 分行展示今日/逾期，与 Planner 分组同口径）· `selectors.test.js` parity 契约 9/9 | ✅ |
| **PLNR.ATTACH.0**    | 附件 WIP 决策与落地                    | ◆  | Core    | — | Codex | ✅ 生产表/桶/RLS 已 apply · retry 缓存 File · bug 上报上传失败会 reject · 软删随 task/project · unit 覆盖 validate/safeFilename/sync rows | ✅ |
| **PLNR.ATTACH.1**    | 图片与截图体验                             | ◆   | Product | 1d   | Fable                  | paste / drag-drop / mobile picker / thumbnail / retry                   | —           |

**PaperOS 设备 Shell（`PAPR.*`）排期已迁出独立仓库** — 见 [`paperos.md`](./paperos.md)；本表仅追踪 Planner 侧 provider API。

### 近期已完成

| ID                                | 结果                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| PLNR.CORE.2 / PLNR.CORE.3 / PLNR.CORE.5 / PLNR.CORE.6 | E2E、Insight、事件徽章/深链、Fitness 打卡与 Auth 单例均已发货                 |
| PLNR.PROJ.0–3                     | 项目实体与远程表、Projects 列表/详情、`@项目`、project chip 与只读 Roadmap/代码引用已落地 |
| KNOW.XREF.5 slice                 | Planner 项目详情反向检索 KnowledgeOS；首条跨 OS 引用试点，尚非通用 `object_ref` |
| PageShell 页面外壳收敛            | 核心页（list / split / today / calendar / completed）迁至 `PageShell` 原语，两栏响应式对齐 + 溢出治理；新增运行时布局不变量护栏进 CI（`e83bf7777` · `96b58dfa3` · `0591f5b7a` · `97c8f7b9e`，2026-07-16/17） |
| Planner 当前回归基线              | 2026-07-17 本地单测 126/126 + reminder TAP 2/2；SCHED 剩余为用户设备 gate，不应继续阻塞其他工程项 |

### Project / Attachment 设计边界

Planner 的项目系统只负责「当前执行状态」；repo roadmap 继续负责长期规划与技术决策；附件负责执行证据与上下文。

**PLNR.PROJ.0 已交付范围：**

- 新增 `PlannerProject` 稳定实体与 `AppState.projects`
- 保留 `task.projectId`，不把项目名复制进任务
- `progressMode: automatic | manual`，V1 不保存独立 `currentMilestone` 或 `nextAction`
- `areaId` 预留为字符串，不新增写死产品 enum
- `roadmapRefs` / `repoRefs` 只定义兼容结构，不做 UI
- structured sync 必须包含 `planner_projects`，避免 structured-first pull 丢失项目

**阶段边界：** PLNR.PROJ.1/2 已分别交付 `/projects` 与 `@项目`；附件属于 PLNR.ATTACH，roadmap 展示属于 PLNR.PROJ.3。AI 项目总结、GitHub/Deploy 自动同步仍不在范围内。

### Attachment (PLNR.ATTACH.0 / PLNR.ATTACH.1) 与 Bug Capture (PLNR.BUG.0) 实现边界

- **数据模型**: 采用 Metadata (`planner_attachments`) 与 Binary (Supabase Storage) 分离的设计。Metadata 同步与 LWW merge 完全复用现有的 `AppState`，离线状态仅作为 fallback 和 cache。
- **存储与安全**: Storage path 统一采用 `{userId}/{ownerType}/{ownerId}/{attachmentId}/{safeFilename}` 以防目录遍历和冲突；禁止执行文件 (.exe, .sh) 等高危扩展名，最大 25MB。使用 private bucket `planner-attachments` 和 signed URL 进行图片预览与下载访问，包含行级 RLS 保障 auth 隔离。
- **孤儿与软删除 (Orphan & Soft-delete)**: Task/Project 软删除时，关联 attachment 不直接销毁以防误删，仅保留 `deletedAt`。永久删除或者重新恢复能够一并响应。
- **图片体验**: TaskEditorSheet 与 Project Editor 支持本地/剪贴板 (`Cmd/Ctrl+V`) 粘贴上传、File input 上传与拖拽上传。上传为 background task 体验，支持状态（`uploading`, `ready`, `failed`）提示与断点重试。
- **Bug Capture**: 整合现有的 `ReportBugButton` 的生命周期，自动生成带有 `tags: ['bug']` 和 `source: 'bug-report'` 的 P1 或 P2 级别 Task，上传 JSON 格式的环境日志，和可选的页面截图预览。不会直接插入 `bug_logs`。

### 实现锚点

| ID             | 文件 / 位置                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLNR.CORE.2    | `tests/e2e.spec.js` · helper `quickAddTask`（FAB）→ 侧栏/快捷键 · Insight CTA · Today 列表写入路径                                                                   |
| PLNR.CORE.3    | `src/lib/services/lifeEventsInbox.js` · inbox UI                                                                                                                     |
| PLNR.CORE.5    | `lifeEventsInbox.js` 扩 type 分支；依赖 `packages/contracts/src/events.ts`                                                                                           |
| PLNR.CORE.6    | `packages/sync/src/supabaseClient.js` · `scripts/supabaseClient.test.mjs`                                                                                            |
| PLNR.PROJ.0–3  | `src/lib/domain/projects.js` · `routes/projects/` · `QuickAddBar.svelte` · `TaskEditorSheet.svelte` · `TaskRow.svelte` · `supabase/migrations/*planner_projects.sql` |
| KNOW.XREF.5 slice | `src/lib/services/knowledgeClient.js` · `routes/projects/[id]/+page.svelte` |
| PAPR（数据 provider） | `/api/paper/*` Netlify functions · `server/paperService.mjs` · Supabase paper-device migrations（设备端 `paper-device/` 已迁出 → paperos 仓库）                               |
| PLNR.SCHED.0   | `routes/calendar/` · `components/schedule/*` · `domain/schedule.js` · **`persist/migrate.js` `migrateTask`（缺 `tags` 默认）** |
| PLNR.UIUX.0（task display） | `TaskRow.svelte` · `domain/taskMetaLine.js` · `domain/taskKind.js` · `lifeEventSource.js`                                                              |

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
| —           | 合并他站业务表 · 全站 AI Agent · 页面级 token 迁移                               |
| —           | xochitl patch / sidebar 注入 / boot replacement（PaperOS track，见独立仓库）      |

## 集成

```text
finance.bill_due ──consume──► lifeEventsInbox ──► inbox 任务
portal_today_summary ──read──► planner_tasks 计数
fitness.workout_logged (GYMS.EVENTS.1) ──► habit 打卡 (PLNR.CORE.5)
```
