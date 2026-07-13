# PaperOS Device Lifecycle — 文档导航

> **状态（2026-07-11）：** Architecture discovery **complete** · **`PAPR.SYS.1`** implementation **UNBLOCKED BUT NOT STARTED — PAUSED BY OWNER** · device **safe**（xochitl + rm-sync active，无 watcher/launcher）

**Canonical ID：** [`../../roadmap/TICKET_NAMING.md`](../../roadmap/TICKET_NAMING.md) · Legacy 别名见对照表。

**Mode A — Xochitl default** 不变。PaperOS 不得在解锁前抢占、不得自动启动、不得依赖 Mac/SSH 作为最终日常路径。

## 先读哪份？

| 顺序 | 文档                                                                                          | 用途                                                                                  |
| ---: | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
|    1 | [`paperos-device-lifecycle-discovery.md`](../paperos-device-lifecycle-discovery.md)           | **权威发现 SSOT** — `PAPR.SYS.0` / `1a` / `1b.fs` / `1b.jrn` 证据、矩阵、pause/resume |
|    2 | [`paperos-data-plane-verify-2026-07-11.md`](../paperos-data-plane-verify-2026-07-11.md)       | **`PAPR.DATA.verify` PASS** — 生产读路径                                              |
|    3 | [`paperos-device-lifecycle-gate.md`](../paperos-device-lifecycle-gate.md)                     | **`PAPR.SYS.gate`** — LC-01–LC-15（未开始）                                           |
|    4 | [`../../roadmap/apps/planner-pro-move.md`](../../roadmap/apps/planner-pro-move.md) §PAPR.SYS  | 产品排期与依赖链                                                                      |
|    5 | [`../../roadmap/AGENT_WORKSTREAMS.md`](../../roadmap/AGENT_WORKSTREAMS.md) §PaperOS lifecycle | Agent 分线与 pause 说明                                                               |

**Gate 索引（设备工程）：** [`../../PRO_MOVE.md`](../../PRO_MOVE.md)

## Gate 状态（摘要）

| Canonical ID         | Legacy                             | 状态                                            |
| -------------------- | ---------------------------------- | ----------------------------------------------- |
| **PAPR.DATA.verify** | `P-MOVE.verify` · `P-MOVE-VERIFY`  | **PASS**                                        |
| **PAPR.SYS.0**       | `P-MOVE-SYS-0` · `SYS-0`           | **CONDITIONAL PASS — accepted**                 |
| **PAPR.SYS.1a**      | `P-MOVE-SYS-1A` · `SYS-1A`         | **BLOCKED / CLOSED**                            |
| **PAPR.SYS.1b.fs**   | `P-MOVE-SYS-1B-FS` · `SYS-1B-FS`   | **BLOCKED / CLOSED**                            |
| **PAPR.SYS.1b.jrn**  | `P-MOVE-SYS-1B-JRN` · `SYS-1B-JRN` | **CONDITIONAL PASS — accepted**                 |
| **PAPR.SYS.1**       | `P-MOVE-SYS-1` · `SYS-1`           | **UNBLOCKED BUT NOT STARTED — PAUSED BY OWNER** |
| **PAPR.SYS.2**       | `P-MOVE-SYS-2` · `SYS-2`           | **HARD BLOCKED**                                |
| **PAPR.SYNC.6**      | `P-MOVE.6` · `P-MOVE-6`            | **BLOCKED**（等 `PAPR.SYS.2`）                  |
| **PAPR.SYS.gate**    | `SYS-GATE` · `P-MOVE-SYS-GATE`     | **BLOCKED**                                     |

完整依赖链与 Ken 观测见 discovery 文首 §当前权威状态。

## QA 工具（非产品代码）

只读 discovery 仪器，**不是** production journal watcher：

```text
apps/planner/paper-device/qa-tools/sys1b/
  observe-sys1b.sh · snap-diff.sh · stop-sys1b.sh · monitor-file-snapshot.sh · README.md
```

## 恢复工作前

须 **owner 显式授权**。下一步是 **`PAPR.SYS.1` design**（不是 `PAPR.SYS.2`）。见 discovery §Future resume point。

## 相关（UI 与 Shell，非 lifecycle blocker）

PaperOS UI 执行 SSOT 在 [`../paperos/README.md`](../paperos/README.md) — 与 lifecycle 分开维护。
