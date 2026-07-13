# Planner 任务行（Ticket）展示规范 — 草案

> **Roadmap：** **P-TASK-DISPLAY-0**（并入 **PLNR.UIUX.0** 走查）· [`../roadmap/apps/planner.md`](../roadmap/apps/planner.md)
> **代码锚点：** `TaskRow.svelte` · `taskMetaLine.js` · `taskKind.js` · `lifeEventSource.js`
> **状态：** 2026-07-10 与 P-SCHED-0 直接相关的 Today / Calendar 切片已实现并通过回归。**P-SCHED-0 整体仍为 BLOCKED**（见 [`planner-schedule-uiux-audit.md`](./planner-schedule-uiux-audit.md)）；本规范语义不变，待 P-UIUX-0 全站走查时继续验收非日程页面。

## 问题

当前任务行信息**堆在一行小字**里（`buildTaskMetaLine`），且 **Today 全面 `compactRows`** 导致第二行 chip（项目、Finance/Fitness 来源）**整行隐藏**。结果：

- Focus 只在 meta 里多一个词「关键」，`task-row--focus` **几乎无样式**
- Habit（含循环推断）**无视觉区分**
- 子任务进度、`nextAction`、effort **列表里完全不可见**
- Calendar / Today 同一任务应显示不同「下一眼信息」，但逻辑未按视图分层

## 信息架构（固定三层）

```text
┌─ 标题行 ───────────────────────────── [排程按钮]
│  可选：kind 标记（点/色条） + 标题
├─ 小字行（meta line）─ 随「当前页面」变化，只答一个问题
└─ Chip 行（secondary）─ 稳定上下文：来源 · 项目 · 标签 · 提醒
```

**原则：**

1. **小字只答一个问题** — 「何时做？」或「为何在这？」或「还差什么？」
2. **不重复页面已提供的上下文** — Today 列表不重复写「今天」
3. **特别类别用形态区分** — 色条/图标/chip，不只靠 meta 文案
4. **Compact 仍保留关键 chip** — 项目、life_event 来源在 Today 也必须可见

---

## 小字行：按页面显示什么

| 页面 / 场景         | `contextDate` | 小字应显示（优先级从高到低）                                                              | 应隐藏                                        |
| ------------------- | ------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Today · 今日**    | today         | ① 已排程 `09:00–10:30 · 1h30m` ② 仅截止 `截止 20:00` ③ 未排程 `未排程`（可带 `预计 30m`） | 日期、P0 文案（用 checkbox 色）、「关键」字样 |
| **Today · 逾期**    | today         | ① 原到期日 `7月3日` ② 若有排程再附时段                                                    | 「今天」                                      |
| **Today · 已完成**  | today         | `metaMinimal`：`09:00` 或空                                                               | 全部次要信息                                  |
| **Calendar / 日程** | selected day  | ① 时段 + 时长 ② 无时段 → `未排程` + 截止时刻                                              | 日期（周条已选）                              |
| **Upcoming**        | —             | ① `7月12日 周五` ② + `09:00` 或 `截止 20:00` ③ 循环 `每周一`                              | —                                             |
| **Inbox**           | —             | ① `无日期` / `7月12日` ② 可选 `下一步：…`（截断）                                         | 排程细节（若无）                              |
| **Project 详情**    | —             | 同 Upcoming；无 project chip                                                              | 项目名 chip                                   |
| **Triage**          | —             | `缺下一步` / `建议拆分` / effort                                                          | —                                             |
| **Done log**        | —             | 完成日或原排程时刻                                                                        | chips 可折叠                                  |

### Meta 拼接规则（实现导向）

```text
if minimal → scheduledStart | dueTime | ''

if overdue → dueDate

else if scheduledStart → range + duration
else if onContextDay → unscheduledLine（「未排程」）+ optional duration
else if dueDate → shortDate + unscheduledOnly
else → unscheduledOnly

// 从 meta 行移除（改到形态/chip）：
// - kindFocus 文字、P0/P1/P2 文字、recurrence（非 Today）
```

---

## 哪些类别需要「特别显示」

### A. 任务类型 `meta.kind`（必须形态区分）

| Kind         | 视觉（行级）                                      | 小字侧重                         | 排序 / 分组                       |
| ------------ | ------------------------------------------------- | -------------------------------- | --------------------------------- |
| **focus**    | 左侧 **accent 竖条** 或浅底；checkbox 已有 accent | **只显示时段+时长**              | Today 置顶区；Calendar 时间轴加粗 |
| **micro**    | 标题前 **小圆点**（已有）                         | **只显示 `15m` 或时段**          | 夹在 focus 之间；不抢视觉         |
| **habit**    | Chip 行 **`循环` 图标** + recurrence 短标签       | Today **不显示** recurrence 文字 | 可与 Today 分组或混排             |
| **standard** | 默认                                              | 按上表                           | 默认                              |

> `habit` 可由 `recurrence` 推断（`taskKind.js` 已有）— 列表里应一致对待显式 habit 与循环任务。

### B. 来源 / 系统集成（Chip 行 · **compact 也要显示**）

| 类型             | 识别                                     | 显示                    | 原因                         |
| ---------------- | ---------------------------------------- | ----------------------- | ---------------------------- |
| **Finance 账单** | `meta.lifeEventRef.domain === 'finance'` | `Finance` chip → 深链   | 系统生成，需知来源与跳转付账 |
| **Fitness 打卡** | `lifeEventRef.domain === 'fitness'`      | `Fitness` chip          | 与习惯/训练闭环              |
| **项目**         | `projectId`                              | 项目 chip（Today 也要） | 执行上下文                   |
| **提醒**         | `reminderMinutes`                        | 🔔                      | 已有                         |

### C. 优先级 / 风险（轻量，避免 meta 拥挤）

| 类型           | 显示                           | 说明               |
| -------------- | ------------------------------ | ------------------ |
| **P0**         | checkbox accent（已有）        | 不再在小字写「P0」 |
| **逾期**       | meta 红色 + 操作条（已有）     | 保持               |
| **有子任务**   | 小字或 chip：`2/5`             | 列表可扫进度       |
| **needsSplit** | 仅 Inbox/Triage：`待拆分` chip | triage 专用        |

### D. 暂不进列表（仅编辑器 / 详情）

- `notes` 全文、`aiHints`、`roadmapRefs`（项目页另有）、`tags` 过多时收起到 `+N`

---

## 与排程视图的关系（PLNR.SCHED.0）

| 视图            | 任务行差异                                                                           |
| --------------- | ------------------------------------------------------------------------------------ |
| Calendar 列表区 | `compactRows` + `showScheduleAction` — 小字 **偏时段**；「排进今天/调整」在 trailing |
| DayTimeline 块  | `TimeBlock` 内 **标题截断**；完整 meta 在块 tooltip 或点击编辑                       |
| 两者一致        | 同一 `scheduledStart` / `durationMinutes` 口径                                       |

---

## 验收（P-TASK-DISPLAY-0 关闭）

1. Today 上一笔 **Focus**：左侧色条 + 小字仅时段，无「关键」字样
2. Today 上 **Finance 账单任务**：compact 下仍可见 Finance chip
3. **Habit / 循环**：Chip 有循环标，Today 小字不重复 recurrence 长文案
4. **有子任务**：列表可见 `n/m`
5. 走查截图：`docs/ui-qa-screenshots/planner/task-display/`（Today / Inbox / Calendar / Upcoming 各一屏）

## 实现切片（建议顺序）

| 步  | 内容                                                         | 文件                           |
| --- | ------------------------------------------------------------ | ------------------------------ |
| 1   | 重写 `buildTaskMetaLine` 视图矩阵 + 去掉 kind/priority 文字  | `taskMetaLine.js`              |
| 2   | Focus 色条 + habit 图标 CSS                                  | `app.css` · `TaskRow.svelte`   |
| 3   | `showSecondaryMeta` 在 compact 下仍显示 life_event + project | `TaskRow.svelte`               |
| 4   | 子任务计数 `subtasks.filter(done).length`                    | `taskMetaLine.js` 或 `TaskRow` |
| 5   | 截图 + 更新本规范                                            | QA                             |

**Agent：** 并入 **PLNR.SCHED.0** Fable session（不单占额度）· Codex 单测
