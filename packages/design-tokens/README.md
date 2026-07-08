# @life-os/design-tokens

Life OS design token **source of truth**（DTCG-like JSON）。品牌 CSS 不再手写——改这里的 JSON，然后重新生成。

## 数据流

```txt
tokens/primitive.json          原始值：色板 / spacing / radius / type scale / font stacks
tokens/semantic.json           共享状态色（positive/warning/critical/info）+ 品牌语义契约
tokens/brands/{app}.json       每个 app 的品牌 token（modes: light/dark）
tokens/component.json          共享 component tokens（card / control / feedback / navigation / focus）
        ↓ npm run build:tokens
packages/theme/src/generated/brands/{app}.css
packages/theme/src/generated/app-themes.css
packages/theme/src/generated/component.css
        ↓ import
@life-os/theme/design-system.css  （含 generated/component.css）
```

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
- Component tokens（`tokens/component.json`）生成 `--card-*` / `--focus-*` 等变量，供 `@life-os/platform-web` Card primitive 消费。
- 新增品牌变量需满足 `semantic.json` 里的 contract（bg / card / border / accent / on-accent / sidebar + 一套文本层级）。

## Token 引用格式

`$value` 支持 `{dot.path}` 引用 `primitive.json`，构建时解析为字面值：

```json
"accent": { "$type": "color", "$value": "{color.planner.amber.600}" }
```
