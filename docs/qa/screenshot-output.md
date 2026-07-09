# QA 截图输出规范

单人团队、现代 monorepo 的 UI 证据管理：**一处根目录、按 app/suite 分层、默认 `latest`、统一 kebab-case 文件名**。

## 原则

| 类型                   | 位置                               | 是否提交        |
| ---------------------- | ---------------------------------- | --------------- |
| **临时 QA 走查截图**   | `docs/ui-qa-screenshots/`          | 否（gitignore） |
| **视觉回归 baseline**  | `tests/visual/*-snapshots/`        | 是              |
| **审计 export 内嵌图** | 各 app `docs/pto-audit-export/` 等 | 视 export 而定  |

不要混用 `screenshots/`、`.qa-screenshots/`、`apps/*/screenshots/` — 已废弃，用 cleanup 脚本清除。

## 目录结构

```text
docs/ui-qa-screenshots/
├── {app}/{suite}/latest/           # 默认输出；文档稳定引用此路径
├── {app}/{suite}/{QA_RUN_ID}/      # 可选归档（如 20260709-0910）
└── …/manifest.json 或 {suite}.json  # 元数据
```

## 文件命名

**模式：** `[{seq}-][{viewport}-]{surface}[-{state}].png`

| 段         | 说明                         | 示例                                |
| ---------- | ---------------------------- | ----------------------------------- |
| `seq`      | 可选，两位序号，走查排序     | `01`                                |
| `viewport` | 视口；若已在子目录可省略     | `desktop`, `mobile`                 |
| `surface`  | 页面/组件/流程（kebab-case） | `today`, `command-palette`          |
| `state`    | 可选状态                     | `light`, `dark`, `filter`, `failed` |

**示例：**

- `mobile-home.png`
- `01-inbox.png`（suite 内仅 mobile 时可省略 viewport）
- `desktop-command-palette-filter.png`
- `finance-today-chrome-viewport.png`

**报告：** `manifest.json`（走查清单）或 `{suite}.json`（如 `chrome-audit.json`）

## 脚本 API

```js
import {
  resolveScreenshotDir,
  resolveShotPath,
  resolveViewportShotPath,
  formatShotFilename,
  writeManifest,
  syncToLatest,
} from '../../scripts/qa/screenshot-output.mjs'

const { dir } = resolveScreenshotDir({
  app: 'finance',
  suite: 'main-flows',
  importMetaUrl: import.meta.url,
})

await page.screenshot({
  path: resolveShotPath(dir, {
    viewport: 'mobile',
    surface: 'today',
    state: 'light',
  }),
})
```

## 环境变量

| 变量                | 作用                        |
| ------------------- | --------------------------- |
| `QA_RUN_ID`         | 归档子目录；不设则 `latest` |
| `LIFE_OS_REPO_ROOT` | 显式 repo 根（CI）          |

## 维护命令

| 命令                                        | 作用                                 |
| ------------------------------------------- | ------------------------------------ |
| `npm run qa:screenshots:prune -- --apply`   | 删除 `latest/` 以外超过 7 天的归档   |
| `npm run qa:screenshots:cleanup -- --apply` | 删除 legacy 截图目录（一次性迁移后） |

## 文档引用

审计 Markdown 请链接：`docs/ui-qa-screenshots/{app}/{suite}/latest/`
