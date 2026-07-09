# 六 App Roadmap 分卷

> **Hub 真源：** [`../../LIFEOS_ROADMAP.md`](../../LIFEOS_ROADMAP.md) §Now / §Next / §推荐执行顺序
> **本目录：** 各 app **产品向**排期细节（能力表 · 实现锚点 · 验收命令）
> **跨站主线：** [`../INTEGRATION.md`](../INTEGRATION.md) · [`../GROWTH.md`](../GROWTH.md)
> **E2E 证据：** [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md)

**脑暴日期：** 2026-07-09 · **潜力研判：** [`../POTENTIAL.md`](../POTENTIAL.md)

执行顺序以 **hub §推荐执行顺序** 为准；下文不重复 Wave 全文。

## ID 命名（避免混淆）

| 前缀             | App     | 勿与下列混淆                                                                               |
| ---------------- | ------- | ------------------------------------------------------------------------------------------ |
| `P-P*` / `QA-P*` | Planner | `QA-P2` = desktop E2E                                                                      |
| `P-MOVE-*`       | Planner | reMarkable Paper Pro Move / PaperOS device track                                            |
| `FT-P*`          | Fitness | ≠ E2E 问题 **F-0**（端口冲突，已修）                                                       |
| `F-P*`           | Finance | `F-P0` = route smoke；≠ Fitness **F-0**                                                    |
| `M-P*`           | Music   | `M-P1` ✅ 已发货                                                                           |
| `G-P*`           | Portal  | Growth 跨站；`G-P4`–`G-P6` ✅                                                              |
| `H-P*`           | Home    | Integration `H-P1–H-P5` 见 INTEGRATION                                                     |
| `H-W*`           | Home    | 空间编辑主线（墙图三步编辑器）≠ `H-P*`；[home-spatial-editor.md](./home-spatial-editor.md) |

跨站复用 hub：`I-P1.5b` · `D-P7`（见 [`../DESIGN.md`](../DESIGN.md)）

## Hub §Next ↔ 分卷对照

| Hub ID      | App 分卷                                        | 状态 / 锚点           |
| ----------- | ----------------------------------------------- | --------------------- |
| **P-MOVE-1** | [planner-pro-move.md](./planner-pro-move.md) | 🟡 home-only launcher baseline |
| **G-P4b-H** | [portal.md](./portal.md) · [home.md](./home.md) | ✅ 2026-07-09 · H-P6a |

**已发货（2026-07-09）：** G-P8 · G-P9 · G-P4b-H · Phase 0–6 — [`../SHIPPED.md`](../SHIPPED.md)

## 一览（Top Next）

| App     | 层级   | Top Next                          | 分卷                       |
| ------- | ------ | --------------------------------- | -------------------------- |
| Planner | 生产   | **P-MOVE-1** PaperOS · P-P4 | [planner.md](./planner.md) · [planner-pro-move.md](./planner-pro-move.md) |
| Fitness | 生产   | FT-P1 ✅ · 维护 E2E               | [fitness.md](./fitness.md) |
| Finance | 生产   | F-P3 ✅ · F-P1b                   | [finance.md](./finance.md) |
| Music   | 生产   | M-P5 ✅ · 管道维护                | [music.md](./music.md)     |
| Portal  | 启动器 | 维护 · UI 走查 P-1–P-12 ✅        | [portal.md](./portal.md)   |
| Home    | 实验   | **H-W3** 手绘分区 · Wave UX ✅    | [home.md](./home.md)       |

## 跨站集成矩阵（只读 / 事件）

|                        | Planner | Fitness  | Finance | Music    | Portal    | Home     |
| ---------------------- | ------- | -------- | ------- | -------- | --------- | -------- |
| **读 `core_*`**        | ✅      | ✅       | ✅      | ✅       | ✅        | ✅       |
| **`life_events` 生产** | —       | ✅ FT-P1 | ✅      | —        | —         | —        |
| **`life_events` 消费** | ✅      | —        | —       | —        | 角标 G-P2 | —        |
| **Portal 摘要 G-P4**   | ✅ 任务 | ✅ 训练  | ✅ 结余 | ✅ Music | ✅ Home   | —        |
| **业务数据云**         | ✅      | ✅       | ✅      | ✅       | —         | ❌ local |

## 已知阻塞（排期前必读）

| 阻塞                              | 影响项                      | 解除方式                                               |
| --------------------------------- | --------------------------- | ------------------------------------------------------ |
| Home 仅 localStorage              | ~~**G-P4b** Home 卡~~       | ✅ **H-P6a** 元数据 + **G-P4b-H** 第五卡（2026-07-09） |
| `events.ts` 仅 `finance.bill_due` | ~~**I-P1.5b** / **FT-P1**~~ | ✅ 已扩 `fitness.workout_logged`（2026-07-09）         |

## 潜力排序（→ [`../POTENTIAL.md`](../POTENTIAL.md)）

| 序  | 项            | 说明                     |
| --- | ------------- | ------------------------ | ------------- |
| 1   | **M-P5**      | 行为分验收（有曲库账号） |
| 2   | **G-P8/G-P9** | Portal 角标深链 + smoke  |
| 3   | **G-P4b-H**   | Home 卡（H-P6a 后）      | ✅ 2026-07-09 |

## Wave 投入估算（单人 · Phase 5+）

| Phase | 项                  | 合计  |
| ----- | ------------------- | ----- | ------------- |
| **5** | G-P8 + G-P9 + M-P5  | ~2–3d |
| **6** | G-P4b-H（H-P6a 后） | ~1–2d | ✅ 2026-07-09 |

**已完成 Wave（2026-07-09）：** Phase 0–6 + Portal UI 走查 P-1–P-12 — 见 [`../SHIPPED.md`](../SHIPPED.md)

**下一档（Phase 7）：** **H-W3** Home 手绘分区 — 见 [`home.md`](./home.md) · [`home-spatial-editor.md`](./home-spatial-editor.md)

## 何时更新

1. 新想法 → 分卷 §Parked → 标 ROI → 进 hub §Next
2. hub §Next 完成 → 分卷标 ✅ + [`../SHIPPED.md`](../SHIPPED.md)
3. E2E 跑批后 → 同步 [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md) 问题 ID
4. **不要**在分卷复制 hub Now/Next 整表
