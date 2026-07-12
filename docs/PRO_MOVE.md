# PaperOS / reMarkable Pro Move — Gate 文档索引

> **执行计划（产品 + 排期）：** [`roadmap/apps/planner-pro-move.md`](./roadmap/apps/planner-pro-move.md)
> **差距核查：** [`PRO_MOVE_STATUS_VS_IDEAL.md`](./PRO_MOVE_STATUS_VS_IDEAL.md)
> **UI 执行 SSOT：** [`qa/paperos-next-ui-update-guide.md`](./qa/paperos-next-ui-update-guide.md)
> **Hub 优先级：** [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §Now — **PAPR.UI** · PAPR.WRITE.5 · PAPR.SYS.1 **paused**
> **Ticket ID（canonical）：** [`roadmap/TICKET_NAMING.md`](./roadmap/TICKET_NAMING.md)
> **生命周期导航：** [`qa/paperos-device-lifecycle/README.md`](./qa/paperos-device-lifecycle/README.md)

`docs/PRO_MOVE_*.md` 为 **设备工程 gate 证据**（非路线图真源）。完成项保留供审计；活跃项以 hub §Now 为准。

## 入口（先读）

| 文档                                                                     | 用途                                 |
| ------------------------------------------------------------------------ | ------------------------------------ |
| [`roadmap/apps/planner-pro-move.md`](./roadmap/apps/planner-pro-move.md) | PAPR.DEV.1…7 执行计划 · 当前 blocker |
| [`PRO_MOVE_STATUS_VS_IDEAL.md`](./PRO_MOVE_STATUS_VS_IDEAL.md)           | 外部差距报告逐项核实 + UI/UX 差距    |
| [`PRO_MOVE_API_CONTRACT.md`](./PRO_MOVE_API_CONTRACT.md)                 | `/api/paper/*` 契约                  |
| [`PRO_MOVE_DEVICE_ACCESS.md`](./PRO_MOVE_DEVICE_ACCESS.md)               | SSH · USB · 设备别名                 |
| [`PRO_MOVE_SHELL_MVP_GATE.md`](./PRO_MOVE_SHELL_MVP_GATE.md)             | 6-tab Shell MVP（PASS · 已知 gaps）  |

## 设备里程碑（PAPR._ · legacy `P-MOVE-_`）

| Gate                                                                                                     | 主题                                            | 状态                                                                                                                     |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`PRO_MOVE_P_MOVE_1_DEVICE_SESSION_GATE.md`](./PRO_MOVE_P_MOVE_1_DEVICE_SESSION_GATE.md)                 | Home-only launcher baseline                     | PASS                                                                                                                     |
| [`PRO_MOVE_P_MOVE_2_READ_CACHE_GATE.md`](./PRO_MOVE_P_MOVE_2_READ_CACHE_GATE.md)                         | 离线 last-good cache                            | PASS                                                                                                                     |
| [`PRO_MOVE_P_MOVE_3_CJK_PAGINATION_GATE.md`](./PRO_MOVE_P_MOVE_3_CJK_PAGINATION_GATE.md)                 | CJK 字体 + 硬分页                               | PASS                                                                                                                     |
| [`PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md`](./PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md) | Exit · 崩溃恢复 · systemd                       | PASS                                                                                                                     |
| [`PRO_MOVE_P_MOVE_BLOCK_GATE.md`](./PRO_MOVE_P_MOVE_BLOCK_GATE.md)                                       | 生产 Paper API（legacy **`PAPR.DATA.verify`**） | **PASS** → canonical **`PAPR.DATA.verify`**                                                                              |
| [`qa/paperos-data-plane-verify-2026-07-11.md`](./qa/paperos-data-plane-verify-2026-07-11.md)             | 设备生产 sync E2E                               | **PASS** — 200 + schema + cache/UI refresh                                                                               |
| **PAPR.SYS.0**                                                                                           | 生命周期发现                                    | **CONDITIONAL PASS accepted** — [`qa/paperos-device-lifecycle-discovery.md`](./qa/paperos-device-lifecycle-discovery.md) |
| **PAPR.SYS.1a**                                                                                          | Triple-power launch                             | **BLOCKED / CLOSED**                                                                                                     |
| **PAPR.SYS.1b.fs**                                                                                       | Filesystem launch signals                       | **BLOCKED / CLOSED**                                                                                                     |
| **PAPR.SYS.1b.jrn**                                                                                      | Journal `EntityOpen` UUID                       | **CONDITIONAL PASS accepted**                                                                                            |
| **PAPR.SYS.1/2/3**                                                                                       | enter/exit · sleep/wake · settings              | **PAPR.SYS.1 UNBLOCKED NOT STARTED (paused)** · PAPR.SYS.2 not started                                                   |
| **PAPR.UI**                                                                                              | `PAPR.UI.1.1` 复验 → `PAPR.UI.2`                | **IN FLIGHT** — 真机合并等 PAPR.SYS.1                                                                                    |
| **PAPR.SYNC.6**                                                                                          | Sync now + timers                               | **BLOCKED on PAPR.SYS.2**                                                                                                |
| **PAPR.WRITE.5**                                                                                         | Controlled write staging                        | NEXT                                                                                                                     |
| **PAPR.DEV.7**                                                                                           | Read-only 文档导出                              | PLANNED                                                                                                                  |

## 后端 PR 线（历史 gate）

| Gate                                                                     | 主题                                     |
| ------------------------------------------------------------------------ | ---------------------------------------- |
| [`PRO_MOVE_PR1_FINAL_GATE.md`](./PRO_MOVE_PR1_FINAL_GATE.md)             | Mock API                                 |
| [`PRO_MOVE_PR2_MERGE_GATE.md`](./PRO_MOVE_PR2_MERGE_GATE.md)             | Read-only endpoints                      |
| [`PRO_MOVE_PR2_READ_ONLY_GATE.md`](./PRO_MOVE_PR2_READ_ONLY_GATE.md)     | GET 验收                                 |
| [`PRO_MOVE_PR2_ROUTING_FIX_GATE.md`](./PRO_MOVE_PR2_ROUTING_FIX_GATE.md) | `_redirects` 路由                        |
| [`PRO_MOVE_PR3A_*`](./PRO_MOVE_PR3A_FINAL_REPORT.md)                     | Action log / merge                       |
| [`PRO_MOVE_PR3B_*`](./PRO_MOVE_PR3B_LOCAL_HTTP_VALIDATION_GATE.md)       | Staging write · real DB · Netlify parity |

完整 PR-3B 子 gate：`LOCAL_HTTP_VALIDATION` · `COMPLETE_WRITE` · `FIX` · `FINAL_FIX` · `HARD_GATE` · `STAGING_*` · `REAL_DB_VALIDATION*`

## Ink / Marker

| 文档                                                                                           | 用途                     |
| ---------------------------------------------------------------------------------------------- | ------------------------ |
| [`PRO_MOVE_NATIVE_INK_RUNTIME_ARCHITECTURE.md`](./PRO_MOVE_NATIVE_INK_RUNTIME_ARCHITECTURE.md) | Native ink 架构          |
| [`PRO_MOVE_MARKER_PHASE0_INPUT_MAP.md`](./PRO_MOVE_MARKER_PHASE0_INPUT_MAP.md)                 | 笔输入诊断（touch-only） |
| [`PRO_MOVE_MARKER_PHASE2_INSTANT_INK.md`](./PRO_MOVE_MARKER_PHASE2_INSTANT_INK.md)             | Instant ink              |
| [`PRO_MOVE_MARKER_PHASE2B_GATE.md`](./PRO_MOVE_MARKER_PHASE2B_GATE.md)                         | Phase 2B gate            |
| [`PRO_MOVE_PHASE2A_DIRECT_INK_GATE.md`](./PRO_MOVE_PHASE2A_DIRECT_INK_GATE.md)                 | Direct ink gate          |
| [`PRO_MOVE_LIVE_INK_LAUNCH_GATE.md`](./PRO_MOVE_LIVE_INK_LAUNCH_GATE.md)                       | Live ink launch          |

## QA 分卷（PaperOS）

**导航 hub：** [`qa/paperos/README.md`](./qa/paperos/README.md) · **生命周期：** [`qa/paperos-device-lifecycle/README.md`](./qa/paperos-device-lifecycle/README.md)

| 文档                                                                                                 | 用途                       |
| ---------------------------------------------------------------------------------------------------- | -------------------------- |
| [`qa/paperos-next-ui-update-guide.md`](./qa/paperos-next-ui-update-guide.md)                         | **UI 执行 SSOT**           |
| [`qa/paperos-device-lifecycle-discovery.md`](./qa/paperos-device-lifecycle-discovery.md)             | **`PAPR.SYS.*` 发现 SSOT** |
| [`qa/paperos-device-lifecycle-gate.md`](./qa/paperos-device-lifecycle-gate.md)                       | PAPR.SYS.gate 用例         |
| [`qa/paperos-data-plane-verify-2026-07-11.md`](./qa/paperos-data-plane-verify-2026-07-11.md)         | PAPR.DATA.verify PASS      |
| [`qa/paperos-eink-uiux-agent-brief.md`](./qa/paperos-eink-uiux-agent-brief.md)                       | 长期产品 brief             |
| [`qa/paperos-eink-uiux-gap-audit.md`](./qa/paperos-eink-uiux-gap-audit.md)                           | 差距审计                   |
| [`qa/paperos-core-slice-1-integration-gate.md`](./qa/paperos-core-slice-1-integration-gate.md)       | Slice 1 integration        |
| [`qa/paperos-core-slice-1-visual-gate.md`](./qa/paperos-core-slice-1-visual-gate.md)                 | Slice 1 visual             |
| [`qa/paperos-core-slice-1-1-visual-delta-gate.md`](./qa/paperos-core-slice-1-1-visual-delta-gate.md) | Slice 1.1 QML delta        |

## 代码锚点

```text
apps/planner/paper-device/          deploy · refresh-cache · templates
apps/planner-device/remarkable-lite/  QML + native binary
apps/planner/netlify/functions/paper-*.mjs
apps/planner/static/_redirects      /api/paper/* → functions
```

_索引维护：新增 `PRO_MOVE_\*` gate 时在本文件追加一行；产品优先级只改 hub + planner-pro-move。\_
