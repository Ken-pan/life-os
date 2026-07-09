# @life-os/theme

Life OS 六端（Planner / Fitness / Finance / Music / Portal / Home）共享包：**设计系统 CSS**、**响应式 layout**、**站点 metadata**、**主题 runtime**。

完整设计系统说明见 [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)。

## 安装（monorepo）

本包位于 `life-os/packages/theme`。各 app 通过 npm workspace 引用：

```json
{
  "dependencies": {
    "@life-os/theme": "*"
  }
}
```

在 monorepo 根目录运行 `npm install` 即可链接。

## CSS

**推荐（完整设计系统）：**

```css
@import '@life-os/theme/design-system.css';
```

**仅断点（legacy）：**

```css
@import '@life-os/theme/layout.css';
```

需配合 `postcss-custom-media`（见各 app 的 `postcss.config.js`）。

### Custom media

| 名称                | 范围      |
| ------------------- | --------- |
| `--life-os-reflow`  | ≤320px    |
| `--life-os-narrow`  | ≤380px    |
| `--life-os-phone`   | ≤599px    |
| `--life-os-compact` | ≤640px    |
| `--life-os-tablet`  | 600–839px |
| `--life-os-mobile`  | ≤839px    |
| `--life-os-desktop` | ≥840px    |

页眉 / scroll-padding / 壳层契约见 [`../../docs/architecture/responsive-chrome.md`](../../docs/architecture/responsive-chrome.md)。

## JS

```js
import {
  LIFE_OS_LAYOUT,
  isLifeOsMobile,
  lifeOsMobileMq,
  bindLifeOsMedia,
  LIFE_OS_SITE_META,
  applyDocumentMeta,
  applyResolvedTheme,
  resolveTheme,
  lockScroll,
  unlockScroll,
  activateFocusTrap,
  createImeGuard,
} from '@life-os/theme'

applyDocumentMeta('finance', { pageTitle: '今日', locale: 'zh' })
if (isLifeOsMobile()) {
  /* … */
}
```

## 维护

- 断点 / gutter / layout token：**只改** `src/layout.css` 与 `src/layout.js`
- AppBar 高度：`packages/design-tokens` → `structural.json`（`--appbar-h`）+ `shell.css`
- 四端 PWA / OG metadata：**只改** `src/siteMeta.js`
- 勿在各 app 内 vendored 副本；GitHub 上 `life-os-theme` 独立仓已归档
- 样式分层：`design-system.css` 通过 `@layer life-os.*` 导入；**utilities 层最后**，app 未分层 CSS 可覆盖主题
- 横向 tab / chip 滚动：`.life-os-scroll-x` + 按需 `--snap`；勿重复写 overflow/scrollbar
- `@life-os/theme` 是 web-only CSS/runtime 包，不依赖 `@life-os/contracts`。边界见 [`../../docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md)。

同目录另有共享包 **`@life-os/sync`**（`packages/sync`）。
