# PaperOS QA

PaperOS 的质量入口。当前状态与优先级以 [`../../LIFEOS_ROADMAP.md`](../../LIFEOS_ROADMAP.md) 和 [`../../roadmap/apps/paperos.md`](../../roadmap/apps/paperos.md) 为准；本目录只保留可执行的规范、当前 gate 与精简证据。

## 当前文档

| 文档 | 职责 | 状态 |
| --- | --- | --- |
| [`lifecycle.md`](./lifecycle.md) | `PAPR.SYS.*` 真机发现、决策、依赖与 resume point | `PAPR.SYS.1` 主航道 |
| [`lifecycle-gate.md`](./lifecycle-gate.md) | LC-01–LC-15 最终可靠性矩阵 | Blocked by SYS.1–3 |
| [`ui-spec.md`](./ui-spec.md) | E-ink UI 规范与 clean PR device gate | PR #27 / #28 **BLOCKED**（locale、stylus、Slice 2 visual） |
| [`data-plane-2026-07-11.md`](./data-plane-2026-07-11.md) | 生产读路径的脱敏验收证据 | PASS，只读 |
| [`reference/2026-07-10/`](./reference/2026-07-10/) | UI 方向参考图 | 证据，非规范真源 |

## 其他职责的真源

| 需要 | 文档 |
| --- | --- |
| 产品排期与 ticket 状态 | [`../../roadmap/apps/paperos.md`](../../roadmap/apps/paperos.md) |
| 设备 API 契约 | [`../../architecture/paperos-api.md`](../../architecture/paperos-api.md) |
| Native Ink 架构 | [`../../architecture/paperos-ink-runtime.md`](../../architecture/paperos-ink-runtime.md) |
| SSH、部署、恢复与设备约束 | [`../../ops/paperos-device.md`](../../ops/paperos-device.md) |
| 已完成的 2026-07 gate / PR 历史 | [`../../archive/paperos/milestones-2026-07.md`](../../archive/paperos/milestones-2026-07.md) |

## 维护规则

- 新状态只更新 roadmap；不在 QA 文档复制 Now / Next 表。
- 同一 slice 只保留一份活跃 gate；通过后将结论写入 `roadmap/SHIPPED.md` 和 archive 摘要，删除一次性报告。
- 截图、日志、hash 是证据，不是产品规划。秘钥、token 和私有内容不得进入文档。
- 出现相互矛盾的 PASS / FAIL 时，只保留最新有真机证据的 verdict，旧结论在 archive 用一句话解释。
