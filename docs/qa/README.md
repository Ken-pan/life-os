# QA — 质量与验收（Present）

测试 playbook、已知失败、PWA 专项。不是路线图。**Ticket ID：** [`../roadmap/TICKET_NAMING.md`](../roadmap/TICKET_NAMING.md)

| 文档                                                                                           | 用途                                                             |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`e2e-issues.md`](./e2e-issues.md)                                                             | 四站 E2E 跑批问题记录                                            |
| [`pwa-ios.md`](./pwa-ios.md)                                                                   | iOS PWA 调试流程                                                 |
| [`pwa-viewport-checklist.md`](./pwa-viewport-checklist.md)                                     | Viewport 验收清单                                                |
| [`input-ime.md`](./input-ime.md)                                                               | CJK IME guard（web-only）                                        |
| [`portal-screenshot-audit.md`](./portal-screenshot-audit.md)                                   | Portal UI 截图走查（第五轮 · 遗留 UI 清零 2026-07-09）           |
| [`planner-schedule-uiux-audit.md`](./planner-schedule-uiux-audit.md)                           | Planner 日程视图走查（**P-SCHED-0** · baseline ✅ · 修复中）     |
| [`planner-schedule-antigravity-baseline.md`](./planner-schedule-antigravity-baseline.md)       | P-SCHED-0 **Antigravity 截图 baseline**（2026-07-10）            |
| [`planner-schedule-antigravity-baseline.json`](./planner-schedule-antigravity-baseline.json)   | 同上 · 机器可读 findings 矩阵                                    |
| [`planner-task-display-spec.md`](./planner-task-display-spec.md)                               | Planner 任务行展示规范（**P-TASK-DISPLAY-0** · 草案）            |
| [`paperos-next-ui-update-guide.md`](./paperos-next-ui-update-guide.md)                         | PaperOS **执行 SSOT**（Slice 1.1 / 2 / deferred）                |
| [`paperos-eink-uiux-agent-brief.md`](./paperos-eink-uiux-agent-brief.md)                       | PaperOS E-ink Notes **长期产品 brief**（P0 全景）                |
| [`paperos-eink-uiux-gap-audit.md`](./paperos-eink-uiux-gap-audit.md)                           | PaperOS UI **差距审计** + 设备 baseline                          |
| [`paperos-core-slice-1-integration-gate.md`](./paperos-core-slice-1-integration-gate.md)       | Core Slice 1 **技术 Integration Gate**                           |
| [`paperos-core-slice-1-visual-gate.md`](./paperos-core-slice-1-visual-gate.md)                 | Core Slice 1 **视觉 Gate**（Antigravity）                        |
| [`paperos-core-slice-1-1-visual-delta-gate.md`](./paperos-core-slice-1-1-visual-delta-gate.md) | Core Slice 1.1 **QML 视觉 delta**（Gallery/Drawer/`+`）          |
| [`paperos-device-lifecycle-discovery.md`](./paperos-device-lifecycle-discovery.md)             | **P-MOVE-SYS-0** 设备生命周期发现（待采集）                      |
| [`paperos-device-lifecycle-gate.md`](./paperos-device-lifecycle-gate.md)                       | **P-MOVE-SYS-GATE** 真机可靠性用例                               |
| [`home-spatial-editor-audit-2026-07-08.md`](./home-spatial-editor-audit-2026-07-08.md)         | Home 墙图**功能**验收（H-W0–W2c · 8 smoke checks）               |
| [`home-spatial-uiux-audit-2026-07-08.md`](./home-spatial-uiux-audit-2026-07-08.md)             | Home 空间编辑 **UI/UX 审核**（Wave A/B/C ✅ · 剩余见 §剩余开放） |

## 证据目录（非 Markdown 计划）

| 路径                                                                                                                   | 说明                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`screenshot-output.md`](./screenshot-output.md)                                                                       | **截图输出规范**（路径 SSOT · `scripts/qa/screenshot-output.mjs`）    |
| [`../ui-qa-screenshots/`](../ui-qa-screenshots/)                                                                       | 各 app QA 脚本输出的截图与 `manifest.json`（`{app}/{suite}/latest/`） |
| [`../ui-qa-screenshots/portal/main/latest/`](../ui-qa-screenshots/portal/main/latest/)                                 | Portal 走查截图 + `mobile-launcher.png` + `manifest.json`             |
| [`../ui-qa-screenshots/home/uiux-audit/2026-07-08/`](../ui-qa-screenshots/home/uiux-audit/2026-07-08/)                 | Home UI/UX 审核截图（2026-07-08）                                     |
| [`evidence/planner-schedule/2026-07-10/`](./evidence/planner-schedule/2026-07-10/)                                     | P-SCHED-0 Antigravity 截图 + Playwright traces                        |
| [`../ui-qa-screenshots/paperos/device/baseline-2026-07-10/`](../ui-qa-screenshots/paperos/device/baseline-2026-07-10/) | PaperOS 设备 UI baseline（2026-07-10）                                |
| `apps/*/docs/`                                                                                                         | App 专属 IA、audit export                                             |

**SSOT 脚本：** [`scripts/pwa/apps.config.mjs`](../../scripts/pwa/apps.config.mjs)

**自动化：** `npm run test:pwa` · `npm run qa:pwa` · `npm run test:design-catalog`
