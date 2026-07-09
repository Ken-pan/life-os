# QA — 质量与验收（Present）

测试 playbook、已知失败、PWA 专项。不是路线图。

| 文档                                                       | 用途                      |
| ---------------------------------------------------------- | ------------------------- |
| [`e2e-issues.md`](./e2e-issues.md)                         | 四站 E2E 跑批问题记录     |
| [`pwa-ios.md`](./pwa-ios.md)                               | iOS PWA 调试流程          |
| [`pwa-viewport-checklist.md`](./pwa-viewport-checklist.md) | Viewport 验收清单         |
| [`input-ime.md`](./input-ime.md)                           | CJK IME guard（web-only） |
| [`portal-screenshot-audit.md`](./portal-screenshot-audit.md) | Portal UI 截图走查（G-P8/G-P9 · 第二轮 2026-07-09） |
| [`home-spatial-editor-audit-2026-07-08.md`](./home-spatial-editor-audit-2026-07-08.md) | Home 墙图功能验收 · UI/FN 问题清单（H-W2c 前） |
| [`home-spatial-uiux-audit-2026-07-08.md`](./home-spatial-uiux-audit-2026-07-08.md) | Home 空间编辑 **高标准 UI/UX 审核**（H-W2c 后） |

## 证据目录（非 Markdown 计划）

| 路径                                             | 说明                                   |
| ------------------------------------------------ | -------------------------------------- |
| [`../ui-qa-screenshots/`](../ui-qa-screenshots/) | 各 app QA 脚本输出的截图与 `manifest.json` |
| [`../ui-qa-screenshots/portal/`](../ui-qa-screenshots/portal/) | Portal 走查 12 张截图 + `manifest.json`（G-P8 inbox 校验） |
| [`../../apps/home/screenshots/qa-uiux-2026-07-08/`](../../apps/home/screenshots/qa-uiux-2026-07-08/) | Home UI/UX 审核截图（2026-07-08） |
| `apps/*/docs/`                                   | App 专属 IA、audit export              |

**SSOT 脚本配置：** [`scripts/pwa/apps.config.mjs`](../../scripts/pwa/apps.config.mjs)

**自动化：** `npm run test:pwa` · `npm run qa:pwa` · `npm run test:design-catalog`
