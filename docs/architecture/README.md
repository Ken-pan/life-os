# Architecture — 长期技术真源（Present）

跨 app、跨 surface 的**不变量**与契约。实现细节仍在 `packages/*/src`。

| 文档                                             | 用途                                              |
| ------------------------------------------------ | ------------------------------------------------- |
| [`NORTH_STAR.md`](./NORTH_STAR.md)               | **愿景** — 终极形态、十 OS 判据、和现在的距离（非排期） |
| [`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md)     | **体系快照** — app/包清单、不变量、infra；与 hub 冲突时以 hub 为准 |
| [`contracts.md`](./contracts.md)                 | `@life-os/contracts` export 白名单 + Web 映射     |
| [`responsive-chrome.md`](./responsive-chrome.md) | 断点 / AppBar / scroll-padding / 壳层契约（六端） |
| [`events-rfc.md`](./events-rfc.md)               | `life_events` envelope、`finance.bill_due`        |
| [`native-readiness.md`](./native-readiness.md)   | Future iOS / Widget 类型占位                      |

> PaperOS 设备读写 API / ink runtime 契约已随 PaperOS 于 2026-07-12 迁出至独立仓库 → [`../roadmap/apps/paperos.md`](../roadmap/apps/paperos.md)。Planner 侧 provider API（`/api/paper/*`）仍在本仓库。

**边界与提取规则：** [`../roadmap/BACKLOG.md`](../roadmap/BACKLOG.md)

**阶段进度：** [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)
