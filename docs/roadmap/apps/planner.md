# Planner Roadmap

**URL：** [planner.kenos.space](https://planner.kenos.space) · **Workspace：** `planner-os`
**Hub：** [`../../LIFEOS_ROADMAP.md`](../../LIFEOS_ROADMAP.md) · **E2E：** [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md#planner-planner-os)

## 一句话

个人任务/日历中枢 + AI 简报；Life OS 里 **`life_events` 唯一消费端**（Finance 账单 → inbox 任务）。

## 当前能力（生产）

| 域          | 状态 | 要点                                                             |
| ----------- | ---- | ---------------------------------------------------------------- |
| 任务流      | ✅   | Today / Inbox / Upcoming / Calendar / Search / Lists / Completed |
| AI          | ✅   | Kimi 今日简报、任务拆分（`/api/ai/plan`）                        |
| 云同步      | ✅   | `planner_tasks` / `planner_lists` + LWW                          |
| PWA         | ✅   | SW + IndexedDB 提醒 + 通知                                       |
| Integration | ✅   | SSO · `finance.bill_due` → `lifeEventsInbox.js`                  |
| Insight     | ✅   | 批量排期 E2E **P-P2** desktop 22/22 ✅                           |
| Paper Pro Move | 🟡 | P-MOVE-1 home-only session pass；PaperOS 已部署到 `/home/root/paperos`；下一步 P-MOVE-2 token + read cache |

## Next（按 ROI）

| ID                 | 主题                                                | ROI | 桶     | 投入 | 验收                                   | Hub                 |
| ------------------ | --------------------------------------------------- | --- | ------ | ---- | -------------------------------------- | ------------------- |
| **QA-P2** {#qa-p2} | Desktop E2E 侧栏/快捷键                             | ✅  | Infra  | —    | desktop **21/22** ✅                   | —                   |
| **P-P2** {#p-p2}   | Insight「批量排期」（**P-1**）                      | ✅  | Core   | —    | desktop **22/22** ✅                   | §Shipped            |
| **P-P3**           | Inbox `life_events` 来源徽章 + 深链 Finance/Fitness | ✅  | Growth | —    | `chip--life-event` · Finance `#/today` | §Shipped 2026-07-09 |
| **P-P4**           | Today 计数与 `portal_today_summary` 对齐            | ◆   | Growth | 0.5d | 与 Portal 同账号任务数一致             | —                   |
| **P-MOVE-1**       | Paper Pro Move home-only launcher baseline          | ✅  | Product | — | `/home/root/paperos` 已部署；启动/恢复 gate pass | [`planner-pro-move.md`](./planner-pro-move.md) |
| **P-MOVE-2**       | PaperOS read path + offline cache                   | ◆   | Product | 1–2d | `/api/paper/today` → `cache.json`；离线可读 | [`planner-pro-move.md`](./planner-pro-move.md) |
| **P-MOVE-3**       | Paper `task.complete` controlled write MVP          | ◆   | Product | 1d | 本地 HTTP A-E ✅；staging 写入通过；生产写开关默认关      | [`planner-pro-move.md`](./planner-pro-move.md) |
| **P-PROJ-0**       | Project domain foundation                           | ◆◆  | Core   | 0.5–1d | `projects` state/table + LWW sync；`task.projectId` 保留 | — |
| **P-PROJ-1**       | Projects 页面                                       | ◆◆  | Product | 1–2d | Active/Paused 分组；项目详情显示关联任务与下一条任务 | — |
| **P-PROJ-2**       | 任务 `@项目` 关联                                   | ◆◆  | Product | 1d | 任务编辑器项目选择器；Quick Add token；TaskRow project chip | — |
| **P-PROJ-3**       | Roadmap refs（只读）                                | ◆   | Integration | 1–2d | 手动 refs → generated roadmap index；Planner 不反写 Markdown | — |
| **P-ATTACH-0**     | Task / Project 附件底座                             | ◆◆  | Core   | 1–2d | Supabase Storage + metadata；在线上传/删除/预览 | — |
| **P-ATTACH-1**     | 图片与截图体验                                      | ◆   | Product | 1d | paste / drag-drop / mobile picker / thumbnail / retry | — |
| **P-P5** {#p-p5}   | 消费 `fitness.workout_logged` → habit 打卡          | ✅  | Growth | —    | inbox 测试 7/7 · FT-P1 触发器          | §Shipped            |
| **P-P6**           | 消除 `Multiple GoTrueClient` 警告（**P-3**）        | ✅  | Infra  | —    | `@life-os/sync` 浏览器单例缓存         | §Shipped 2026-07-08 |

### Project / Attachment 设计边界

Planner 的项目系统只负责「当前执行状态」；repo roadmap 继续负责长期规划与技术决策；附件负责执行证据与上下文。

**P-PROJ-0 范围（当前地基）：**

- 新增 `PlannerProject` 稳定实体与 `AppState.projects`
- 保留 `task.projectId`，不把项目名复制进任务
- `progressMode: automatic | manual`，V1 不保存独立 `currentMilestone` 或 `nextAction`
- `areaId` 预留为字符串，不新增写死产品 enum
- `roadmapRefs` / `repoRefs` 只定义兼容结构，不做 UI
- structured sync 必须包含 `planner_projects`，避免 structured-first pull 丢失项目

**明确不进 P-PROJ-0：** `/projects` 页面、`@` 输入、附件、roadmap parser、AI 项目总结、GitHub/Deploy 状态同步。

### 实现锚点

| ID    | 文件 / 位置                                                                |
| ----- | -------------------------------------------------------------------------- |
| QA-P2 | `tests/e2e.spec.js` · helper `quickAddTask`（FAB）→ 侧栏/快捷键            |
| P-P2  | Insight CTA · Today 列表写入路径                                           |
| P-P3  | `src/lib/services/lifeEventsInbox.js` · inbox UI                           |
| P-P5  | `lifeEventsInbox.js` 扩 type 分支；依赖 `packages/contracts/src/events.ts` |
| P-P6  | `packages/sync/src/supabaseClient.js` · `scripts/supabaseClient.test.mjs`  |
| P-PROJ-0 | `src/lib/types.js` · `persist/migrate.js` · `state.svelte.js` · `repo.js` · `supabase/migrations/*planner_projects.sql` |
| P-MOVE | [`paper-device/`](../../../apps/planner/paper-device/) templates · `/api/paper/*` Netlify functions · `server/paperService.mjs` |

## 验收命令

```bash
cd apps/planner
CI=1 npm run test:e2e                              # 全量（含 desktop）
CI=1 npm run test:e2e -- --project=mobile tests/e2e.spec.js
npm run test                                       # vitest 单元
```

## Parked / Not doing

| ID   | 说明                                               |
| ---- | -------------------------------------------------- |
| P-P7 | CSV / 外部日历导入                                 |
| P-P8 | Planner 生产 `life_events`（需第二消费端）         |
| —    | 合并他站业务表 · 全站 AI Agent · 页面级 token 迁移 |
| —    | xochitl patch / sidebar 注入 / boot replacement（Paper Pro Move track 明确不做） |

## 集成

```text
finance.bill_due ──consume──► lifeEventsInbox ──► inbox 任务
portal_today_summary ──read──► planner_tasks 计数
fitness.workout_logged (FT-P1) ──► habit 打卡 (P-P5)
```
