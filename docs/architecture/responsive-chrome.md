# Life OS 响应式与页眉契约

> **SSOT：** `@life-os/theme`（`layout.css` / `layout.js` / `shell.css`）+ `@life-os/design-tokens`（`--appbar-h` 等）
> 六端共用：Planner · Fitness · Finance · Music · Portal · Home

本文档把「页眉 ↔ 页面响应式」的行业实践，收敛成 Life OS 可执行契约。各 app 旧版 `docs/RESPONSIVE.md` 仅作历史走查；**以本文为准**。

---

## 1. 适合我们的模型（结论）

Life OS 是 **多 app 壳层产品**（侧栏 + AppBar + 底栏 / Portal 精简 chrome），不是营销站。因此：

| 决策      | 选型                                                           | 原因                                                                                 |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 导航折叠  | **Viewport media**（`--life-os-mobile` ≤839）                  | 侧栏/底栏是整页 chrome，不是组件槽位宽度                                             |
| 卡片/网格 | **Container queries**（`life-os-main` / `.life-os-container`） | 主列有侧栏时，组件应对自己的宽度负责                                                 |
| 顶栏吸顶  | **CSS `position: sticky`**                                     | 避免 scroll listener 拖慢 INP；PWA standalone 内改为 relative（见 `ios-safari.css`） |
| 锚点避让  | **`html { scroll-padding-top: var(--scroll-padding-top) }`**   | sticky 页眉不挡 `#hash` / 焦点                                                       |
| 触控      | **`--tap-min: 44px`**                                          | WCAG / Apple HIG                                                                     |
| 移动导航  | **底栏 Primary（≤4）+ More Sheet**                             | Finance 标杆；隐藏链接用 disclosure，不用 ARIA `menu`                                |

**不采用：** 桌面汉堡隐藏主链、用 container query 切换侧栏、用 JS 量测滚动改页眉阴影（优先等 scroll-state 普及后再加）。

---

## 2. 断点（Viewport）

| Custom media        | 范围      | 壳层行为                            |
| ------------------- | --------- | ----------------------------------- |
| `--life-os-reflow`  | ≤320px    | 最小 gutter（WCAG 1.4.10）          |
| `--life-os-narrow`  | ≤380px    | 极窄微调                            |
| `--life-os-phone`   | ≤599px    | 紧凑 gutter                         |
| `--life-os-compact` | ≤640px    | 设置折叠等                          |
| `--life-os-tablet`  | 600–839px | 加宽 gutter；仍无侧栏               |
| `--life-os-mobile`  | ≤839px    | **隐藏侧栏、显示底栏、双行 AppBar** |
| `--life-os-desktop` | ≥840px    | **持久侧栏、隐藏底栏、单行标题**    |

JS（禁止硬编码 `839px`）：

```js
import {
  LIFE_OS_LAYOUT,
  isLifeOsMobile,
  lifeOsMobileMq,
  bindLifeOsMedia,
} from '@life-os/theme'
```

---

## 3. 页眉 Chrome Token

| Token                  | Desktop 默认         | Mobile                        | 用途                                                 |
| ---------------------- | -------------------- | ----------------------------- | ---------------------------------------------------- |
| `--appbar-h`           | `56px`               | `= --page-header-h`           | 次级 sticky / 画布顶偏移（Planner recap、Home plan） |
| `--appbar-height`      | alias → `--appbar-h` | 同左                          | 兼容旧写法                                           |
| `--appbar-h-back`      | `52px`               | `52px + safe-top`             | `.appbar--back` 单行                                 |
| `--page-header-h`      | `68px`               | `88px + safe-top`             | 完整页头高度 / scroll-padding 基准                   |
| `--scroll-padding-top` | `= --page-header-h`  | back 时切到 `--appbar-h-back` | `html` 锚点避让                                      |
| `--tabbar-h`           | —                    | `62px`                        | 底栏内容高                                           |
| `--header-block`       | `var(--space-5)`     | —                             | AppBar 上下 padding                                  |

**规则：**

1. 次级 sticky 的 `top` 用 `var(--appbar-h)`，不要写死 `56px` / `49px`。
2. 不要在各 app 再写一遍 `html { scroll-padding-top }`（theme `shell.css` 已统一）。
3. 领域页可覆盖 `--page-header-h`（如 Finance mobile 与 shell 对齐的 88px 公式），但应走 token，不走裸 px。

---

## 4. Content Frame（页眉 ↔ 内容宽度对齐）

行业做法：**外壳满宽 + 内层共享 frame**（header-inner 与 main 用同一 `max-width` + `margin-inline: auto`）。

| 模式            | `data-content-mode` | 行为                                                               |
| --------------- | ------------------- | ------------------------------------------------------------------ |
| **max**（默认） | 省略                | `--content-max` + `--content-inline-pad` 居中窄列（820px 等）      |
| **span**        | `span`              | 主列 workspace 宽 `--content-span`；可选 `--content-span-max` 封顶 |

**Token（`content-frame.css`）：**

| Token                | 含义                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `--content-span`     | `100cqw - 2×page-gutter-desktop`（在 `.main-col` / `.main-wrap` 上） |
| `--content-span-max` | App 级封顶（Music `1240px`、Finance 可设 `1320px`）                  |

**挂载点：**

```html
<!-- Layout 级（Fitness / Music / Home / Finance） -->
<div class="main-wrap" data-content-mode="span">…</div>

<!-- Page 级（Planner split 页） -->
<div class="life-os-page-workspace" data-content-mode="span">
  <AppBar … />
  <div class="today-layout">…</div>
</div>
```

**JS：**

```js
import { LIFE_OS_CONTENT_FRAME } from '@life-os/theme'
// LIFE_OS_CONTENT_FRAME.modeSpan === 'span'
```

**各 App 配置：**

| App              | span 场景                      | 配置位置                                                           |
| ---------------- | ------------------------------ | ------------------------------------------------------------------ |
| Planner          | 今天 / 日历 / 已完成 / 设置    | 页内 `.life-os-page-workspace`                                     |
| Music            | wide 路由（library / search…） | `main-wrap[data-content-mode=span]` + `--content-span-max: 1240px` |
| Home             | `/plan`                        | **immersive**：隐藏壳层 AppBar，全宽 canvas + `plan-top`           |
| Finance          | —                              | 默认 `max` + `--content-max: 1320px`（已对齐）                     |
| Fitness / Portal | —                              | 默认 `max`（已对齐）                                               |

---

## 5. AppBar 行为矩阵

| 场景           | Mobile / Tablet                                            | Desktop                     |
| -------------- | ---------------------------------------------------------- | --------------------------- |
| 根页面         | 品牌 + 标题（可副标题）+ trailing                          | 仅标题 + trailing；隐藏品牌 |
| 子页面         | `.appbar--back`：返回 + 单行标题                           | 返回 + 标题                 |
| Portal         | 精简 sticky AppBar；内容区 `page-header` **static**        | 同左                        |
| Home plan      | 可用 `--appbar-h` 做工具条偏移；编辑 immersive 可收 chrome | 同左                        |
| PWA standalone | 顶栏在滚动容器外 → `position: relative`                    | —                           |

无障碍：Skip link → `<header>` / AppBar → `<main id="main-content">`；移动 More 用 **Disclosure**（`button` + `aria-expanded`）。

---

## 6. 壳层选型

| 模式                 | 结构                                                                   | 适用                           |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `main-col`           | `app-shell > [sidebar] + main-col > AppBar? + .wrap`                   | Planner、Portal、Home          |
| `main-wrap`          | `app-shell > [sidebar] + main-wrap > AppBar + #main-content\|.content` | Fitness、Music、Finance        |
| `data-mobile-chrome` | `tabbar` / `minimal` / FAB 组合                                        | 控制 `--mobile-content-inset*` |

PWA **单一滚动面** 见 [`../qa/pwa-ios.md`](../qa/pwa-ios.md) 与 `ios-safari.css`。

---

## 7. Container Queries

- `.main-col` / `.main-wrap`：`container-name: life-os-main`，用 `100cqw` 算 `--content-inline-pad`。
- 可复用块加 `.life-os-container` 或自设 `container-type: inline-size`。
- **禁止**用 `@container` 切换侧栏/底栏。

Token：`--cq-xs` … `--cq-lg`（320 / 480 / 640 / 840）。

---

## 8. 维护清单

| 改什么                       | 改哪里                                                |
| ---------------------------- | ----------------------------------------------------- |
| 断点数值                     | `layout.css` + `layout.js`                            |
| Content frame / span 对齐    | `content-frame.css`                                   |
| AppBar 高度 / scroll-padding | `design-tokens` + `shell.css`                         |
| 底栏 / 壳层 class            | `shell.css`                                           |
| 品牌色 / 领域 sticky         | 各 app `app.css` / `index.css`（引用 `--appbar-h`）   |
| JS media                     | `isLifeOsMobile()` / `lifeOsMobileMq()`，勿写 `839px` |

验证：`npm run build:tokens && npm run validate:tokens`
