# 九 App Roadmap 分卷

> **Hub 真源：** [`../../LIFEOS_ROADMAP.md`](../../LIFEOS_ROADMAP.md) §Now / §Next / §推荐执行顺序
> **本目录：** 各 app **产品向**排期细节（能力表 · 实现锚点 · 验收命令）
> **跨站主线：** [`../INTEGRATION.md`](../INTEGRATION.md) · [`../GROWTH.md`](../GROWTH.md)
> **E2E 证据：** [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md)

**脑暴日期：** 2026-07-09 · **复核：** 2026-07-17 夜（auto-refine + 表格块 + 复利/USAGE）· **执行分线：** [`../AGENT_WORKSTREAMS.md`](../AGENT_WORKSTREAMS.md) · **复利：** [`../COMPOUND.md`](../COMPOUND.md)

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
| `KNOW.*`         | KnowledgeOS | 长期记忆层（原生 Mac app，取代 Obsidian）；[knowledge.md](./knowledge.md)               |
| `HLT-*`          | HealthOS | 状态调节中枢（Mac + Watch/iPhone companion）；[health.md](./health.md)                  |

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
| **KNOW** | KnowledgeOS 长期记忆层 | `knowledge-os`        | —（2026-07-16 新建，无 legacy）               |
| **HLT**  | HealthOS 状态调节中枢  | `health-os`           | —（2026-07-16 从模板晋升）                    |
| **INTG** | Integration            | —                     | `I-*`                                         |

**E2E 问题码：** Fitness 端口冲突 **`QA-GYMS-0`**（legacy `F-0` · ~~`QA-FITN-0`~~；≠ Finance `FINC.*`）。

跨站复用 hub：`INTG.EVENTS.1b` · `DSGN.CATALOG.7`（见 [`../DESIGN.md`](../DESIGN.md)）

## Hub §Next ↔ 分卷对照

| Canonical ID (v2)    | Legacy v1                                 | App 分卷                                        | 状态 / 锚点                                                            |
| -------------------- | ----------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| **PLNR.SCHED.0**     | `P-SCHED.0` · `P-SCHED-0`                 | [planner.md](./planner.md)                      | 🟡 仅剩 **10b.ios** 用户 gate；不再阻塞 Agent 主航道 |
| **PAPR.DATA.verify** | `P-MOVE.verify` · `P-MOVE-VERIFY`         | [paperos.md](./paperos.md)    | ✅ PASS 2026-07-11                                                     |
| **PAPR.SYS.0**       | `P-MOVE.SYS.0` · `P-MOVE-SYS-0`           | [paperos.md](./paperos.md)    | ✅ CONDITIONAL PASS accepted                                           |
| **PAPR.SYS.1b.fs**   | `P-MOVE.SYS.1b.fs` · `P-MOVE-SYS-1B-FS`   | [paperos.md](./paperos.md)    | ❌ BLOCKED / CLOSED                                                    |
| **PAPR.SYS.1b.jrn**  | `P-MOVE.SYS.1b.jrn` · `P-MOVE-SYS-1B-JRN` | [paperos.md](./paperos.md)    | 🟡 CONDITIONAL PASS accepted                                           |
| **PAPR.SYS.1**       | `P-MOVE.SYS.1` · `P-MOVE-SYS-1`           | [paperos.md](./paperos.md)    | 🟡 PRIMARY LANE — Ken + Codex 主航道（独立仓库）                           |
| **PAPR.SYS.2**       | `P-MOVE.SYS.2` · `P-MOVE-SYS-2`           | [paperos.md](./paperos.md)    | 🔒 not started                                                         |
| **PAPR.UI**          | `P-MOVE.UI` · `P-MOVE-UI`                 | [paperos.md](./paperos.md)    | 🔴 PR #27/#28 device gate BLOCKED · 已迁出独立仓库                     |
| **GYMS.SUB.5**       | `FT-P5`                                   | [fitness.md](./fitness.md)                      | ✅ 2026-07-13 收割 · #19 `67e72b81`                                    |
| **FINC.PURCHASE.6**  | `F-P6`                                    | [finance.md](./finance.md)                      | 🟡 6.a code/RPC/过滤拆分完成；仅剩 owner live + 双 JWT RLS + 视觉 closure |
| **FINC.SYNC.1b**     | —                                         | [finance.md](./finance.md)                      | ✅ 2026-07-13 · popup last sync + retry · 18/18                       |
| **PLNR.CORE.4**      | —                                         | [planner.md](./planner.md) · [portal.md](./portal.md) | ✅ 2026-07-13 · Today↔Portal 计数对齐 · parity 9/9              |
| **HLT-0–4**          | —                                         | [health.md](./health.md)                      | ✅ 2026-07-16 · App/Focus/State Engine/自适应/趋势；companion 真机 gate 待用户 |
| **PLNR.PROJ.3**      | `P-PROJ-3`                                | [planner.md](./planner.md)                      | ✅ Roadmap refs UI（2026-07-10）                                       |
| **PAPR.WRITE.5**     | `P-MOVE.5` · `P-MOVE-5`                   | [paperos.md](./paperos.md)    | 🟡 Code ✅ · DB `paper_device_actions` ❌ · Hub Deferred                |
| **PORT.GROWTH.4b-H** | `G-P4b-H`                                 | [portal.md](./portal.md) · [home.md](./home.md) | ✅ 2026-07-09 · `HOME.PROJ.6a`                                         |

**已发货（2026-07-13+）：** `GYMS.SUB.5` · `FINC.SYNC.1b` · `PLNR.CORE.4` · AIOS.20–25 · HLT-0–4 · Home 云扫描/照片/事件生产链 · DS 07-15–17 — [`../SHIPPED.md`](../SHIPPED.md)
**已发货（2026-07-09）：** `PORT.GROWTH.8` · `PORT.GROWTH.9` · `PORT.GROWTH.4b-H` · Phase 0–6 — [`../SHIPPED.md`](../SHIPPED.md)

## 一览（Top Next）

| App     | 层级   | Top Next                                            | 分卷                                                                      |
| ------- | ------ | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Planner | 生产   | 用户 gate：SCHED/CAPTURE 真机；Agent：定向 UI 收口 → 附件 WIP 决策 | [planner.md](./planner.md) |
| Fitness | 生产   | maintenance；MEDIA.3 / SYNC.4 均 P2 按需 | [fitness.md](./fitness.md) |
| Finance | 生产   | **FINC.PURCHASE.6.a closure QA** | [finance.md](./finance.md) |
| Music   | 生产   | paused / maintenance；MUSC.PIPE.4 仅问题触发 | [music.md](./music.md) |
| Portal  | 启动器 | maintenance；不为凑九 app 扩卡 | [portal.md](./portal.md) |
| Home    | 实验   | 用户激活 refine · **MCP.13** 优先 · 1r 窄残余 | [home.md](./home.md) |
| AIOS    | 实验/本地优先 | STABLE.26 ✅ · 接 **HOME.MCP.13** | [aios.md](./aios.md) |
| KnowledgeOS | 实验/本地优先 | **KNOW.VAULT.0** watcher（编辑器含表格/高亮） | [knowledge.md](./knowledge.md) |
| HealthOS | 实验/本地优先 | **HLT-5** 用户真机 gate；其余后移 | [health.md](./health.md) |
| PaperOS | 独立仓库 | 设备 Shell，已迁出 → [paperos.md](./paperos.md)   | [paperos.md](./paperos.md)                                                |

## 跨站集成矩阵（只读 / 事件）

|                               | Planner | Fitness          | Finance | Music    | Portal             | Home     | AIOS          | KnowledgeOS | HealthOS |
| ----------------------------- | ------- | ---------------- | ------- | -------- | ------------------ | -------- | ------------- | ----------- | -------- |
| **读 `core_*`**               | ✅      | ✅               | ✅      | ✅       | ✅                 | ✅       | ✅ AIOS.20    | ✅ Planner 只读快照 | — |
| **`life_events` 生产**        | —       | ✅ GYMS.EVENTS.1 | ✅      | —        | —                  | 自有 `home.events` 代码（非 `life_events`） | ✅ AIOS.21 | — | — |
| **`life_events` 消费**        | ✅      | —                | —       | —        | 角标 PORT.GROWTH.2 | —        | —             | — | — |
| **Portal 摘要 PORT.GROWTH.4** | ✅ 任务 | ✅ 训练          | ✅ 结余 | ✅ Music | ✅ Home            | —        | ❌ 未接入     | ❌ 未接入   | ❌ 未接入 |
| **业务数据云**                | ✅      | ✅               | ✅      | ✅       | —                  | 🟡 扫描/照片/事件/认亲生产；项目本地真源 | ✅ 本地优先+云只读 | 🟡 Planner 云快照；Vault 未上云 | ❌ 原始健康数据仅本地 |

## 已知阻塞（排期前必读）

| 阻塞                              | 影响项                                     | 解除方式                                                               |
| --------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| master CI 未稳定全绿（design-catalog a11y 等） | 所有交付可信度 | **PLAT.CI.0**；不得只以本地 gate 代替 |
| Finance 6.a 只剩 closure QA | 错误估时与重复开发 | 以代码和生产 RPC 为准，勿按「UI/RPC 未实现」估天 |
| Home 可编辑项目仍本地真源 | 全量跨设备编辑 | 不阻塞 RECOG/MCP；PROJ.4 后移 |
| `events.ts` 仅少量类型 | INTG.EVENTS.2 智能 | 有场景再扩消费端；✅ 已有 `fitness.workout_logged` |

## 当前排序 · Wave 投入估算

当前排序以 **hub §推荐执行顺序** 为准（避免双源漂移，见 §何时更新）；本分卷不重复具体序号/估时。

**已完成 Wave（2026-07-09）：** Phase 0–6 + Portal UI 走查 P-1–P-12 — 见 [`../SHIPPED.md`](../SHIPPED.md)

**历史 Phase 7：** PLNR.PROJ.3 已完成；PAPR.WRITE.5 已随 PaperOS 迁出。当前开放顺序只看 hub §Now / §Next。

## 何时更新

1. 新想法 → 分卷 §Parked → 标 ROI → 进 hub §Next
2. hub §Next 完成 → 分卷标 ✅ + [`../SHIPPED.md`](../SHIPPED.md)
3. E2E 跑批后 → 同步 [`../../qa/e2e-issues.md`](../../qa/e2e-issues.md) 问题 ID
4. **不要**在分卷复制 hub Now/Next 整表
