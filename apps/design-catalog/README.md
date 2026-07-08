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

P1 已完成：`packages/design-tokens` JSON → `npm run build:tokens` 生成 `packages/theme/src/generated/*.css`。
P3 可选：Storybook / Histoire（Svelte 5 稳定后）或 Playwright visual regression 扩展。

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
| `showcase` | tokens, buttons, segments, utilities, settings, brand, navigation, icon, feedback, toast |
| `app`      | planner, fitness, finance, music                                                         |
| `mode`     | light, dark                                                                              |
| `viewport` | desktop (1440), tablet (768), mobile (390)                                               |

## 新增 showcase

1. `src/showcases/MyShowcase.svelte` — import 真实 `@life-os/platform-web` 组件
2. 注册 `src/lib/catalogNav.js` + `src/App.svelte` pages 映射
3. 勿在 catalog 内复制 theme token 或组件实现
