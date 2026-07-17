# Life OS Design System

`@life-os/theme` 是全线 Web 应用（Planner / Fitness / Finance / Music / Portal / Home / AIOS，+ starter 模板与 design-catalog）的 **Web CSS 与设计 token** 包。

## 组件选型决策表（要做 X → 用 Y，别自己写）

| 要做的事                     | 用这个                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| 底部弹层 / 居中确认框        | `@life-os/platform-web/svelte/overlay` → `LifeOsSheet` / `LifeOsDialog`（行为内置）      |
| 表单字段（文本/数字/下拉/日期） | `@life-os/platform-web/svelte/form` → `TextField` 等六件；错误/提示/label-for 内置     |
| 空列表 / 加载失败画面        | `@life-os/platform-web/svelte/status` → `EmptyState` / `ErrorState`                      |
| 移动底栏 / 桌面侧栏          | `@life-os/platform-web/svelte/navigation/bottom-nav` / `side-nav`（IA/active 留 app）    |
| 顶栏 / 返回                  | `@life-os/platform-web/svelte/app-bar` → `LifeOsAppBar`                                  |
| 下拉菜单                     | `@life-os/platform-web/svelte/menu` → `Menu`                                             |
| 设置页行/开关/分组           | `@life-os/platform-web/svelte/settings/*`                                                |
| 卡片                         | `@life-os/platform-web/svelte/card`                                                      |
| Toast / Banner               | `@life-os/platform-web/svelte/toast` + theme `.banner`                                   |
| 图表配色/网格/轴/tooltip     | token：`--chart-grid` / `--chart-axis` / `--chart-tooltip-*` / `--chart-line*` / 语义色  |
| 品牌色                       | `packages/design-tokens/tokens/brands/<app>.json` → `npm run build:tokens`，**不手写**   |
| 新 app                       | `node scripts/create-life-os-app.mjs` + `promote-life-os-app.mjs`（全注册表接线）        |

新增 catalog showcase 的四处注册由 `npm run check:design-catalog-registry` 机器对账（进 CI）。

> **边界**：theme 是 **web-only** 层，**不依赖** `@life-os/contracts`。跨 Surface 产品语义见 [`../../docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md) 与 [`../../docs/architecture/contracts.md`](../../docs/architecture/contracts.md)。Future iOS native 使用 SwiftUI DesignTokens（映射 token 命名，不 import 本包 CSS）。

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
| `layout.css`        | Custom media 断点、`--tabbar-h`、container 主列契约                                    |
| `content-frame.css` | `data-content-mode`、页眉/内容共享 frame（`--content-span`）                           |
| `grid.css`          | 模式化栅格：`.life-os-grid--split` / `--autofill` / `--kpi` / `--stack`（CQ 驱动）     |
| `tokens.css`        | 间距、字号、动效、safe-area、语义色、mobile-content-inset                              |
| `ios-safari.css`    | **iOS/Safari 平台层**：100dvh、overscroll、scroll lock、chrome tint、表单防缩放        |
| `base.css`          | Reset、tap 优化、`.page-title`、`.wrap`、工具类                                        |
| `shell.css`         | App shell、侧栏、AppBar、底栏、More Sheet                                              |
| `seg.css`           | 分段控件 `.seg`（Finance pill / Planner chips / Fitness track，经 `:root` token 切换） |
| `settings-ext.css`  | 设置页布局、`.set-group`、`.toggle` / `.settings-toggle`                               |
| `modal.css`         | 居中 Modal 壳（`.modal-bg` / `.modal`）                                                |
| `scrollbar.css`     | 共享滚动条基线（thin + 圆角 + `--scrollbar-thumb*` 主题化）                            |
| `portrait-gate.css` | 移动端横屏提示门                                                                       |
| `utilities.css`     | `.life-os-pad-inline` / `.life-os-scroll-x*` 等工具类（`@layer life-os.utilities`）    |
| `app-themes.css`    | 品牌主题聚合（re-export `generated/app-themes.css`，真源在 design-tokens）             |
| `reduced-transparency.css` | `prefers-reduced-transparency` 降级：chrome 转不透明 + 全局关 backdrop-filter（不进 @layer，特异度压过 brand CSS） |
| `design-system.css` | 上述全部 `@import`（music 播放器壳 2026-07-14 已迁回 `apps/music`）                    |

## 各 App 职责

**设计系统提供：** 结构 token、布局壳、通用组件 class。

**各 App 保留：** 品牌色（`--accent`、`--bg`、`--sidebar-*`）、领域组件（任务行、图表、训练控件等）。

### Token 分层

| 层    | 文件                                  | 内容                                                         |
| ----- | ------------------------------------- | ------------------------------------------------------------ |
| 结构  | `tokens.css`                          | 间距、字号、safe-area、FAB/按钮尺寸、共享语义色              |
| 平台  | `ios-safari.css`                      | 视口高度、橡皮筋、Sheet 滚动锁、Safari 26 chrome tint        |
| 布局  | `layout.css` + `grid.css`             | 断点、tabbar 高度、模式化栅格（split / autofill / kpi）      |
| 壳层  | `shell.css`                           | 侧栏、AppBar/PageHeader、底栏、More Sheet                    |
| 分段  | `seg.css`                             | `.seg`、`.seg-scroll`、`.seg-chips` / `.seg-track` 修饰符    |
| 设置  | `settings-ext.css` + `components.css` | 设置页网格、分组卡片、toggle                                 |
| Modal | `modal.css`                           | 居中对话框壳；领域内容（如 Fitness 重量 stepper）留各 app    |
| 组件  | `components.css`                      | 按钮、Sheet、Toast（`--toast-*` token）、Banner、状态原语（`.skeleton` / `.spinner` / `.badge` / `.empty-*`）、`.life-os-popover` 面板基座（行为组件：platform-web `svelte/menu`）、进度条 `.progress`（含 `--indeterminate`）、选择控件 `.checkbox` / `.radio` / `.option-row` / `.slider` / `.stepper`、页签 `.tabs` / `.tab`（行为：platform-web `svelte/tabs`）、搜索框 `.field-search`、图标按钮 `.icon-btn`、KPI 瓦片 `.stat`、chip 交互态 `button.chip` / `.chip__remove` / `.chip-row`、头像 `.avatar`（组叠 `.avatar-group`）、数据表 `.table` / `.table-wrap`、列表 `.list` / `.list-item`、手风琴 `.accordion`、时间线 `.timeline`、面包屑 `.breadcrumbs`、星级 `.rating`、悬停提示 `[data-life-os-tooltip]`、向导步骤 `.steps`、页码 `.pagination`、拖放区 `.dropzone`、键帽 `.kbd`、分隔线 `.divider` |
| 品牌  | 各 app `:root`                        | 色板、图表色、Finance `--primary` / Fitness `--text-hero` 等 |

> **⚠️ 保留类名不可占用。** 上表 `components.css` 里的组件裸类名（`.steps` / `.card`… 见清单，
> 其中 `.steps` / `.chip` / `.stat` / `.list` / `.field` / `.badge` / `.divider` 这些通用单词最扎手）
> 是全局加载的。app 组件**别在自己 scoped `<style>` 里重定义**它们做别的用途：Svelte 只提升
> scope 特异性、不覆盖你没写的属性，于是全局那份组件样式的 `display:flex` 等会漏进来 ——
> `.steps` 竖清单被压成横排 3 列即此（2026-07）。自有元素请换个不占保留名的类名（如 `.task-steps`）。
> **护栏**：`scripts/check-lifeos-styles.mjs` 的 `reserved-ds-class` 规则（棘轮，CI）自动拦新增，
> 保留清单从本文件所述的 `components.css` 顶层选择器派生。

### 圆角阶梯（2026-07-15 起）

| 层级    | Token                                  | 值    | 用途                          |
| ------- | -------------------------------------- | ----- | ----------------------------- |
| control | `--radius-control`（=`--control-radius`） | 8px   | 按钮、输入框、seg、nav-item   |
| surface | `--radius-lg`（=`--radius-sm`，已收敛） | 12px  | 卡片、banner、popover、面板   |
| overlay | `--radius-overlay`                     | 20px  | Sheet、Modal、More Sheet      |
| pill    | `--radius-pill`                        | 999px | chip、badge、FAB、开关        |

`--radius-sm`/`--control-radius` 为兼容别名，新代码一律用左列语义名；不要再写字面量圆角。

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

**2026-07-16 重做**：toast 默认为**中性浮层卡片**（`--card` 底 / `--border-l` 边 / `--radius-lg` 12px / 深色模式抬 `--card-h`），tone 由 `.toast-dot` 语义色圆点表达（success/error/warn/info → `--feedback-*`），不再整条 tint 底 + pill。
各 app 仍可通过 `:root` 覆盖 `--toast-radius`、`--toast-bg`、`--toast-border`、`--toast-font`（music 的旧 tint 覆盖已删，走默认）；Fitness focus 视图抬高位置保留在 app 层 override。

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
   - `.life-os-pad-inline` — 页面级水平 inset（与 `.wrap` / `.content` 同款 safe-area 公式）
   - `.life-os-inset-inline` — 嵌套块水平 inset（设置行、卡片内文案）
   - `.life-os-bleed-x` — full-bleed 横向滚动（负边距 + gutter 对齐）
   - `.life-os-scroll-x` — 横向滚动（`overscroll-behavior-x: contain`，隐藏 scrollbar）
   - `.life-os-scroll-x--snap` — tab/chip 条（proximity snap + `--inset-inline-*` scroll-padding）
   - `.life-os-scroll-x--snap-mandatory` — 卡片 carousel（mandatory snap）
   - `.life-os-scroll-x--fade-edge` — 容器内缘 mask 渐隐（seg 等）
   - `.life-os-scroll-fade` — tablist 外层渐隐（不裁切 active 下划线）
   - 表格等数据区只用 `.life-os-scroll-x`，勿加 `--snap`

### 移动端水平 Inset 契约（四端统一）

Modern mobile-first 实践（16px 最小 lateral padding + `env(safe-area-inset-*)` + design token 分层）已沉淀为以下 token：

| Token                  | 手机默认            | reflow ≤320 | narrow ≤380 | tablet 600–839 | desktop ≥840 |
| ---------------------- | ------------------- | ----------- | ----------- | -------------- | ------------ |
| `--page-gutter`        | 16px                | 12px        | 14px        | 20px           | 32px         |
| `--inset-inline`       | = `--page-gutter`   | 同左        | 同左        | 同左           | 同左         |
| `--content-inline-pad` | `max(gutter, 居中)` | 同左        | 同左        | 同左           | 同左         |

**页面级**（Planner / Fitness / Music 用 `.wrap`，Finance 用 `main.content`）：

```css
padding-inline-start: max(
  var(--content-inline-pad),
  var(--safe-left-effective)
);
padding-inline-end: max(var(--content-inline-pad), var(--safe-right-effective));
```

**嵌套级**（设置行 `.set-row`、`.block-desc`、卡片内文案）：只用 `--inset-inline`，不再硬编码 `14px` / `18px`。

**full-bleed 横向滚动**（filter chip 条、表格）：`.life-os-bleed-x` 或 `margin-inline: calc(-1 * var(--wrap-pad-x)); padding-inline: var(--wrap-pad-x)`。

**禁止**：在页面/设置层写裸 `padding: 0 18px`；组件内 chip/button 用 `--btn-pad-x-*` 或 `--space-*`。

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
  isLifeOsMobile,
  lifeOsMobileMq,
  bindLifeOsMedia,
  applyDocumentMeta,
  resolveTheme,
  applyResolvedTheme,
} from '@life-os/theme'
```

页眉 / 响应式完整契约：[`../../docs/architecture/responsive-chrome.md`](../../docs/architecture/responsive-chrome.md)。

## 维护规则

1. 断点 / gutter：**只改** `layout.css` + `layout.js`
2. AppBar 高度 / scroll-padding：**只改** `design-tokens` `structural.json` + `shell.css`
3. 共享组件视觉：**只改** `design-system.css` 子模块
4. 品牌色 / 领域 UI：**只改** 各 app 的 `app.css` / `index.css`
5. 六端不再保留 legacy theme 副本；JS 勿硬编码 `839px`（用 `isLifeOsMobile()`）
6. **依赖方向**：`@life-os/theme` **不依赖** `@life-os/contracts` 或 `@life-os/platform-web`。Browser runtime 组合逻辑目标迁入 `platform-web`（P1+）。详见 [`../../docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md)

同目录另有 `@life-os/sync`（`packages/sync`）。产品契约见 [`../../docs/architecture/contracts.md`](../../docs/architecture/contracts.md)。

## Custom Media 速查

| 名称                | 范围      |
| ------------------- | --------- |
| `--life-os-reflow`  | ≤320px    |
| `--life-os-narrow`  | ≤380px    |
| `--life-os-phone`   | ≤599px    |
| `--life-os-compact` | ≤640px    |
| `--life-os-tablet`  | 600–839px |
| `--life-os-mobile`  | ≤839px    |
| `--life-os-desktop` | ≥840px    |

## Header chrome 速查

| Token                  | Desktop             | Mobile                      |
| ---------------------- | ------------------- | --------------------------- |
| `--appbar-h`           | 56px                | `= --page-header-h`         |
| `--appbar-h-back`      | 52px                | `52px + safe-top`           |
| `--page-header-h`      | 68px                | `88px + safe-top`           |
| `--scroll-padding-top` | `= --page-header-h` | back 时用 `--appbar-h-back` |
