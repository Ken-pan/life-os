# Planner 日程视图 UI/UX 走查清单

> **Roadmap：** **P-SCHED-0** · [`../roadmap/apps/planner.md`](../roadmap/apps/planner.md)
> **Agent 线：** Line A · **Claude Code · Fable** · Antigravity baseline ✅ · Cursor docs/harness
> **Antigravity 报告：** [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md)
> **代码锚点：** `routes/calendar/` · `components/schedule/*` · `domain/schedule.js` · `domain/tasks.js`
> **Canonical 实现：** branch `fable/p-sched-0` · worktree `.claude/worktrees/p-sched-0`

**状态：** Antigravity baseline **已完成**（2026-07-10）· Scheduling implementation 已从旧 mixed-scope branch 重建到 scope-pure replacement branch；自动化与真机门仍按下文分别验收。

## 目标

让 **日历 / 日程时间轴** 达到「每天真的会用」——排期、改时间、看重叠、移动端能操作，而不是只有 Today 列表可用。

## 走查环境

| 层         | 命令 / 环境                                                            |
| ---------- | ---------------------------------------------------------------------- |
| Desktop    | `cd apps/planner && npm run dev` → `/calendar`                         |
| Mobile PWA | `npm run pwa:preview:planner` + Playwright `?pwa_sim=1` 或 iOS Sim    |
| Baseline   | `apps/planner/tests/antigravity-baseline.spec.js`（**未**设 `html.standalone-pwa`） |
| 稳定回归   | `apps/planner/tests/schedule-usability.spec.js`                         |
| 截图证据   | `docs/qa/evidence/planner-schedule/2026-07-10/`                        |

## Baseline 结论（2026-07-10）

规范任务（Scenario A）下，日历与 Today 日程 **可渲染、可拖放、可持久化**；重叠 2–3 项布局正常。Antigravity 当时阻塞项：

1. **P0 · 旧数据健壮性** — 缺 `tags` 数组的 legacy task 导致全页崩溃（`task.tags is not iterable`）→ **SCH-0 已修** `cb11fbcc`
2. **P1 · Mobile 滚动容器** — baseline **未**加 `standalone-pwa`；后续 PWA sanity ✅，但 standalone shell guard 仍失败（SCH-10 **仍开放**）

详见 [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md) §2–§5。

## Replacement branch recovery

旧 `fable/p-sched-0` 历史包含 PaperOS 与共享 roadmap checkpoint，不能在不改写历史的情况下继续作为 scope-pure PR。Scheduling implementation、migration guard、targeted tests、QA docs 和 README 登记的正式截图已从最新 `origin/master` 重建；PaperOS、跨 App docs、共享 workstream 文件和临时 Playwright output 均未带入。

当前自动化覆盖：

- 创建、移动、resize、重叠布局和 reload persistence；
- mobile PWA 单一滚动面、底栏/FAB 避让和 sheet 关闭后的滚动恢复；
- legacy schema migration 后 Calendar/Today 可渲染且无横向溢出；
- 正式证据清单见 [`evidence/planner-schedule/2026-07-10/README.md`](./evidence/planner-schedule/2026-07-10/README.md)。

Playwright mobile 仿真不能替代物理 iPhone Home Screen standalone QA；真机 safe-area、惯性滚动和 Home Indicator 遮挡仍需 owner 手动签收。

## 问题清单

图例：⬜ 待修 · 🟡 已确认 / 部分 · ✅ 已修 · ⏸️ 搁置

| ID      | 区域               | 现象 / 风险                                              | 优先级 | 状态 | 证据 |
| ------- | ------------------ | -------------------------------------------------------- | ------ | ---- | ---- |
| SCH-0   | 数据规范化         | legacy task 缺/非法 `tags` → 日历/Timeline 崩溃          | P0     | ✅   | `cb11fbcc` · `persist/migrate.js` · `persist/migrate.test.js` |
| SCH-1   | 移动 `/calendar`   | 时间轴区域是否可滚动、是否被 AppBar/底栏遮挡             | P1     | ✅   | QA-010 · 页面唯一滚动面 + 内联待排程面板 |
| SCH-2   | `DayTimeline`      | 拖放创建时间块：ghost 预览、冲突提示、snap 是否跟手      | P0     | ✅   | QA-004 · full E2E |
| SCH-3   | `TimeBlock`        | resize 上下把手、move、与 overlap 列宽是否可读           | P0     | ✅   | QA-004 |
| SCH-4   | 重叠任务           | `overlappingTaskIds` 多列布局在 2–4 个重叠时是否可点     | P1     | ✅   | QA-005/006/011/012 |
| SCH-5   | `UnscheduledPanel` | 从未排期拖入时间轴、与 Today「排进今天」行为一致         | P1     | ✅   | 同一排期真源 |
| SCH-6   | 日历周条           | 选中日 vs 有任务 dot、`?date=` URL 同步                  | P2     | ✅   | — |
| SCH-7   | Desktop split      | 右侧 `CalendarContextPanel` 与主栏信息是否重复/脱节      | P2     | ✅   | 主栏不再重复 `ScheduleSummary` |
| SCH-8   | 当前时间线         | `now` marker 仅今天显示；滚动是否自动滚到当前小时附近    | P2     | ✅   | — |
| SCH-9   | 空日 / 稀疏日      | `sparseHint` 与 `schedule.timelineEmpty`                 | P2     | ✅   | QA-002/008 |
| SCH-10  | PWA iOS standalone | 单滚动容器；standalone shell；真机 Home Screen           | P1     | 🟡   | PWA sanity ✅ · standalone guard ❌ · 真机 iPhone **未验** |

\* Scenario A（canonical fixture）已通过；**PLNR.SCHED.0.migrate** 修复后需在真实/legacy 数据下复验。

1. **SCH-0** 关闭 + SCH-1/SCH-2/SCH-3 在 production 数据下无 P0 开放项 ✅
2. Desktop + mobile 各完成一轮走查截图 → `docs/qa/evidence/planner-schedule/2026-07-10/` ✅
3. `domain/schedule.test.js` 现有用例仍绿；SCH-0 有单元测试锚点 ✅
4. 产品主观：**能在日程视图完成「改时间、看重叠、排新块」而不回 Today** ✅（full desktop E2E）
5. **SCH-10** standalone 自动化 guard 稳定通过 ⬜
6. **真机 iPhone Home Screen standalone** 手动签收 ⬜
7. **Claude Fable 最终 product sign-off** ⬜

## 修复记录

| 日期       | ID      | 根因 / 动作 | 证据 |
| ---------- | ------- | ----------- | ---- |
| 2026-07-10 | —       | Antigravity baseline 完成；Scenario A/B 分离 | [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md) |
| 2026-07-12 | SCH-0/1/2/3/4/5/7/10 | 从最新 master 重建 scope-pure scheduling branch；补 legacy migration walk、单滚动面与正式 evidence manifest | `schedule-usability.spec.js` · [`evidence README`](./evidence/planner-schedule/2026-07-10/README.md) |

_后续修复在此追加：日期 · ID · 根因 · commit/PR_
