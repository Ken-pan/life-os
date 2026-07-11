# Planner 日程视图 UI/UX 走查清单

> **Roadmap：** **P-SCHED-0** · [`../roadmap/apps/planner.md`](../roadmap/apps/planner.md)
> **Agent 线：** Line A · **Claude Code · Fable** · Antigravity baseline ✅ · Cursor docs/harness
> **Antigravity 报告：** [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md)
> **代码锚点：** `routes/calendar/` · `components/schedule/*` · `domain/schedule.js` · `domain/tasks.js`
> **Canonical 实现：** branch `fable/p-sched-0` · worktree `.claude/worktrees/p-sched-0`

**整体状态：** **P-SCHED-0 BLOCKED**（2026-07-11 交接）— SCH-0 根因已修；desktop E2E 与 PWA mobile sanity 通过；standalone 自动化 guard 与真机 iPhone Home Screen 签收未完成。**不得**将本 initiative 标为 CLOSED。

## 目标

让 **日历 / 日程时间轴** 达到「每天真的会用」——排期、改时间、看重叠、移动端能操作，而不是只有 Today 列表可用。

## 走查环境

| 层         | 命令 / 环境                                                            |
| ---------- | ---------------------------------------------------------------------- |
| Desktop    | `cd apps/planner && npm run dev` → `/calendar`                         |
| Mobile PWA | `npm run pwa:preview:planner` + Playwright `?pwa_sim=1` 或 iOS Sim    |
| Baseline   | `apps/planner/tests/antigravity-baseline.spec.js`（**未**设 `html.standalone-pwa`） |
| 稳定回归   | `apps/planner/tests/schedule-usability.spec.js`（full suite 内通过；isolated 跑仍不稳定） |
| 截图证据   | `docs/qa/evidence/planner-schedule/2026-07-10/`                        |

## Baseline 结论（2026-07-10）

规范任务（Scenario A）下，日历与 Today 日程 **可渲染、可拖放、可持久化**；重叠 2–3 项布局正常。Antigravity 当时阻塞项：

1. **P0 · 旧数据健壮性** — 缺 `tags` 数组的 legacy task 导致全页崩溃（`task.tags is not iterable`）→ **SCH-0 已修** `cb11fbcc`
2. **P1 · Mobile 滚动容器** — baseline **未**加 `standalone-pwa`；后续 PWA sanity ✅，但 standalone shell guard 仍失败（SCH-10 **仍开放**）

详见 [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md) §2–§5。

## 2026-07-11 验证摘要

### 已通过

| Gate | 结果 |
| ---- | ---- |
| SCH-0 migration unit tests | PASS |
| Consumer verification（直接 `for (const tag of task.tags)`） | PASS |
| Planner Svelte check | 0 diagnostics |
| Planner unit tests | PASS |
| `npm run build:planner` | PASS |
| PWA mobile sanity — Today / Settings / Calendar | PASS |
| Full Planner desktop E2E | **72 passed · 8 skipped** |
| `git diff --check` | PASS |

### Commit 锚点

| 变更 | Commit |
| ---- | ------ |
| SCH-0 — `migrateTask()` 边界规范化 `tags: string[]` | `cb11fbcccf897231e3f4c96907f6da1531149cad` |
| PWA harness — Playwright `webServer` 顶层 + preview `--strictPort` | `29f0c2ed5adc5e17f9cfbb125116685f7f459f77` |

PWA harness 变更文件：`playwright.config.ts` · `scripts/pwa/preview-app.sh`。观测结果：消除此前大量 `page.goto: Could not connect to the server`；固定端口 5188 行为确定。**不能**据此推断普通 mobile viewport 等同 standalone PWA。

### 未关闭的自动化检查（**非已确认产品回归**）

| 检查 | 现象 | 分类 |
| ---- | ---- | ---- |
| Standalone shell guard — Today | 预期 `display: flex`，实际 `block` | 测试断言 / shell CSS，待确认 |
| Standalone shell guard — Settings / Calendar | 注入 `standalone-pwa` 时 `Execution context was destroyed` | standalone 状态注入 / 导航生命周期 |
| `qa:mobile-scroll` | 同上 execution-context 失败 | QA harness |
| Isolated `schedule-usability.spec.js` — mobile | scroll-surface 断言失败；预期 5 blocks，实际 0 | test isolation / fixture 债务 |
| Isolated `schedule-usability.spec.js` — desktop | `.day-timeline-canvas` 等待超时 | 同上 — full E2E suite 内对应用例可通过 |

**当前无已确认的产品 P0。** Desktop 完整 E2E、unit、build 与 mobile sanity 均通过。

### 真机 standalone 要求（SCH-10 关闭前提）

Playwright mobile 仿真与 `?pwa_sim=1` 仅为 **自动化回归证据**，**不能**替代物理 iPhone Home Screen standalone 验收。截至 2026-07-11 **尚未完成**：

- 从主屏图标启动（无 Safari 地址栏）
- 真实 safe-area / Home Indicator / 触控惯性滚动
- 时间轴内层滚动 vs 页面滚动手势竞争
- 最后一条日程是否可达、底栏是否遮挡
- sheet/dialog 开闭后的滚动恢复
- 无意外横向溢出、无非设计嵌套滚动陷阱

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

## 验收标准（P-SCHED-0 关闭条件）

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
| 2026-07-10 | SCH-1/10 | 移动时间轴与 fixed 待排程面板形成嵌套滚动与 FAB 冲突；改为页面唯一滚动面 + 内联待排程面板 | `schedule-usability.spec.js` · evidence 截图 |
| 2026-07-10 | SCH-2/3/4/5/8 | 时间坐标路径统一；pointer capture；重叠/创建/移动/resize/reload E2E | `schedule-usability.spec.js` |
| 2026-07-10 | 持久化  | localStorage 失败回滚 | `localStore.js` · E2E QuotaExceeded |
| 2026-07-11 | SCH-0   | 根因 = `migrateTask()` 不补合法 `tags`；在唯一 migrate 边界修复（trim · 丢弃非字符串/空串 · 幂等）；**不用**消费端 `task.tags \|\| []` 掩盖 | `cb11fbcc` · `persist/migrate.js` · `persist/migrate.test.js` |
| 2026-07-11 | harness | Playwright preview server 生命周期 + `--strictPort` | `29f0c2ed` · `playwright.config.ts` · `scripts/pwa/preview-app.sh` |
| 2026-07-11 | SCH-10  | standalone-PWA 专项断言已加，但 **guard 仍失败**；isolated fixture 债务；真机待验 | `schedule-usability.spec.js`（worktree 内有 Fable 未提交调整，docs 不同步覆盖） |

## 验证与证据

- 稳定 E2E（full suite）：`apps/planner/tests/schedule-usability.spec.js` — isolated 跑不可靠
- 截图：[`evidence/planner-schedule/2026-07-10/`](evidence/planner-schedule/2026-07-10/)
- canonical screenshot gate：`screenshot-achievement-schedule.spec.js`
- 单元：`persist/migrate.test.js`（SCH-0）· `domain/schedule.test.js`
- 静态 / 构建：`npm run check` · `npm run build:planner`
- PWA：`PWA_APP=planner npm run test:pwa` · `npm run qa:mobile-scroll`（后者仍失败）

## 真机手动门（不伪称自动化已证明）

Playwright 可证明 pointer 控件、滚动归属、safe-area 布局和持久化，**不能**代替物理 iPhone standalone PWA。最终手动复核：加入主屏后在 `/calendar` 连续执行页面纵向滚动、长按 grip 移动、上/下把手 resize、拖动期间观察页面不跳动，并确认底栏/FAB/safe-area 无覆盖。

## 下一步（P-SCHED-0 关单前）

1. 稳定 standalone 状态注入 — 优先 `?pwa_sim=1` 初始加载，避免 post-load class 注入触发 navigation
2. 修复 isolated `schedule-usability.spec.js` fixture / 共享状态依赖
3. Ken：真机 iPhone Home Screen standalone QA
4. Fable：最终 product sign-off → merge `fable/p-sched-0`

**F-P6a / P-UIUX-0 禁止开始，直至 P-SCHED-0 合并关闭。**

_后续修复在此追加：日期 · ID · 根因 · commit/PR_
