# Life OS Design Catalog

**Thin preview app** — 只展示 `packages/theme` 与 `packages/platform-web` 的真实内容，不拥有任何 design decision。

## 架构

```txt
packages/design-tokens             ← token JSON source of truth（P1）
@life-os/theme/design-system.css   ← 共享 CSS（canonical）
@life-os/theme/app-themes.css      ← 四端品牌 token（generated，[data-app] / [data-mode]，勿手改）
@life-os/platform-web/svelte/*     ← 真实组件
apps/design-catalog                ← 仅导航 + matrix + fixtures + layout chrome
```

**Design system 进度（2026-07-08）：**

| 阶段                                                   | 状态                       |
| ------------------------------------------------------ | -------------------------- |
| P1/P2 品牌 tokens + 四端迁移                           | ✅ 已推送 `master`         |
| P3a Card primitive + component tokens 骨架             | ✅ 已推送                  |
| P3b Settings / Toast / Navigation / Banner 深 token 化 | ✅ 已推送                  |
| P3c Button / Segment / Toggle token 化                 | ✅ 已推送                  |
| P3 catalog UX + spacing 修复                           | ✅ `ff37d401`              |
| P4a Matrix 4×2 grid + embed mode                       | ✅ 本地完成，**待 commit** |
| P4c Playwright smoke 扩展                              | ✅ **152 tests**           |
| P4b/P4d/P4e（state、CommandPalette、ThemeMatrix）    | ⏳                         |
| P5 Playwright screenshot baseline                      | ⏳                         |

## 启动

```bash
npm install
npm run dev:design-catalog
# http://localhost:5190/?showcase=tokens&app=planner&mode=light&viewport=desktop
```

## 命令

```bash
npm run dev:design-catalog
npm run build -w design-catalog
npm run test:design-catalog    # Playwright visual smoke（152 tests）
```

### Matrix view（P4a）

```txt
/?view=matrix&showcase=buttons     # 4 app × 2 mode iframe grid
/?showcase=toast&app=planner&mode=light&embed=1   # iframe cell / 无 chrome
```

侧栏 **Matrix (4×2)** 入口；点击 cell 跳转 detail view。

### Ad-hoc 视觉审计（不提交 baseline）

```bash
npm run build -w design-catalog
npm run preview -w design-catalog -- --host 127.0.0.1 --port 5190
node scripts/design-catalog-p3-screenshot-audit.mjs   # 64 PNG + report.json
node scripts/design-catalog-p3-visual-verify.mjs      # 38 项 computed-style 断言
```

输出目录：`screenshots/design-catalog/p3-audit-YYYYMMDD/`（gitignore，勿提交）

## platform-web API（P3 catalog 期间新增）

| 组件                | 新 prop                                | 用途                                            |
| ------------------- | -------------------------------------- | ----------------------------------------------- |
| `MobileMoreSheet`   | `manageFocus?: boolean`（默认 `true`） | catalog open preview 传 `false` 避免 focus ring |
| `SettingsActionRow` | `variant?: 'default' \| 'danger'`      | Sign out / Reset 等破坏性行                     |

## Toast / Banner spacing（MD3 / WCAG 对齐）

结构 token 在 `packages/theme/src/tokens.css`：

| Token                 | 值                 | 说明                   |
| --------------------- | ------------------ | ---------------------- |
| `--toast-min-h`       | 48px               | MD3 单行 snackbar 基线 |
| `--toast-pad-x/y`     | 16px / 12px        | 水平 16dp 对齐 MD3     |
| `--toast-line-height` | 1.5                | WCAG 1.4.12            |
| `--toast-action-gap`  | 12px (`--space-3`) | action 与 dismiss 间距 |

## URL 参数

| 参数       | 值                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `showcase` | tokens, buttons, segments, utilities, settings, brand, navigation, icon, feedback, toast, cards |
| `app`      | planner, fitness, finance, music                                                                |
| `mode`     | light, dark                                                                                     |
| `viewport` | desktop (1440), tablet (768), mobile (390)                                                      |
| `view`     | `matrix` — 4×2 grid；默认 detail                                                                |
| `embed`    | `1` — 无侧栏，供 matrix iframe 使用                                                             |

## Showcase → 真实来源

| Showcase                       | Import 来源                                 | 说明                                       |
| ------------------------------ | ------------------------------------------- | ------------------------------------------ |
| tokens                         | `@life-os/theme` generated                  | 品牌 token 预览                            |
| buttons / segments / utilities | `@life-os/theme` CSS 类                     | theme 层 primitive，非 platform-web Svelte |
| settings                       | `@life-os/platform-web/svelte/settings/*`   | 样式在 theme，P3b 已接 `--control-*`       |
| brand / icon                   | `@life-os/platform-web/svelte/brand\|icon`   | 无独立色值                                 |
| navigation                     | `@life-os/platform-web/svelte/navigation/*` | BackButton + MobileMoreSheet               |
| feedback                       | `SyncErrorBanner` + `Toast`                 | banner + toast 均走 `--feedback-*`         |
| toast                          | `@life-os/platform-web/svelte/toast`        | co-located `toast.css`                     |
| cards                          | `@life-os/platform-web/svelte/card`         | co-located `card.css`                      |

**Catalog 预览约定（P0 UX）：**

- `CatalogShell` 将 `data-app` / `data-mode` / `data-theme` **同步到 `<html>`**，与生产 app 一致，确保 `:root` component token 能解析品牌变量。
- 固定定位组件（Toast、`.banner--fixed`、MobileMoreSheet）在 showcase 内使用 `.catalog-doc-preview` 内联预览模式；open sheet fixture 传 `manageFocus={false}` 避免截图 focus ring。
- `SettingsActionRow` 支持 `variant="danger"` 用于 Sign out 等破坏性操作。

## 新增 showcase

1. `src/showcases/MyShowcase.svelte` — import 真实 `@life-os/platform-web` 或 document theme 类
2. 注册 `src/lib/catalogNav.js` + `src/App.svelte` pages 映射
3. 勿在 catalog 内复制 theme token 或组件实现
