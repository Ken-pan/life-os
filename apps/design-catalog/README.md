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

| 阶段 | 状态 |
| ---- | ---- |
| P1/P2 品牌 tokens + 四端迁移 | ✅ |
| P3a Card primitive + component tokens 骨架 | ✅ |
| P3b Settings / Toast / Navigation / Banner 深 token 化 | ✅ |
| P3c Button / Segment / Toggle token 化 | ✅ |
| P4 Catalog matrix view | ⏳ |
| P5 Playwright screenshot baseline | ⏳ |

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
npm run test:design-catalog    # Playwright visual smoke
```

## URL 参数

| 参数       | 值                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------- |
| `showcase` | tokens, buttons, segments, utilities, settings, brand, navigation, icon, feedback, toast, cards |
| `app`      | planner, fitness, finance, music                                                         |
| `mode`     | light, dark                                                                              |
| `viewport` | desktop (1440), tablet (768), mobile (390)                                               |

## Showcase → 真实来源

| Showcase | Import 来源 | 说明 |
| -------- | ----------- | ---- |
| tokens | `@life-os/theme` generated | 品牌 token 预览 |
| buttons / segments / utilities | `@life-os/theme` CSS 类 | theme 层 primitive，非 platform-web Svelte |
| settings | `@life-os/platform-web/svelte/settings/*` | 样式在 theme，P3b 已接 `--control-*` |
| brand / icon | `@life-os/platform-web/svelte/brand|icon` | 无独立色值 |
| navigation | `@life-os/platform-web/svelte/navigation/*` | BackButton + MobileMoreSheet |
| feedback | `SyncErrorBanner` + `Toast` | banner + toast 均走 `--feedback-*` |
| toast | `@life-os/platform-web/svelte/toast` | co-located `toast.css` |
| cards | `@life-os/platform-web/svelte/card` | co-located `card.css` |

## 新增 showcase

1. `src/showcases/MyShowcase.svelte` — import 真实 `@life-os/platform-web` 或 document theme 类
2. 注册 `src/lib/catalogNav.js` + `src/App.svelte` pages 映射
3. 勿在 catalog 内复制 theme token 或组件实现
