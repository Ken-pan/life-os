# @life-os/contracts

Life OS **cross-surface** product contracts — data shapes, state enums, and user-visible capability semantics with no DOM, CSS, or browser APIs.

## P0 status

This package is **type-only**. P0 PR 3 defines appearance and metadata contracts; PR 4 defines nav, feedback, sync presentation, and content contracts.

| PR | Adds |
| --- | --- |
| **PR 3** | `@life-os/contracts/appearance` and `@life-os/contracts/meta` |
| **PR 4** | `@life-os/contracts/nav`, `@life-os/contracts/content`, `@life-os/contracts/sync`, `@life-os/contracts/feedback` |

See [`../../docs/LIFEOS_CONTRACTS_P0.md`](../../docs/LIFEOS_CONTRACTS_P0.md) for the P0 export whitelist and [`../../docs/LIFEOS_SHARED_BOUNDARIES.md`](../../docs/LIFEOS_SHARED_BOUNDARIES.md) for dependency rules.

## Type-only consumption (required)

`@life-os/contracts` ships **`.d.ts` only** — no runtime JavaScript implementation.

| Consumer | Allowed | Forbidden |
| --- | --- | --- |
| TypeScript | `import type { … } from '@life-os/contracts/…'` | `import { … }`, `import * as …`, `require(…)` |
| TypeScript | `export type { … } from '@life-os/contracts/…'` | `export { … } from '@life-os/contracts/…'` |
| JavaScript / Svelte | JSDoc mirror: `/** @typedef {import('@life-os/contracts/…').SomeType} SomeType */` | Runtime value imports from `@life-os/contracts` |

**Runtime value imports from `@life-os/contracts` are forbidden.** Use `@life-os/platform-web` for browser adapters (PR 3+).

## Dependency direction

- `@life-os/contracts` depends on **nothing** (no `@life-os/theme`, `@life-os/sync`, apps, or other workspace packages).
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

P1 pilot status: `planner-os` and `fitness-os` may consume this package through JSDoc type mirrors only. Other apps should not consume contracts until their own pilot step is approved.
