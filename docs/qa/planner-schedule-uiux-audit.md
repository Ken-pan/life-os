# Planner 日程视图 UI/UX 走查清单

> **Roadmap：** **P-SCHED-0** · [`../roadmap/apps/planner.md`](../roadmap/apps/planner.md)
> **Agent 线：** Line A · **Claude Code · Fable** · Antigravity baseline ✅ · Codex/Cursor 补强
> **Antigravity 报告：** [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md)
> **代码锚点：** `routes/calendar/` · `components/schedule/*` · `domain/schedule.js` · `domain/tasks.js`

**状态：** 自动化闭环完成（2026-07-11）· SCH-0 / SCH-10 已修并有测试锚点 · 仅保留真机 iPhone standalone PWA 手动门

## 目标

让 **日历 / 日程时间轴** 达到「每天真的会用」——排期、改时间、看重叠、移动端能操作，而不是只有 Today 列表可用。

## 走查环境

| 层         | 命令 / 环境                                                            |
| ---------- | ---------------------------------------------------------------------- |
| Desktop    | `cd apps/planner && npm run dev` → `/calendar`                         |
| Mobile PWA | `npm run pwa:preview:planner` + Playwright `standalone-pwa` 或 iOS Sim |
| Baseline   | `apps/planner/tests/antigravity-baseline.spec.js`（**未**设 `html.standalone-pwa`） |
| 稳定回归   | `apps/planner/tests/schedule-usability.spec.js`（mobile 项目**设** `html.standalone-pwa`） |
| 截图证据   | `docs/qa/evidence/planner-schedule/2026-07-10/`                        |

## Baseline 结论（2026-07-10）

规范任务（Scenario A）下，日历与 Today 日程 **可渲染、可拖放、可持久化**；重叠 2–3 项布局正常。阻塞项为：

1. **P0 · 旧数据健壮性** — 缺 `tags` 数组的 legacy task 导致全页崩溃（`task.tags is not iterable`）
2. **P1 · Mobile 滚动容器** — `.life-os-page-workspace` `overflowY: visible`，整页 body 滚动而非内部裁切（SCH-10）

详见 [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md) §2–§5。

## 问题清单

图例：⬜ 待修 · 🟡 已确认 · ✅ 已修 · ⏸️ 搁置

| ID      | 区域               | 现象 / 风险                                              | 优先级 | 状态 | Baseline |
| ------- | ------------------ | -------------------------------------------------------- | ------ | ---- | -------- |
| SCH-0   | 数据规范化         | legacy task 缺 `tags` → 日历/Timeline 崩溃               | P0     | ✅   | QA-001/007 · `migrateTask()` 现在在唯一边界补 `tags: []` / `subtasks: []`（`persist/migrate.js`）|
| SCH-1   | 移动 `/calendar`   | 时间轴区域是否可滚动、是否被 AppBar/底栏遮挡             | P1     | ✅   | QA-010 · 页面唯一滚动面 + 内联待排程面板 |
| SCH-2   | `DayTimeline`      | 拖放创建时间块：ghost 预览、冲突提示、snap 是否跟手      | P0     | ✅   | QA-004 · 真实/legacy 数据复验（migrate 边界修复后）|
| SCH-3   | `TimeBlock`        | resize 上下把手、move、与 overlap 列宽是否可读           | P0     | ✅   | QA-004 |
| SCH-4   | 重叠任务           | `overlappingTaskIds` 多列布局在 2–4 个重叠时是否可点     | P1     | ✅   | QA-005/006/011/012 |
| SCH-5   | `UnscheduledPanel` | 从未排期拖入时间轴、与 Today「排进今天」行为一致         | P1     | ✅   | 同一排期真源（`scheduledDate/Start` 口径）|
| SCH-6   | 日历周条           | 选中日 vs 有任务 dot、`?date=` URL 同步                  | P2     | ✅   | — |
| SCH-7   | Desktop split      | 右侧 `CalendarContextPanel` 与主栏信息是否重复/脱节      | P2     | ✅   | 主栏不再重复 `ScheduleSummary` |
| SCH-8   | 当前时间线         | `now` marker 仅今天显示；滚动是否自动滚到当前小时附近    | P2     | ✅   | — |
| SCH-9   | 空日 / 稀疏日      | `sparseHint`（`tasks.length <= 3`）与 `schedule.timelineEmpty` | P2     | ✅   | QA-002/008 |
| SCH-10  | PWA iOS            | 单滚动容器（`.life-os-page-workspace`）；`standalone-pwa`  | P1     | ✅   | QA-010 · Playwright `standalone-pwa` 自动化 PASS；真机 iPhone 手动门保留 |

## 验收标准（P-SCHED-0 关闭条件）

1. **SCH-0** 关闭 + SCH-1/SCH-2/SCH-3 在 production 数据下无 P0 开放项 ✅
2. Desktop + mobile 各完成一轮走查截图 → `docs/qa/evidence/planner-schedule/2026-07-10/` ✅
3. `domain/schedule.test.js` 现有用例仍绿；SCH-0 有单元测试锚点（`persist/migrate.test.js` — 缺失/合法/畸形/重复迁移/消费端迭代 5 类）✅
4. 产品主观：**能在日程视图完成「改时间、看重叠、排新块」而不回 Today** ✅（E2E：创建、移动、60→90 resize、reload 持久化）

## 修复记录

| 日期       | ID      | 根因 / 动作 | 证据 |
| ---------- | ------- | ----------- | ---- |
| 2026-07-10 | —       | Antigravity baseline 完成；Scenario A/B 分离 | [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md) |
| 2026-07-10 | SCH-1/10 | 移动时间轴与 fixed 待排程面板形成嵌套滚动与 FAB 冲突；改为页面唯一滚动面 + 内联待排程面板。standalone 393×852 / 430×932 已验证 | `schedule-usability.spec.js` · evidence 截图 |
| 2026-07-10 | SCH-2/3/4/5/8 | 时间坐标路径统一使用动态日边界；时间块 pointer capture 开放给触摸；新增 1–4 重叠、创建、放置、移动、60→90 resize、reload 持久化 E2E | `schedule-usability.spec.js` |
| 2026-07-10 | 持久化  | 原实现吞掉 localStorage 失败，留下虚假成功 UI；排程修改现在立即 flush，失败回滚并取消成功提示 | `localStore.js` · E2E QuotaExceeded 用例 |
| 2026-07-11 | SCH-0   | 根因 = `migrateTask()` 不补 `tags`；采用 Cursor `migrateTags()` 补丁（trim + 丢弃非字符串/空串）并保留 `subtasks: []` 默认，统一在 migrate 边界修复，不散落消费端 fallback | `persist/migrate.js` · `persist/migrate.test.js` |
| 2026-07-11 | SCH-10  | 补充 standalone-PWA 专项断言：最后一行时间轴可达且不被底栏覆盖、无横向溢出、无嵌套滚动陷阱、sheet/dialog 内滚正常 | `schedule-usability.spec.js` |

## 验证与证据

- 稳定 E2E：`apps/planner/tests/schedule-usability.spec.js`（desktop + mobile standalone-pwa）
- 截图：[`evidence/planner-schedule/2026-07-10/`](evidence/planner-schedule/2026-07-10/)
- canonical screenshot gate：`screenshot-achievement-schedule.spec.js`
- 单元：`persist/migrate.test.js`（SCH-0 五类）· `domain/schedule.test.js`
- 静态 / 构建：`npm run check` · `npm run build`

## 真机手动门（不伪称自动化已证明）

Playwright 可证明 pointer 控件、滚动归属、safe-area 布局和持久化，不能代替物理 iPhone standalone PWA。最终手动复核：加入主屏后在 `/calendar` 连续执行页面纵向滚动、长按 grip 移动、上/下把手 resize、拖动期间观察页面不跳动，并确认底栏/FAB/safe-area 无覆盖。

_后续修复在此追加：日期 · ID · 根因 · commit/PR_
