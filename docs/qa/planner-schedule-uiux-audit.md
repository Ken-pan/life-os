# Planner 日程视图 UI/UX 走查清单

> **Roadmap：** **P-SCHED-0** · [`../roadmap/apps/planner.md`](../roadmap/apps/planner.md)
> **Agent 线：** Line A · **Claude Code · Fable**（Claude usage credits）· Antigravity baseline · Codex/Cursor 补强
> **代码锚点：** `routes/calendar/` · `components/schedule/*` · `domain/schedule.js`

**状态：** 待首轮走查（2026-07-10 建单）

## 目标

让 **日历 / 日程时间轴** 达到「每天真的会用」——排期、改时间、看重叠、移动端能操作，而不是只有 Today 列表可用。

## 走查环境

| 层         | 命令 / 环境                                                            |
| ---------- | ---------------------------------------------------------------------- |
| Desktop    | `cd apps/planner && npm run dev` → `/calendar`                         |
| Mobile PWA | `npm run pwa:preview:planner` + Playwright `standalone-pwa` 或 iOS Sim |
| 截图回归   | `screenshot-achievement-schedule.spec.js`                              |

## 问题清单

图例：⬜ 待查 · 🟡 进行中 · ✅ 已修 · ⏸️ 搁置

| ID     | 区域               | 现象 / 风险                                              | 优先级 | 状态 |
| ------ | ------------------ | -------------------------------------------------------- | ------ | ---- |
| SCH-1  | 移动 `/calendar`   | 时间轴区域是否可滚动、是否被 AppBar/底栏遮挡             | P0     | ⬜   |
| SCH-2  | `DayTimeline`      | 拖放创建时间块：ghost 预览、冲突提示、snap 是否跟手      | P0     | ⬜   |
| SCH-3  | `TimeBlock`        | resize 上下把手、move、与 overlap 列宽是否可读           | P0     | ⬜   |
| SCH-4  | 重叠任务           | `overlappingTaskIds` 多列布局在 2–3 个重叠时是否可点     | P1     | ⬜   |
| SCH-5  | `UnscheduledPanel` | 从未排期拖入时间轴、与 Today「排进今天」行为一致         | P1     | ⬜   |
| SCH-6  | 日历周条           | 选中日 vs 有任务 dot、`?date=` URL 同步                  | P2     | ⬜   |
| SCH-7  | Desktop split      | 右侧 `CalendarContextPanel` 与主栏信息是否重复/脱节      | P2     | ⬜   |
| SCH-8  | 当前时间线         | `now` marker 仅今天显示；滚动是否自动滚到当前小时附近    | P2     | ⬜   |
| SCH-9  | 空日 / 稀疏日      | `sparseHint` 与空时间轴文案是否引导用户排期              | P2     | ⬜   |
| SCH-10 | PWA iOS            | 单滚动容器（`.life-os-page-workspace`）；无 `100vh` 裁切 | P1     | ⬜   |

## 验收标准（P-SCHED-0 关闭条件）

1. SCH-1～SCH-5 无 P0 开放项（或明确 ⏸️ 并记入 hub Parked）
2. Desktop + mobile 各完成一轮走查截图 → `docs/ui-qa-screenshots/planner/schedule/`
3. `domain/schedule.test.js` 现有用例仍绿；新增项有单元测试或 E2E 锚点
4. 产品主观：**能在日程视图完成「改时间、看重叠、排新块」而不回 Today**

## 修复记录

_修 issue 后在此追加：日期 · ID · 根因 · commit/PR_
