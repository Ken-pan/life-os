# 七 App Roadmap 分卷

> **Hub 真源：** [`../../LIFEOS_ROADMAP.md`](../../LIFEOS_ROADMAP.md) §Now / §Next / §推荐执行顺序
> **本目录：** 各 app **产品向**排期细节（能力表 · 实现锚点 · 验收命令）
> **跨站主线：** [`../INTEGRATION.md`](../INTEGRATION.md) · [`../GROWTH.md`](../GROWTH.md)
> **E2E 证据：** [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md)

**脑暴日期：** 2026-07-09 · **复核：** 2026-07-14（新增 AIOS 第七分卷）· **执行分线：** [`../AGENT_WORKSTREAMS.md`](../AGENT_WORKSTREAMS.md)

执行顺序以 **hub §推荐执行顺序** 为准；下文不重复 Wave 全文。

## ID 命名（v2 · APP3）

| 前缀             | App     | 勿与下列混淆                                                                               |
| ---------------- | ------- | ------------------------------------------------------------------------------------------ |
| `P-P*` / `QA-P*` | Planner | `QA-P2` = desktop E2E                                                                      |
| `P-MOVE-*`       | Planner | reMarkable Paper Pro Move / PaperOS device track                                           |
| `FT-P*`          | Fitness | ≠ E2E 问题 **`QA-GYMS-0`**（端口冲突，已修）                                               |
| `F-P*`           | Finance | `F-P0` = route smoke；≠ Fitness **F-0**                                                    |
| `M-P*`           | Music   | `M-P1` ✅ 已发货                                                                           |
| `G-P*`           | Portal  | Growth 跨站；`G-P4`–`G-P6` ✅                                                              |
| `H-P*`           | Home    | Integration `H-P1–H-P5` 见 INTEGRATION                                                     |
| `H-W*`           | Home    | 空间编辑主线（墙图三步编辑器）≠ `H-P*`；[home-spatial-editor.md](./home-spatial-editor.md) |
| `AIOS.*`         | AIOS    | 本地优先 AI 助手（原生 Mac app）；[aios.md](./aios.md)                                     |

| APP3     | App                    | Workspace             | Legacy v1（勿在新 ticket 使用）               |
| -------- | ---------------------- | --------------------- | --------------------------------------------- |
| **PAPR** | **PaperOS** 设备 Shell | 代码暂驻 `planner-os` | `P-MOVE-*` · ~~`PLNR.PPOS.*`~~ · ~~`PPOS.*`~~ |
| **PLNR** | Planner                | `planner-os`          | `P-*` · `P-SCHED-*`                           |
| **FINC** | Finance                | `finance-os`          | `F-*`                                         |
| **GYMS** | Fitness                | `fitness-os`          | `FT-*` · ~~`FITN.*`~~                         |
| **MUSC** | Music                  | `music-os`            | `M-*`                                         |
| **PORT** | Portal / Growth        | `portal`              | `G-*`                                         |
| **HOME** | Home                   | `home-os`             | `H-P*` · `H-W*` → `HOME.SPATIAL.*`            |
| **AIOS** | AIOS 本地 AI 助手      | `aios-os`             | —（2026-07-13 新建，无 legacy）               |
| **INTG** | Integration            | —                     | `I-*`                                         |

**E2E 问题码：** Fitness 端口冲突 **`QA-GYMS-0`**（legacy `F-0` · ~~`QA-FITN-0`~~；≠ Finance `FINC.*`）。

跨站复用 hub：`INTG.EVENTS.1b` · `DSGN.CATALOG.7`（见 [`../DESIGN.md`](../DESIGN.md)）

## Hub §Next ↔ 分卷对照

| Canonical ID (v2)    | Legacy v1                                 | App 分卷                                        | 状态 / 锚点                                                            |
| -------------------- | ----------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| **PLNR.SCHED.0**     | `P-SCHED.0` · `P-SCHED-0`                 | [planner.md](./planner.md)                      | 🟡 migrate ✅ #15 · 10.pwa ✅ #18 · **10b.ios** 待 Ken |
| **PAPR.DATA.verify** | `P-MOVE.verify` · `P-MOVE-VERIFY`         | [paperos.md](./paperos.md)    | ✅ PASS 2026-07-11                                                     |
| **PAPR.SYS.0**       | `P-MOVE.SYS.0` · `P-MOVE-SYS-0`           | [paperos.md](./paperos.md)    | ✅ CONDITIONAL PASS accepted                                           |
| **PAPR.SYS.1b.fs**   | `P-MOVE.SYS.1b.fs` · `P-MOVE-SYS-1B-FS`   | [paperos.md](./paperos.md)    | ❌ BLOCKED / CLOSED                                                    |
| **PAPR.SYS.1b.jrn**  | `P-MOVE.SYS.1b.jrn` · `P-MOVE-SYS-1B-JRN` | [paperos.md](./paperos.md)    | 🟡 CONDITIONAL PASS accepted                                           |
| **PAPR.SYS.1**       | `P-MOVE.SYS.1` · `P-MOVE-SYS-1`           | [paperos.md](./paperos.md)    | 🟡 PRIMARY LANE — Ken + Codex 主航道                                       |
| **PAPR.SYS.2**       | `P-MOVE.SYS.2` · `P-MOVE-SYS-2`           | [paperos.md](./paperos.md)    | 🔒 not started                                                         |
| **PAPR.UI**          | `P-MOVE.UI` · `P-MOVE-UI`                 | [paperos.md](./paperos.md)    | 🔴 PR #27/#28 device gate BLOCKED · locale + stylus + Slice 2 visual   |
| **GYMS.SUB.5**       | `FT-P5`                                   | [fitness.md](./fitness.md)                      | 🟡 工程 PASS · 产品 BLOCKED                                            |
| **FINC.PURCHASE.6**  | `F-P6`                                    | [finance.md](./finance.md)                      | ⏳ `FINC.PURCHASE.6.r0` · `FINC.PURCHASE.6.a`                          |
| **PLNR.PROJ.3**      | `P-PROJ-3`                                | [planner.md](./planner.md)                      | ✅ Roadmap refs UI（2026-07-10）                                       |
| **PAPR.WRITE.5**     | `P-MOVE.5` · `P-MOVE-5`                   | [paperos.md](./paperos.md)    | 🟡 Code ✅ · DB `paper_device_actions` ❌ · Hub Deferred                |
| **PORT.GROWTH.4b-H** | `G-P4b-H`                                 | [portal.md](./portal.md) · [home.md](./home.md) | ✅ 2026-07-09 · `HOME.PROJ.6a`                                         |

**已发货（2026-07-09）：** `PORT.GROWTH.8` · `PORT.GROWTH.9` · `PORT.GROWTH.4b-H` · Phase 0–6 — [`../SHIPPED.md`](../SHIPPED.md)

## 一览（Top Next）

| App     | 层级   | Top Next                                            | 分卷                                                                      |
| ------- | ------ | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Planner | 生产   | **PLNR.SCHED.0** · Paper 数据 provider 维护          | [planner.md](./planner.md)                                                |
| Fitness | 生产   | **GYMS.SUB.5** 替代动作 · GYMS.PORTAL.2             | [fitness.md](./fitness.md)                                                |
| Finance | 生产   | **FINC.PURCHASE.6** 支出审核 · FINC.SYNC.1b         | [finance.md](./finance.md)                                                |
| Music   | 生产   | MUSC.PIPE.5 ✅ · 维护 · MUSC.PIPE.4 按需            | [music.md](./music.md)                                                    |
| Portal  | 启动器 | 维护 · UI 走查 P-1–P-12 ✅（走查序号，非 hub ticket） | [portal.md](./portal.md)                                                  |
| Home    | 实验   | **HOME.PROJ.7** 多项目切换 · HOME.SPATIAL.0–5 ✅    | [home.md](./home.md)                                                      |
| AIOS    | 实验/本地优先 | 高速迭代中（AIOS.1–25）· Portal 接入待研判       | [aios.md](./aios.md)                                                      |
| PaperOS | 独立仓库 | 设备 Shell，已迁出 → [paperos.md](./paperos.md)   | [paperos.md](./paperos.md)                                                |

## 跨站集成矩阵（只读 / 事件）

|                               | Planner | Fitness          | Finance | Music    | Portal             | Home     | AIOS          |
| ----------------------------- | ------- | ---------------- | ------- | -------- | ------------------ | -------- | ------------- |
| **读 `core_*`**               | ✅      | ✅               | ✅      | ✅       | ✅                 | ✅       | ✅ AIOS.20    |
| **`life_events` 生产**        | —       | ✅ GYMS.EVENTS.1 | ✅      | —        | —                  | —        | ✅ AIOS.21    |
| **`life_events` 消费**        | ✅      | —                | —       | —        | 角标 PORT.GROWTH.2 | —        | —             |
| **Portal 摘要 PORT.GROWTH.4** | ✅ 任务 | ✅ 训练          | ✅ 结余 | ✅ Music | ✅ Home            | —        | ❌ 未接入     |
| **业务数据云**                | ✅      | ✅               | ✅      | ✅       | —                  | ❌ local | ✅ 本地优先+云只读 |

## 已知阻塞（排期前必读）

| 阻塞                              | 影响项                                     | 解除方式                                                               |
| --------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| Home 仅 localStorage              | ~~**PORT.GROWTH.4b** Home 卡~~             | ✅ **HOME.PROJ.6a** 元数据 + **PORT.GROWTH.4b-H** 第五卡（2026-07-09） |
| `events.ts` 仅 `finance.bill_due` | ~~**INTG.EVENTS.1b** / **GYMS.EVENTS.1**~~ | ✅ 已扩 `fitness.workout_logged`（2026-07-09）                         |

## 当前排序 · Wave 投入估算

当前排序以 **hub §推荐执行顺序** 为准（避免双源漂移，见 §何时更新）；本分卷不重复具体序号/估时。

**已完成 Wave（2026-07-09）：** Phase 0–6 + Portal UI 走查 P-1–P-12 — 见 [`../SHIPPED.md`](../SHIPPED.md)

**Phase 7：** **PLNR.PROJ.3** → **PAPR.WRITE.5**；Home HOME.SPATIAL.0–5 已完成，不再作为下一档。

## 何时更新

1. 新想法 → 分卷 §Parked → 标 ROI → 进 hub §Next
2. hub §Next 完成 → 分卷标 ✅ + [`../SHIPPED.md`](../SHIPPED.md)
3. E2E 跑批后 → 同步 [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md) 问题 ID
4. **不要**在分卷复制 hub Now/Next 整表
