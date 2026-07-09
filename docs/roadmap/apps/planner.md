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

## Next（按 ROI）

| ID                 | 主题                                                | ROI | 桶     | 投入 | 验收                                   | Hub                 |
| ------------------ | --------------------------------------------------- | --- | ------ | ---- | -------------------------------------- | ------------------- |
| **QA-P2** {#qa-p2} | Desktop E2E 侧栏/快捷键                             | ✅  | Infra  | —    | desktop **21/22** ✅                   | —                   |
| **P-P2** {#p-p2}   | Insight「批量排期」（**P-1**）                      | ✅  | Core   | —    | desktop **22/22** ✅                   | §Shipped            |
| **P-P3**           | Inbox `life_events` 来源徽章 + 深链 Finance/Fitness | ✅  | Growth | —    | `chip--life-event` · Finance `#/today` | §Shipped 2026-07-09 |
| **P-P4**           | Today 计数与 `portal_today_summary` 对齐            | ◆   | Growth | 0.5d | 与 Portal 同账号任务数一致             | —                   |
| **P-P5** {#p-p5}   | 消费 `fitness.workout_logged` → habit 打卡          | ✅  | Growth | —    | inbox 测试 7/7 · FT-P1 触发器          | §Shipped            |
| **P-P6**           | 消除 `Multiple GoTrueClient` 警告（**P-3**）        | ✅  | Infra  | —    | `@life-os/sync` 浏览器单例缓存         | §Shipped 2026-07-08 |

### 实现锚点

| ID    | 文件 / 位置                                                                |
| ----- | -------------------------------------------------------------------------- |
| QA-P2 | `tests/e2e.spec.js` · helper `quickAddTask`（FAB）→ 侧栏/快捷键            |
| P-P2  | Insight CTA · Today 列表写入路径                                           |
| P-P3  | `src/lib/services/lifeEventsInbox.js` · inbox UI                           |
| P-P5  | `lifeEventsInbox.js` 扩 type 分支；依赖 `packages/contracts/src/events.ts` |
| P-P6  | `packages/sync/src/supabaseClient.js` · `scripts/supabaseClient.test.mjs`  |

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

## 集成

```text
finance.bill_due ──consume──► lifeEventsInbox ──► inbox 任务
portal_today_summary ──read──► planner_tasks 计数
fitness.workout_logged (FT-P1) ──► habit 打卡 (P-P5)
```
