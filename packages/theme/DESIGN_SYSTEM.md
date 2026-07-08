# Life OS Design System

`@life-os/theme` 是四端 Web 应用（Planner / Fitness / Finance / Music）的 **Web CSS 与设计 token** 包。

> **边界**：theme 是 **web-only** 层，**不依赖** `@life-os/contracts`。跨 Surface 产品语义见 [`../../docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md) 与 [`../../docs/LIFEOS_CONTRACTS.md`](../../docs/LIFEOS_CONTRACTS.md)。Future iOS native 使用 SwiftUI DesignTokens（映射 token 命名，不 import 本包 CSS）。

## 安装

在 monorepo 根目录 `npm install` 后，各 app 通过 workspace 自动链接 `@life-os/theme` / `@life-os/sync`。

## 使用

在 `app.css` / `index.css` **顶部**引入完整设计系统（含响应式断点）：

```css
@import '@life-os/theme/design-system.css';
```

仅需断点 token 时（旧用法，仍支持）：

```css
@import '@life-os/theme/layout.css';
```

需配合 `postcss-custom-media`（各 app 的 `postcss.config.js`）。

## 模块结构

| 文件                | 内容                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| `layout.css`        | Custom media 断点、`--tabbar-h`                                                        |
| `tokens.css`        | 间距、字号、动效、safe-area、语义色、mobile-content-inset                              |
| `ios-safari.css`    | **iOS/Safari 平台层**：100dvh、overscroll、scroll lock、chrome tint、表单防缩放        |
| `base.css`          | Reset、tap 优化、`.page-title`、`.wrap`、工具类                                        |
| `shell.css`         | App shell、侧栏、AppBar、底栏、More Sheet                                              |
| `seg.css`           | 分段控件 `.seg`（Finance pill / Planner chips / Fitness track，经 `:root` token 切换） |
| `settings-ext.css`  | 设置页布局、`.set-group`、`.toggle` / `.settings-toggle`                               |
| `modal.css`         | 居中 Modal 壳（`.modal-bg` / `.modal`）                                                |
| `music-shell.css`   | MusicOS 播放器壳：Mini Player、Now Playing、进度条、专辑网格                           |
| `design-system.css` | 上述全部 `@import`                                                                     |

## 各 App 职责

**设计系统提供：** 结构 token、布局壳、通用组件 class。

**各 App 保留：** 品牌色（`--accent`、`--bg`、`--sidebar-*`）、领域组件（任务行、图表、训练控件等）。

### Token 分层

| 层    | 文件                                  | 内容                                                         |
| ----- | ------------------------------------- | ------------------------------------------------------------ |
| 结构  | `tokens.css`                          | 间距、字号、safe-area、FAB/按钮尺寸、共享语义色              |
| 平台  | `ios-safari.css`                      | 视口高度、橡皮筋、Sheet 滚动锁、Safari 26 chrome tint        |
| 布局  | `layout.css`                          | 断点、tabbar 高度                                            |
| 壳层  | `shell.css`                           | 侧栏、AppBar/PageHeader、底栏、More Sheet                    |
| 分段  | `seg.css`                             | `.seg`、`.seg-scroll`、`.seg-chips` / `.seg-track` 修饰符    |
| 设置  | `settings-ext.css` + `components.css` | 设置页网格、分组卡片、toggle                                 |
| Modal | `modal.css`                           | 居中对话框壳；领域内容（如 Fitness 重量 stepper）留各 app    |
| 组件  | `components.css`                      | 按钮、Sheet、Toast（`--toast-*` token）、Banner              |
| 品牌  | 各 app `:root`                        | 色板、图表色、Finance `--primary` / Fitness `--text-hero` 等 |

### 文本色兼容

- Planner / Fitness：`--t1` … `--t4`
- Finance：`--text`、`--text-secondary`、`--text-muted`

共享 CSS 使用 `var(--t1, var(--text))` 等形式，无需在 Finance 重复定义 `--t1`。

### Seg app token 示例

| App     | 关键 token                                                                 |
| ------- | -------------------------------------------------------------------------- |
| Finance | `--seg-active-bg-token: var(--lime)`                                       |
| Planner | `--seg-track-bg: transparent`、`--seg-btn-border: 1px solid var(--border)` |
| Fitness | `--seg-track-border`、`--seg-track-radius: 9px`、`--toggle-on-bg`          |

### Toast token

各 app 可通过 `:root` 覆盖 `--toast-radius`、`--toast-bg`、`--toast-border`、`--toast-font`；Fitness focus 视图抬高位置保留在 app 层 override。

### iOS / Safari 集成清单

1. **Viewport**（各 app `app.html` / `index.html`）：`viewport-fit=cover` + `apple-mobile-web-app-*`
2. **Chrome tint 节点**：在 `.app-shell` 内放置（各 app layout 按需接入）：
   ```html
   <div class="safari-chrome-tint-top" aria-hidden="true"></div>
   <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>
   ```
3. **Token 覆盖**（可选）：
   - `--safari-chrome-tint-top-bg` / `--safari-chrome-tint-bottom-bg`
   - `--mobile-content-inset*`（FAB + 底栏留白公式）
4. **工具类**（`utilities.css`，`@layer life-os.utilities`）：
   - `.life-os-scroll-x` — 横向滚动（`overscroll-behavior-x: contain`，隐藏 scrollbar）
   - `.life-os-scroll-x--snap` — tab/chip 条（proximity snap + safe-area scroll-padding）
   - `.life-os-scroll-x--snap-mandatory` — 卡片 carousel（mandatory snap）
   - `.life-os-scroll-x--fade-edge` — 容器内缘 mask 渐隐（seg 等）
   - `.life-os-scroll-fade` — tablist 外层渐隐（不裁切 active 下划线）
   - 表格等数据区只用 `.life-os-scroll-x`，勿加 `--snap`

### 架构原则（对齐现代 token 分层）

采用 **Primitive → Semantic → Component → Platform** 四层，与 W3C DTCG / Material 3 思路一致：

- **Primitive**：`tokens.css` 间距、字号、色板基线
- **Semantic**：`--safe-*-effective`、`--mobile-content-inset*`、`--positive` 等意图 token
- **Component**：`shell.css` / `components.css` 中的 class
- **Platform**：`ios-safari.css` 仅处理 WebKit / iOS 差异，避免污染组件层

各 app **只改 `:root` 品牌色与领域 CSS**，不再复制 Safari 修复片段。

## JS API

```js
import {
  LIFE_OS_LAYOUT,
  applyDocumentMeta,
  resolveTheme,
  applyResolvedTheme,
} from '@life-os/theme'
```

## 维护规则

1. 断点 / gutter：**只改** `layout.css` + `layout.js`
2. 共享组件视觉：**只改** `design-system.css` 子模块
3. 品牌色 / 领域 UI：**只改** 各 app 的 `app.css` / `index.css`
4. 四端不再保留 legacy theme 副本
5. **依赖方向**：`@life-os/theme` **不依赖** `@life-os/contracts` 或 `@life-os/platform-web`。Browser runtime 组合逻辑目标迁入 `platform-web`（P1+）。详见 [`../../docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md)

同目录另有 `@life-os/sync`（`packages/sync`）。产品契约见 [`../../docs/LIFEOS_CONTRACTS.md`](../../docs/LIFEOS_CONTRACTS.md)。

## Custom Media 速查

| 名称                                    | 范围      |
| --------------------------------------- | --------- |
| `--life-os-narrow`                      | ≤380px    |
| `--life-os-phone` / `--life-os-compact` | ≤640px    |
| `--life-os-tablet`                      | 641–860px |
| `--life-os-mobile`                      | ≤860px    |
| `--life-os-desktop`                     | ≥861px    |
