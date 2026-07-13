# PaperOS QA — 文档导航

> **产品排期：** [`../../roadmap/apps/planner-pro-move.md`](../../roadmap/apps/planner-pro-move.md) · **Gate 索引：** [`../../PRO_MOVE.md`](../../PRO_MOVE.md)

按主题拆分，避免在 17 个平铺文件里盲搜。

| 文档 | 职责 | 状态 |
| --- | --- | --- |
| [`lifecycle.md`](./lifecycle.md) | `PAPR.SYS.*` 真机发现、决策、依赖与 resume point | `PAPR.SYS.1` 主航道 |
| [`lifecycle-gate.md`](./lifecycle-gate.md) | LC-01–LC-15 最终可靠性矩阵 | Blocked by SYS.1–3 |
| [`ui-spec.md`](./ui-spec.md) | E-ink UI 规范与 clean PR device gate | PR #27 / #28 **BLOCKED**（locale、stylus、Slice 2 visual） |
| [`data-plane-2026-07-11.md`](./data-plane-2026-07-11.md) | 生产读路径的脱敏验收证据 | PASS，只读 |
| [`reference/2026-07-10/`](./reference/2026-07-10/) | UI 方向参考图 | 证据，非规范真源 |

**导航 hub：** [`../paperos-device-lifecycle/README.md`](../paperos-device-lifecycle/README.md) · **ID 语法：** [`../../roadmap/TICKET_NAMING.md`](../../roadmap/TICKET_NAMING.md)

| 文档 | 用途 |
| --- | --- |
| [`../paperos-device-lifecycle-discovery.md`](../paperos-device-lifecycle-discovery.md) | 真机发现 SSOT（2026-07-11 checkpoint） |
| [`../paperos-device-lifecycle-gate.md`](../paperos-device-lifecycle-gate.md) | 最终可靠性矩阵 LC-01–LC-15 |
| [`../paperos-data-plane-verify-2026-07-11.md`](../paperos-data-plane-verify-2026-07-11.md) | PAPR.DATA.verify PASS |

## UI / E-ink 产品（PAPR.UI）

| 文档 | 用途 |
| --- | --- |
| [`../paperos-next-ui-update-guide.md`](../paperos-next-ui-update-guide.md) | **执行 SSOT** — Slice 1.1 / 2 / deferred |
| [`../paperos-eink-uiux-agent-brief.md`](../paperos-eink-uiux-agent-brief.md) | 长期产品 brief |
| [`../paperos-eink-uiux-gap-audit.md`](../paperos-eink-uiux-gap-audit.md) | 差距审计 + 设备 baseline |

## Slice Gate 证据

| 文档 | 用途 |
| --- | --- |
| [`../paperos-core-slice-1-integration-gate.md`](../paperos-core-slice-1-integration-gate.md) | Core Slice 1 技术 integration |
| [`../paperos-core-slice-1-visual-gate.md`](../paperos-core-slice-1-visual-gate.md) | Core Slice 1 视觉（Antigravity） |
| [`../paperos-core-slice-1-1-visual-delta-gate.md`](../paperos-core-slice-1-1-visual-delta-gate.md) | Slice 1.1 QML delta |

## 参考截图

[`reference/2026-07-10/`](./reference/2026-07-10/) — Antigravity / 设备 baseline 参照图（证据，非计划真源）。

## 已归档

| 原路径 | 替代 |
| --- | --- |
| [`../../archive/paperos-ui-correction-slice-1-1-evaluation-2026-07-11.md`](../../archive/paperos-ui-correction-slice-1-1-evaluation-2026-07-11.md) | Slice 1.1 工作树评估（历史）；现行见 delta gate + next-ui guide |
