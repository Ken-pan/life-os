# @life-os/theme

Life OS 三端（Planner / Fitness / Finance）共享包：**设计系统 CSS**、**响应式 layout**、**站点 metadata**、**主题 runtime**。

完整设计系统说明见 [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)。

## 安装（各 app 仓库）

```json
{
  "dependencies": {
    "@life-os/theme": "file:../life-os-theme"
  }
}
```

目录结构（`Projects/` 下）：

```
Projects/
  life-os-theme/     ← 本包（唯一维护点）
  Planner/
  Fitness/
  Moneymoneymoney/
```

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

| 名称 | 范围 |
|------|------|
| `--life-os-narrow` | ≤380px |
| `--life-os-compact` / `--life-os-phone` | ≤640px |
| `--life-os-tablet` | 641–860px |
| `--life-os-mobile` | ≤860px |
| `--life-os-desktop` | ≥861px |

## JS

```js
import {
  LIFE_OS_LAYOUT,
  LIFE_OS_SITE_META,
  applyDocumentMeta,
  applyResolvedTheme,
  resolveTheme
} from '@life-os/theme';

applyDocumentMeta('finance', { pageTitle: '今日', locale: 'zh' });
```

## 维护

- 断点 / gutter / layout token：**只改** `src/layout.css` 与 `src/layout.js`
- 三端 PWA / OG metadata：**只改** `src/siteMeta.js`
- 各 app 不再保留 `packages/life-os-theme` 副本
- 样式分层：`design-system.css` 通过 `@layer life-os.*` 导入；**utilities 层最后**，app 未分层 CSS 可覆盖主题
- 横向 tab / chip 滚动：`.life-os-scroll-x` + 按需 `--snap`；勿重复写 overflow/scrollbar

同目录另有共享包 **`@life-os/sync`**（`../life-os-sync`）。
