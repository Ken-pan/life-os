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

| 阶段                                                | 状态                   |
| --------------------------------------------------- | ---------------------- |
| P1/P2 品牌 tokens + 四端迁移                        | ✅ 已推送 `master`     |
| P3 catalog UX + component tokens（a–c）             | ✅ `ff37d401` 及之前   |
| P4a/c Matrix + smoke                                | ✅ `02c3733a`          |
| P4b/d/e state 维度 + CommandPalette + chrome tokens | ✅ 本地，**待 commit** |
| P5 Pixel baseline（80 PNG）                         | ✅ 本地，**待 commit** |
| P6 a11y gates                                       | ⏳ 下一步              |

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
npm run test:design-catalog              # smoke only（172 tests，排除 @visual）
npm run test:design-catalog:snapshots      # pixel regression（80 baselines，desktop）
npm run test:design-catalog:snapshots:update  # 有意 UI 变更后更新 baseline
npm run test:design-catalog:snapshots:docker:update  # Linux CI 对齐（Playwright Docker）
npm run test:design-catalog:all            # smoke + snapshots（252 tests）
```

### Matrix view（P4a + P4b）

```txt
/?view=matrix&showcase=buttons     # states × 4 app × 2 mode iframe grid（state 行可折叠）
/?showcase=toast&app=planner&mode=light&embed=1&state=success
/?showcase=buttons&app=planner&mode=light&state=disabled  # detail 单 state 过滤
```

- 侧栏 **Matrix (states×4×2)**；点击 cell → detail 并带上 `state`
- Detail 工具栏 **State** 下拉（All states / 各注册态）；侧栏换 showcase 会重置 state
- `embed=1` 隐藏页级 title，仅展示 state 块（供 matrix iframe）

### Ad-hoc 视觉审计（不提交 baseline）

```bash
npm run build -w design-catalog
npm run preview -w design-catalog -- --host 127.0.0.1 --port 5190
node scripts/design-catalog-p3-screenshot-audit.mjs   # 64 PNG + report.json
node scripts/design-catalog-p3-visual-verify.mjs      # 38 项 computed-style 断言
```

输出目录：`screenshots/design-catalog/p3-audit-YYYYMMDD/`（gitignore，勿提交）

### Pixel regression baseline（P5）

- Spec：`tests/visual/design-catalog.snapshots.spec.ts`（`@visual` tag）
- Baselines：`tests/visual/design-catalog.snapshots.spec.ts-snapshots/`（**需提交 git**；文件名 `{name}-catalog-desktop.png`）
- 范围：tokens 4×2 + 9 matrix showcase × 4 app × 2 mode（embed + 各 showcase 默认 state）
- 元素级：`catalog-shell`；`maxDiffPixelRatio: 0.01`；`animations: disabled`
- **Linux CI**：`npm run test:design-catalog:snapshots:docker:update` 或 `scripts/design-catalog-snapshots-docker.sh`

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

| 参数       | 值                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `showcase` | tokens, buttons, segments, utilities, settings, brand, navigation, icon, feedback, toast, cards, command-palette |
| `app`      | planner, fitness, finance, music                                                                                 |
| `mode`     | light, dark                                                                                                      |
| `viewport` | desktop (1440), tablet (768), mobile (390)                                                                       |
| `view`     | `matrix` — states × 4×2 grid；默认 detail                                                                        |
| `embed`    | `1` — 无侧栏，供 matrix iframe 使用                                                                              |
| `state`    | showcase 注册态；省略则 detail 显示全部 state                                                                    |

## Showcase → 真实来源

| Showcase                       | Import 来源                                   | 说明                                   |
| ------------------------------ | --------------------------------------------- | -------------------------------------- |
| tokens                         | `@life-os/theme` generated                    | 品牌 token 预览                        |
| buttons / segments / utilities | `@life-os/theme` CSS 类                       | theme 层 primitive                     |
| settings                       | `@life-os/platform-web/svelte/settings/*`     | P3b `--control-*`                      |
| brand / icon                   | `@life-os/platform-web/svelte/brand\|icon`    | 无独立色值                             |
| navigation                     | `@life-os/platform-web/svelte/navigation/*`   | BackButton + MobileMoreSheet           |
| feedback                       | `SyncErrorBanner` + `Toast`                   | `--feedback-*`                         |
| toast                          | `@life-os/platform-web/svelte/toast`          | co-located `toast.css`                 |
| cards                          | `@life-os/platform-web/svelte/card`           | co-located `card.css`                  |
| command-palette                | `@life-os/platform-web/CommandPalette.svelte` | default live；empty 用 catalog fixture |

**Catalog 预览约定：**

- `CatalogShell` 将 `data-app` / `data-mode` / `data-theme` **同步到 `<html>`**
- 固定定位组件用 `.catalog-doc-preview` 内联预览；sheet 传 `manageFocus={false}`
- State 注册：`src/lib/showcaseStates.js`；块包裹：`CatalogStateBlock`；detail-only 块用 `stateId="detail:…"`

## 新增 showcase

1. `src/showcases/MyShowcase.svelte` — import 真实 `@life-os/platform-web` 或 theme 类
2. `src/lib/showcaseStates.js` 注册 matrix state
3. `CatalogStateBlock` 包裹各 state；`detail:*` 仅 detail 全量视图
4. 注册 `catalogNav.js` + `App.svelte` pages
5. 勿在 catalog 内复制 theme token 或组件实现
