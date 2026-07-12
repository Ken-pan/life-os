# Planner 日程视图 UI/UX 走查清单

> **Roadmap：** **PLNR.SCHED.0** · [`../roadmap/apps/planner.md`](../roadmap/apps/planner.md) · ID 语法 [`../roadmap/TICKET_NAMING.md`](../roadmap/TICKET_NAMING.md)
> **Agent 线：** Line A · **Claude Code · Fable** · Antigravity baseline ✅ · Codex/Cursor 补强
> **Antigravity 报告：** [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md)
> **代码锚点：** `routes/calendar/` · `components/schedule/*` · `domain/schedule.js` · `domain/tasks.js`

**状态：** Antigravity baseline **已完成**（2026-07-10）· Fable 修复 **进行中**（P0 开放 2 项）

## 目标

让 **日历 / 日程时间轴** 达到「每天真的会用」——排期、改时间、看重叠、移动端能操作，而不是只有 Today 列表可用。

## 走查环境

| 层         | 命令 / 环境                                                            |
| ---------- | ---------------------------------------------------------------------- |
| Desktop    | `cd apps/planner && npm run dev` → `/calendar`                         |
| Mobile PWA | `npm run pwa:preview:planner` + Playwright `standalone-pwa` 或 iOS Sim |
| Baseline   | `apps/planner/tests/antigravity-baseline.spec.js`（**未**设 `html.standalone-pwa`） |
| 截图证据   | `docs/qa/evidence/planner-schedule/2026-07-10/`                        |

## Baseline 结论（2026-07-10）

规范任务（Scenario A）下，日历与 Today 日程 **可渲染、可拖放、可持久化**；重叠 2–3 项布局正常。阻塞项为：

1. **P0 · 旧数据健壮性** — 缺 `tags` 数组的 legacy task 导致全页崩溃（`task.tags is not iterable`）
2. **P1 · Mobile 滚动容器** — `.life-os-page-workspace` `overflowY: visible`，整页 body 滚动而非内部裁切（**`PLNR.SCHED.10.pwa`**）

详见 [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md) §2–§5。

## 问题清单

图例：⬜ 待修 · 🟡 已确认 · ✅ 已修 · ⏸️ 搁置

| ID      | 区域               | 现象 / 风险                                              | 优先级 | 状态 | Baseline |
| ------- | ------------------ | -------------------------------------------------------- | ------ | ---- | -------- |
| PLNR.SCHED.0.migrate | 数据规范化         | legacy task 缺 `tags` → 日历/Timeline 崩溃               | P0     | ⬜   | QA-001/007 · **`migrateTask()` 不补 `tags: []`**（`persist/migrate.js:180`） |
| SCH-1   | 移动 `/calendar`   | 时间轴区域是否可滚动、是否被 AppBar/底栏遮挡             | P1     | 🟡   | QA-010 · baseline **未**模拟 `html.standalone-pwa` |
| SCH-2   | `DayTimeline`      | 拖放创建时间块：ghost 预览、冲突提示、snap 是否跟手      | P0     | ✅*  | QA-004（canonical） |
| SCH-3   | `TimeBlock`        | resize 上下把手、move、与 overlap 列宽是否可读           | P0     | ✅*  | QA-004 |
| SCH-4   | 重叠任务           | `overlappingTaskIds` 多列布局在 2–3 个重叠时是否可点     | P1     | ✅   | QA-005/006/011/012 |
| SCH-5   | `UnscheduledPanel` | 从未排期拖入时间轴、与 Today「排进今天」行为一致         | P1     | ⬜   | — |
| SCH-6   | 日历周条           | 选中日 vs 有任务 dot、`?date=` URL 同步                  | P2     | ⬜   | — |
| SCH-7   | Desktop split      | 右侧 `CalendarContextPanel` 与主栏信息是否重复/脱节      | P2     | ⬜   | — |
| SCH-8   | 当前时间线         | `now` marker 仅今天显示；滚动是否自动滚到当前小时附近    | P2     | ⬜   | — |
| SCH-9   | 空日 / 稀疏日      | `sparseHint`（`tasks.length <= 3`）与 `schedule.timelineEmpty` | P2     | ⬜   | QA-002/008 · 代码已有，baseline 视觉待复判 |
| PLNR.SCHED.10.pwa  | PWA iOS            | 单滚动容器（`.life-os-page-workspace`）；`standalone-pwa`  | P1     | 🟡   | QA-010 · 待 `npm run qa:pwa` / iOS Sim |

\* Scenario A（canonical fixture）已通过；**PLNR.SCHED.0.migrate** 修复后需在真实/legacy 数据下复验。

## 验收标准（PLNR.SCHED.0 关闭条件）

1. **PLNR.SCHED.0.migrate** 关闭 + SCH-1/SCH-2/SCH-3 在 production 数据下无 P0 开放项
2. Desktop + mobile 各完成一轮走查截图 → `docs/ui-qa-screenshots/planner/schedule/`（baseline 证据已在 `docs/qa/evidence/planner-schedule/2026-07-10/`）
3. `domain/schedule.test.js` 现有用例仍绿；**PLNR.SCHED.0.migrate** 有单元测试或 normalization 锚点
4. 产品主观：**能在日程视图完成「改时间、看重叠、排新块」而不回 Today**

## 修复记录

| 日期       | ID      | 根因 / 动作 | 证据 |
| ---------- | ------- | ----------- | ---- |
| 2026-07-10 | —       | Antigravity baseline 完成；Scenario A/B 分离 | [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md) |

_后续修复在此追加：日期 · ID · 根因 · commit/PR_
