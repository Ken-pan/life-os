# @life-os/design-tokens

Life OS design token **source of truth**（DTCG-like JSON）。品牌 CSS 不再手写——改这里的 JSON，然后重新生成。

## 数据流

```txt
tokens/primitive.json          原始值：色板 / spacing / radius / type scale / font stacks
tokens/semantic.json           共享状态色（positive/warning/critical/info）+ 品牌语义契约
tokens/brands/{app}.json       每个 app 的品牌 token（modes: light/dark）
tokens/component.json          共享 component tokens（见下表）
        ↓ npm run build:tokens
packages/theme/src/generated/brands/{app}.css
packages/theme/src/generated/app-themes.css
packages/theme/src/generated/component.css
        ↓ import
@life-os/theme/design-system.css  （含 generated/component.css）
        ↓
@life-os/platform-web/svelte/*    co-located CSS where applicable（card / toast / navigation）
```

## component.json 域 → 消费方（P3）

| Token 域     | CSS 变量前缀         | 主要消费方                                              | P3 状态    |
| ------------ | -------------------- | ------------------------------------------------------- | ---------- |
| `focus`      | `--focus-ring`       | Card, buttons focus-visible                             | ✅         |
| `overlay`    | `--overlay-backdrop` | CommandPalette, mobile-more                             | ✅         |
| `card`       | `--card-*`           | `@life-os/platform-web/svelte/card`                     | ✅         |
| `control`    | `--control-*`        | Settings block/row/toggle                               | ✅ P3b/P3c |
| `button`     | `--button-*`         | `.btn-primary` … `.btn-danger`（danger → `--critical`） | ✅ P3c     |
| `segment`    | `--segment-*`        | `.seg` segmented control                                | ✅ P3c     |
| `feedback`   | `--feedback-*`       | Toast, Banner, SyncErrorBanner                          | ✅         |
| `navigation` | `--navigation-*`     | nav tab, mobile-more, BackButton                        | ✅         |

Theme-only primitives（buttons `.btn-*`、segments `.seg`）已接入 `component.json` — 见 **D-P3c** ✅。

## P3 截图 / 视觉审计（ad-hoc，非 baseline）

```bash
npm run build -w design-catalog
npm run preview -w design-catalog -- --host 127.0.0.1 --port 5190
node scripts/design-catalog-p3-screenshot-audit.mjs   # 8 showcase × 4 app × 2 mode = 64 张
node scripts/design-catalog-p3-visual-verify.mjs      # html 主题同步 + 触控/间距/语义色断言
```

| 脚本                                     | 断言内容                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `design-catalog-p3-screenshot-audit.mjs` | 元素截图 + console error + btn 填充 + danger 语义色                                              |
| `design-catalog-p3-visual-verify.mjs`    | `<html data-app>` 同步、toast inline、segments 变体、sheet preview、toast lh≥1.5、action gap≥8px |

输出：`screenshots/design-catalog/p3-audit-YYYYMMDD/`（本地，不提交）

## Toast 结构 token（authored，非 component.json）

位于 `packages/theme/src/tokens.css`：`--toast-pad-*`、`--toast-min-h`、`--toast-line-height`、`--toast-action-gap` 等。语义色仍走 `component.json` → `feedback.*`。

## 命令

```bash
npm run build:tokens      # tokens JSON → packages/theme/src/generated/*.css
npm run validate:tokens   # refs / 契约 / 重复 key / tokens.css drift 检查
```

## 规则

- `packages/theme/src/generated/**` 是生成物，**禁止手改**（提交入库，供 apps 直接消费）。
- 品牌值只能改 `tokens/brands/*.json`；主 accent 走 `{color.<app>.<ramp>.<step>}` 引用 primitive 色板。
- **P2 已完成（2026-07-08）**：四个 production app 均在 `<html>` 上带静态 `data-app`，通过
  `@import '@life-os/theme/brands/<app>.css'` 消费品牌 token；app CSS 不得再手写品牌色，
  只保留 app 专属扩展（shadows / 领域语义 / 图表色 / z-index / chrome）。
- 生成的非默认 mode 同时输出 `[data-mode]`（catalog 用）与 `[data-theme]`（apps 用）双选择器。
- `packages/theme/src/tokens.css`（结构层）目前仍是 authored；`validate:tokens` 会做 drift 校验，后续阶段再切 generated。
- 新增品牌变量需满足 `semantic.json` 里的 contract（bg / card / border / accent / on-accent / sidebar + 一套文本层级）。

## Token 引用格式

`$value` 支持 `{dot.path}` 引用 `primitive.json`，构建时解析为字面值：

```json
"accent": { "$type": "color", "$value": "{color.planner.amber.600}" }
```
