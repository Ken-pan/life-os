# QA 截图输出规范

单人团队、现代 monorepo 的 UI 证据管理：**一处根目录、按 app/suite 分层、默认 `latest`、可选归档 run**。

## 原则

| 类型                   | 位置                               | 是否提交        |
| ---------------------- | ---------------------------------- | --------------- |
| **临时 QA 走查截图**   | `docs/ui-qa-screenshots/`          | 否（gitignore） |
| **视觉回归 baseline**  | `tests/visual/*-snapshots/`        | 是              |
| **审计 export 内嵌图** | 各 app `docs/pto-audit-export/` 等 | 视 export 而定  |

不要混用 `screenshots/`、`.qa-screenshots/`、`apps/*/screenshots/` — 脚本已统一到根目录证据库。

## 目录结构

```text
docs/ui-qa-screenshots/
├── planner/{suite}/latest/          # 例：buttons, notifications, playwright-audit
├── finance/{suite}/latest/          # 例：main-flows, p0-mobile
├── fitness/{suite}/latest/
├── music/{suite}/latest/
├── portal/main/latest/
├── home/{suite}/latest/
├── pwa/{chrome-audit|simulator}/latest/
└── design-catalog/p3-audit/{runId}/
```

每个 run 目录可含 `manifest.json`（捕获时间、baseUrl、checks）。

## 环境变量

| 变量                | 作用                                                  |
| ------------------- | ----------------------------------------------------- |
| `QA_RUN_ID`         | 归档子目录名，如 `20260709-0910`；不设则写入 `latest` |
| `LIFE_OS_REPO_ROOT` | 显式 repo 根（CI / 非标准 cwd）                       |

## 脚本 API

```js
import {
  resolveScreenshotDir,
  writeManifest,
  syncToLatest,
} from '../../scripts/qa/screenshot-output.mjs'

const { dir } = resolveScreenshotDir({
  app: 'finance',
  suite: 'main-flows',
  importMetaUrl: import.meta.url,
  runId: process.env.UI_QA_DATE, // 可选
})
// … capture …
writeManifest(dir, { baseUrl, checks })
if (process.env.QA_RUN_ID) syncToLatest(dir, import.meta.url)
```

## 常用命令

| 命令                                              | 输出 suite                   |
| ------------------------------------------------- | ---------------------------- |
| `npm run pwa:sim:shot -- my-shot`                 | `pwa/simulator/latest/`      |
| `node scripts/pwa/capture-chrome-screenshots.mjs` | `pwa/chrome-audit/latest/`   |
| `npm run qa:screenshot -w portal`                 | `portal/main/latest/`        |
| `npm run qa:screenshots -w finance-os`            | `finance/main-flows/latest/` |

## 维护

- 定期清理：`node scripts/qa/prune-screenshots.mjs --apply`（保留 `latest/` 与近 7 天归档）
- 审计 Markdown 引用应用相对路径：`docs/ui-qa-screenshots/{app}/{suite}/latest/`。
