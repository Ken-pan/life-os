# QA — 质量与验收（Present）

测试 playbook、已知失败、PWA 专项。不是路线图。**Ticket ID：** [`../roadmap/TICKET_NAMING.md`](../roadmap/TICKET_NAMING.md)

## 主题导航（推荐）

| 主题 | Hub |
| --- | --- |
| **PaperOS**（独立仓库） | [`../roadmap/apps/paperos.md`](../roadmap/apps/paperos.md) |
| **Kenos 重构 gates** | [`kenos-refactor-gates.md`](./kenos-refactor-gates.md) |
| PWA / iOS | 下文 §PWA |
| Planner 日程 / 捕获 | 下文 §Planner 日程 / 捕获 |

## PWA

| 文档 | 用途 |
| --- | --- |
| [`pwa-ios.md`](./pwa-ios.md) | iOS PWA 调试流程 |
| [`pwa-viewport-checklist.md`](./pwa-viewport-checklist.md) | Viewport 验收清单 |

## Planner 日程 / 捕获

| 文档 | 用途 |
| --- | --- |
| [`planner-task-capture-spec.md`](./planner-task-capture-spec.md) | 任务捕获规范（PLNR.CAPTURE.0 · 草案） |
| [`planner-task-display-spec.md`](./planner-task-display-spec.md) | 任务行展示规范（P-TASK-DISPLAY-0 · 草案） |
| [`planner-schedule-uiux-audit.md`](./planner-schedule-uiux-audit.md) | PLNR.SCHED.0 走查 |
| [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md) | Antigravity baseline |
| [`planner-schedule-antigravity-baseline.json`](./planner-schedule-antigravity-baseline.json) | 机器可读矩阵 |

## 跨站 / 其他

| 文档 | 用途 |
| --- | --- |
| [`agent-handoff-2026-07-17-roi.md`](./agent-handoff-2026-07-17-roi.md) | ROI 执行暂停交接 + 下一任 Prompt（PLAT.CI.0 snapshot） |
| [`e2e-issues.md`](./e2e-issues.md) | 四站 E2E 跑批问题记录 |
| [`input-ime.md`](./input-ime.md) | CJK IME guard |
| [`portal-screenshot-audit.md`](./portal-screenshot-audit.md) | Portal UI 截图走查 |
| [`home-spatial-editor-audit-2026-07-08.md`](./home-spatial-editor-audit-2026-07-08.md) | Home 墙图验收 |
| [`../apps/fitness/docs/FT-P5-substitution.md`](../../apps/fitness/docs/FT-P5-substitution.md) | GYMS.SUB.5 工程 gate |
| [`../apps/fitness/docs/FT-P5-ui-closure-guide.md`](../../apps/fitness/docs/FT-P5-ui-closure-guide.md) | GYMS.SUB.5 UI closure |

## 证据目录（非 Markdown 计划）

| 路径                                                                                                                   | 说明                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`screenshot-output.md`](./screenshot-output.md)                                                                       | **截图输出规范**（路径 SSOT · `scripts/qa/screenshot-output.mjs`）    |
| `docs/ui-qa-screenshots/`（见 [`screenshot-output.md`](./screenshot-output.md)）                                               | 各 app QA 脚本输出的截图与 `manifest.json`（`{app}/{suite}/latest/`；gitignore，本地生成，不在干净 checkout 中要求存在） |
| [`evidence/planner-schedule/2026-07-10/`](./evidence/planner-schedule/2026-07-10/)                                     | PLNR.SCHED.0 Antigravity 截图 + Playwright traces                     |
| `apps/*/docs/`                                                                                                         | App 专属 IA、audit export                                             |

**SSOT 脚本：** [`scripts/pwa/apps.config.mjs`](../../scripts/pwa/apps.config.mjs)

**自动化：** `npm run test:pwa` · `npm run qa:pwa` · `npm run test:design-catalog`
