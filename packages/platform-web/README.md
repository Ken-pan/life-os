# @life-os/platform-web

Life OS **web-only** platform layer — browser runtime adapters that connect cross-surface contracts to DOM, CSS, and storage APIs.

## P0 status

This package contains thin web-only adapters. P0 PR 3 adds appearance and page-metadata adapters. P0 PR 4 adds contracts only; presentation adapters are P1+ candidates. It does **not** migrate app imports and does **not** move existing runtime code out of `@life-os/theme`.

| Phase | Scope |
| --- | --- |
| **P0 PR 3** | Appearance and page-metadata web adapters (theme preference store, document meta helpers) |
| **P0 PR 4** | Contracts for nav, feedback, sync error banner, and related UI models |
| **P1+** | Optional presentation adapters after the first app pilot proves the shape |

**No app imports this package in P0.**

## P1 pilot status

`planner-os` and `fitness-os` are the current pilot consumers. They use
`applyDocumentMetaWeb` from `DocumentHead.svelte` while preserving the existing
SSR/static `<svelte:head>` output. Sync error presentation mappings stay local
to each app; P1 does not move `SyncErrorBanner`, settings UI, or app-owned state
into this package.

See [`../../docs/LIFEOS_SHARED_BOUNDARIES.md`](../../docs/LIFEOS_SHARED_BOUNDARIES.md) and [`../../docs/LIFEOS_UI_CONTRACTS.md`](../../docs/LIFEOS_UI_CONTRACTS.md).

## Allowed dependencies

| Package | Role |
| --- | --- |
| `@life-os/contracts` | Cross-surface product types (`import type` only) |
| `@life-os/theme` | Web CSS tokens and existing theme runtime helpers |

Must **not** depend on `@life-os/domain`, `@life-os/ui-*`, or any `apps/*` code. Enforced by `npm run check:lifeos-boundaries`.

## Install (monorepo)

```json
{
  "dependencies": {
    "@life-os/platform-web": "*"
  }
}
```

Run `npm install` at the monorepo root.
