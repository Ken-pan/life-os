# @life-os/contracts

Life OS **cross-surface** product contracts — data shapes, state enums, and user-visible capability semantics with no DOM, CSS, or browser APIs.

## 模块

| 模块                                           | 文件        | 消费方式                                                    |
| ---------------------------------------------- | ----------- | ----------------------------------------------------------- |
| appearance, meta, nav, content, sync, feedback | `*.d.ts`    | **type-only**（JSDoc 或 `import type`）                     |
| **events**                                     | `events.ts` | **Zod runtime**（I-P1.5 ✅；envelope + `finance.bill_due`） |

见 [`../../docs/architecture/contracts.md`](../../docs/architecture/contracts.md) export 白名单；边界规则见 [`../../docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md)。

## Type-only consumption（7 个 `.d.ts` 模块）

| Consumer            | Allowed                                         | Forbidden                                 |
| ------------------- | ----------------------------------------------- | ----------------------------------------- |
| TypeScript          | `import type { … } from '@life-os/contracts/…'` | value import from `.d.ts` modules         |
| JavaScript / Svelte | JSDoc `@typedef {import('…').Type}`             | runtime value import from `.d.ts` modules |

**Runtime value imports** 仅允许 `@life-os/contracts/events`（Zod schema 校验）；其余模块用 `@life-os/platform-web` 做 web adapter。

## 试点状态（C-P1 / C-P1+）

| App     | contracts  | 备注                                                |
| ------- | ---------- | --------------------------------------------------- |
| Planner | ✅ P1A/B/C | JSDoc + `applyDocumentMetaWeb`                      |
| Fitness | ✅ P1A/B/C | 同上                                                |
| Portal  | 🟡 WIP     | dep 已声明；未纳入 turbo CI                         |
| Finance | ❌         | 使用 `@life-os/finance-enrichment-contract`         |
| Music   | ✅ P1A/B/C | JSDoc nav/feedback/sync + `createI18n` + `AppBrand` |

## Dependency direction

- `@life-os/contracts` 的 `.d.ts` 模块 **不依赖** 任何 workspace 包；`events.ts` 仅依赖 `zod`。
- Enforced by `npm run check:lifeos-boundaries`.

## Install (monorepo)

```json
{
  "dependencies": {
    "@life-os/contracts": "*"
  }
}
```

Run `npm install` at the monorepo root.
