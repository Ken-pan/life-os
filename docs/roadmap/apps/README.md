# 六 App Roadmap 分卷

> **Hub 真源：** [`../../LIFEOS_ROADMAP.md`](../../LIFEOS_ROADMAP.md) §Now / §Next / §推荐执行顺序
> **本目录：** 各 app **产品向**排期细节（能力表 · 实现锚点 · 验收命令）
> **跨站主线：** [`../INTEGRATION.md`](../INTEGRATION.md) · [`../GROWTH.md`](../GROWTH.md)
> **E2E 证据：** [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md)

**脑暴日期：** 2026-07-09 · **潜力研判：** [`../POTENTIAL.md`](../POTENTIAL.md)

执行顺序以 **hub §推荐执行顺序** 为准；下文不重复 Wave 全文。

## ID 命名（避免混淆）

| 前缀             | App     | 勿与下列混淆                            |
| ---------------- | ------- | --------------------------------------- |
| `P-P*` / `QA-P*` | Planner | `QA-P2` = desktop E2E                   |
| `FT-P*`          | Fitness | ≠ E2E 问题 **F-0**（端口冲突，已修）    |
| `F-P*`           | Finance | `F-P0` = route smoke；≠ Fitness **F-0** |
| `M-P*`           | Music   | `M-P1` ✅ 已发货                        |
| `G-P*`           | Portal  | Growth 跨站；`G-P4` ✅ · `G-P4b` ⏳     |
| `H-P*`           | Home    | Integration `H-P1–H-P5` 见 INTEGRATION  |

跨站复用 hub：`I-P1.5b` · `D-P7`（见 [`../DESIGN.md`](../DESIGN.md)）

## Hub §Next ↔ 分卷对照

| Hub ID      | App 分卷                                                           | 实现锚点（入口）                                       |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| **F-P3**    | [finance.md](./finance.md#f-p3)                                    | `useDashboard.ts` · audit `08_TEST_AND_QA_COVERAGE.md` |
| **G-P4b-M** | [portal.md](./portal.md#g-p4b-m)                                   | 扩 `portal_today_summary` · `music.play_events`        |
| **M-P2**    | [music.md](./music.md#m-p2)                                        | 新建 Playwright                                        |
| **P-P2**    | [planner.md](./planner.md#p-p2)                                    | Insight E2E（QA-P2 desktop 21/22 ✅ 后）               |
| **I-P1.5b** | [fitness.md](./fitness.md#ft-p1) · [planner.md](./planner.md#p-p5) | `fitness.workout_logged` · `events.ts`                 |

## 一览（Top Next）

| App     | 层级   | Top Next               | 分卷                       |
| ------- | ------ | ---------------------- | -------------------------- |
| Planner | 生产   | **P-P2** Insight       | [planner.md](./planner.md) |
| Fitness | 生产   | **FT-P0** · FT-P1 条件 | [fitness.md](./fitness.md) |
| Finance | 生产   | **F-P3**               | [finance.md](./finance.md) |
| Music   | 生产   | **M-P2** · **M-P5**    | [music.md](./music.md)     |
| Portal  | 启动器 | **G-P4b-M** · **G-P6** | [portal.md](./portal.md)   |
| Home    | 实验   | **H-P6a** · **H-P7**   | [home.md](./home.md)       |

## 跨站集成矩阵（只读 / 事件）

|                        | Planner | Fitness  | Finance | Music      | Portal     | Home     |
| ---------------------- | ------- | -------- | ------- | ---------- | ---------- | -------- |
| **读 `core_*`**        | ✅      | ✅       | ✅      | ✅         | ✅         | ✅       |
| **`life_events` 生产** | —       | ⏳ FT-P1 | ✅      | —          | —          | —        |
| **`life_events` 消费** | ✅      | —        | —       | —          | 角标 G-P2  | —        |
| **Portal 摘要 G-P4**   | ✅ 任务 | ✅ 训练  | ✅ 结余 | ⏳ G-P4b-M | ⏳ G-P4b-H | —        |
| **业务数据云**         | ✅      | ✅       | ✅      | ✅         | —          | ❌ local |

## 已知阻塞（排期前必读）

| 阻塞                              | 影响项                             | 解除方式                                                                     |
| --------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| Home 仅 localStorage              | **G-P4b** Home 卡、`H-P6` 储藏区数 | **H-P6a** 轻量上报 `storage_zone_count` 到 `core_*` 元数据；或卡片仅深链无数 |
| `events.ts` 仅 `finance.bill_due` | **I-P1.5b** / **FT-P1**            | 扩 Zod + migration 触发器（`fitness.workout_logged`）                        |
| `events.ts` 仅 `finance.bill_due` | **I-P1.5b** / **FT-P1**            | 扩 Zod + migration 触发器（`fitness.workout_logged`）                        |

## 潜力排序（→ [`../POTENTIAL.md`](../POTENTIAL.md)）

| 序  | 项                     | 说明                            |
| --- | ---------------------- | ------------------------------- |
| 1   | **F-P3**               | 信任锚点                        |
| 2   | **G-P4b-M** + **M-P2** | Portal 快赢 + Music E2E         |
| 3   | **CI 接线**            | F-P0/QA-P2 本地 ✅，未进 ci.yml |
| 4   | **FT-P1**              | 条件跨站                        |

## Wave 投入估算（单人 · Phase 0–3）

| Phase  | 项                    | 合计  |
| ------ | --------------------- | ----- |
| **0**  | F-P3                  | ~2–3d |
| **1**  | G-P4b-M + M-P2 + P-P2 | ~2–3d |
| **1b** | CI 接线（可选）       | ~1d   |
| **3**  | FT-P1 + G-P4b-H       | ~4–6d |

## 何时更新

1. 新想法 → 分卷 §Parked → 标 ROI → 进 hub §Next
2. hub §Next 完成 → 分卷标 ✅ + [`../SHIPPED.md`](../SHIPPED.md)
3. E2E 跑批后 → 同步 [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md) 问题 ID
4. **不要**在分卷复制 hub Now/Next 整表
