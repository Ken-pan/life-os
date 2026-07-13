# 六 App Roadmap 分卷

> **Hub 真源：** [`../../LIFEOS_ROADMAP.md`](../../LIFEOS_ROADMAP.md) §Now / §Next / §推荐执行顺序
> **本目录：** 各 app **产品向**排期细节（能力表 · 实现锚点 · 验收命令）
> **跨站主线：** [`../INTEGRATION.md`](../INTEGRATION.md) · [`../GROWTH.md`](../GROWTH.md)
> **E2E 证据：** [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md)

**脑暴日期：** 2026-07-09 · **复核：** 2026-07-11 · **Agent 分配：** [`../AGENT_WORKSTREAMS.md`](../AGENT_WORKSTREAMS.md) §0

执行顺序以 **hub §推荐执行顺序** 为准；下文不重复 Wave 全文。

## ID 命名（v2 · APP3）

| 前缀             | App     | 勿与下列混淆                                                                               |
| ---------------- | ------- | ------------------------------------------------------------------------------------------ |
| `P-P*` / `QA-P*` | Planner | `QA-P2` = desktop E2E                                                                      |
| `P-MOVE-*`       | Planner | reMarkable Paper Pro Move / PaperOS device track                                           |
| `FT-P*`          | Fitness | ≠ E2E 问题 **F-0**（端口冲突，已修）                                                       |
| `F-P*`           | Finance | `F-P0` = route smoke；≠ Fitness **F-0**                                                    |
| `M-P*`           | Music   | `M-P1` ✅ 已发货                                                                           |
| `G-P*`           | Portal  | Growth 跨站；`G-P4`–`G-P6` ✅                                                              |
| `H-P*`           | Home    | Integration `H-P1–H-P5` 见 INTEGRATION                                                     |
| `H-W*`           | Home    | 空间编辑主线（墙图三步编辑器）≠ `H-P*`；[home-spatial-editor.md](./home-spatial-editor.md) |

| APP3     | App                    | Workspace             | Legacy v1（勿在新 ticket 使用）               |
| -------- | ---------------------- | --------------------- | --------------------------------------------- |
| **PAPR** | **PaperOS** 设备 Shell | 代码暂驻 `planner-os` | `P-MOVE-*` · ~~`PLNR.PPOS.*`~~ · ~~`PPOS.*`~~ |
| **PLNR** | Planner                | `planner-os`          | `P-*` · `P-SCHED-*`                           |
| **FINC** | Finance                | `finance-os`          | `F-*`                                         |
| **GYMS** | Fitness                | `fitness-os`          | `FT-*` · ~~`FITN.*`~~                         |
| **MUSC** | Music                  | `music-os`            | `M-*`                                         |
| **PORT** | Portal / Growth        | `portal`              | `G-*`                                         |
| **HOME** | Home                   | `home-os`             | `H-P*` · `H-W*` → `HOME.SPATIAL.*`            |
| **INTG** | Integration            | —                     | `I-*`                                         |

**E2E 问题码：** Fitness 端口冲突 **`QA-GYMS-0`**（legacy `F-0` · ~~`QA-FITN-0`~~；≠ Finance `FINC.*`）。

跨站复用 hub：`INTG.EVENTS.1b` · `DSGN.CATALOG.7`（见 [`../DESIGN.md`](../DESIGN.md)）

## Hub §Next ↔ 分卷对照

| Hub ID             | App 分卷                                        | 状态 / 锚点                                                                                                                                         |
| ------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P-SCHED-0**      | [planner.md](./planner.md)                      | 🟡 baseline ✅ · legacy tags + mobile scroll 待修 · [`planner-schedule-antigravity-baseline.md`](../../qa/planner-schedule-antigravity-baseline.md) |
| **P-MOVE-VERIFY**  | [planner-pro-move.md](./planner-pro-move.md)    | ◆ Line **E** only · 设备 token E2E                                                                                                                  |
| **P-MOVE-SYS-0**   | [planner-pro-move.md](./planner-pro-move.md)    | 🔥 生命周期发现 · VERIFY 同窗口                                                                                                                     |
| **P-MOVE-SYS-1/2** | [planner-pro-move.md](./planner-pro-move.md)    | ⏳ enter/exit · sleep/wake                                                                                                                          |
| **P-MOVE-UI**      | [planner-pro-move.md](./planner-pro-move.md)    | 🟡 Slice 1.1 设备复验 · Slice 2 IA 可早做                                                                                                           |
| **FT-P5**          | [fitness.md](./fitness.md)                      | ⏳ 替代动作完整流                                                                                                                                   |
| **F-P6**           | [finance.md](./finance.md)                      | ⏳ 支出审核（Amazon/BBY/Target）                                                                                                                    |
| **P-PROJ-3**       | [planner.md](./planner.md)                      | ✅ Roadmap refs UI（2026-07-10）                                                                                                                    |
| **P-MOVE-5**       | [planner-pro-move.md](./planner-pro-move.md)    | ⏳ controlled write staging gate                                                                                                                    |
| **G-P4b-H**        | [portal.md](./portal.md) · [home.md](./home.md) | ✅ 2026-07-09 · H-P6a                                                                                                                               |

**已发货（2026-07-09）：** `PORT.GROWTH.8` · `PORT.GROWTH.9` · `PORT.GROWTH.4b-H` · Phase 0–6 — [`../SHIPPED.md`](../SHIPPED.md)

## 一览（Top Next）

| App     | 层级   | Top Next                                            | 分卷                                                                      |
| ------- | ------ | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Planner | 生产   | **P-SCHED-0** · **P-MOVE-VERIFY→SYS-0** · P-MOVE-UI | [planner.md](./planner.md) · [planner-pro-move.md](./planner-pro-move.md) |
| Fitness | 生产   | **FT-P5** 替代动作 · FT-P2                          | [fitness.md](./fitness.md)                                                |
| Finance | 生产   | **F-P6** 支出审核 · F-P1b                           | [finance.md](./finance.md)                                                |
| Music   | 生产   | M-P5 ✅ · 维护 · M-P4 按需                          | [music.md](./music.md)                                                    |
| Portal  | 启动器 | 维护 · UI 走查 P-1–P-12 ✅                          | [portal.md](./portal.md)                                                  |
| Home    | 实验   | **H-P7** 多项目切换 · H-W0–W5 ✅                    | [home.md](./home.md)                                                      |

## 跨站集成矩阵（只读 / 事件）

|                               | Planner | Fitness          | Finance | Music    | Portal             | Home     |
| ----------------------------- | ------- | ---------------- | ------- | -------- | ------------------ | -------- |
| **读 `core_*`**               | ✅      | ✅               | ✅      | ✅       | ✅                 | ✅       |
| **`life_events` 生产**        | —       | ✅ GYMS.EVENTS.1 | ✅      | —        | —                  | —        |
| **`life_events` 消费**        | ✅      | —                | —       | —        | 角标 PORT.GROWTH.2 | —        |
| **Portal 摘要 PORT.GROWTH.4** | ✅ 任务 | ✅ 训练          | ✅ 结余 | ✅ Music | ✅ Home            | —        |
| **业务数据云**                | ✅      | ✅               | ✅      | ✅       | —                  | ❌ local |

## 已知阻塞（排期前必读）

| 阻塞                              | 影响项                                     | 解除方式                                                               |
| --------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| Home 仅 localStorage              | ~~**PORT.GROWTH.4b** Home 卡~~             | ✅ **HOME.PROJ.6a** 元数据 + **PORT.GROWTH.4b-H** 第五卡（2026-07-09） |
| `events.ts` 仅 `finance.bill_due` | ~~**INTG.EVENTS.1b** / **GYMS.EVENTS.1**~~ | ✅ 已扩 `fitness.workout_logged`（2026-07-09）                         |

## 当前排序（→ hub §Now / §Next）

| 序  | 项                        | 说明                                              |
| --- | ------------------------- | ------------------------------------------------- |
| 1   | **P-SCHED-0**             | 日程视图 debug + 可用性（Planner 最高产品优先级） |
| 2   | **P-MOVE-VERIFY → SYS-0** | 数据面复验 + 生命周期发现（同一设备窗口）         |
| 3   | **F-P6**                  | Finance 支出审核（商品级 + 后续处理）             |
| 4   | **FT-P5**                 | Fitness 替代动作（Codex 实现）                    |
| 5   | **P-MOVE-5**              | controlled write staging                          |
| 6   | **F-P1b / P-P4**          | Codex · Cursor Auto（不用 Fable / Copilot Agent） |

## Wave 投入估算（单人 · Phase 5+）

| Phase | 项                                                       | 合计  |
| ----- | -------------------------------------------------------- | ----- |
| **7** | P-SCHED-0 + P-MOVE-BLOCK + F-P6a + P-MOVE-UI（Today 起） | ~4–6d |
| **8** | FT-P5 + F-P6b + P-MOVE-5 + P-MOVE-6                      | ~4–5d |
| **9** | F-P1b + FT-P2 + P-P4                                     | ~1–2d |

**已完成 Wave（2026-07-09）：** Phase 0–6 + Portal UI 走查 P-1–P-12 — 见 [`../SHIPPED.md`](../SHIPPED.md)

**Phase 7：** **PLNR.PROJ.3** → **PAPR.WRITE.5**；Home HOME.SPATIAL.0–5 已完成，不再作为下一档。

## 何时更新

1. 新想法 → 分卷 §Parked → 标 ROI → 进 hub §Next
2. hub §Next 完成 → 分卷标 ✅ + [`../SHIPPED.md`](../SHIPPED.md)
3. E2E 跑批后 → 同步 [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md) 问题 ID
4. **不要**在分卷复制 hub Now/Next 整表
