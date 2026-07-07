# Life OS Docs

This folder is the canonical documentation index for the Life OS monorepo.

## Start here

| Doc | Purpose |
| --- | --- |
| [`CANONICAL.md`](./CANONICAL.md) | Source-of-truth repo and archived legacy repos |
| [`NETLIFY.md`](./NETLIFY.md) | Four-site Netlify deploy matrix and CLI caveats |
| [`INPUT_IME.md`](./INPUT_IME.md) | CJK IME guard rules for search and Enter-to-submit inputs |
| [`CURSOR_PAGE_BRIDGE.md`](./CURSOR_PAGE_BRIDGE.md) | Web State DevTools / Cursor page bridge overview |
| [`LEGACY_LOCAL.md`](./LEGACY_LOCAL.md) | Removed local sibling repo paths |

## Shared platform P0 / P1 pilot

These docs replace the earlier read-only shared-system audit exports. P0 is conservative: docs, package scaffold, contracts, adapter signatures, and boundary guard only. P1 has started with Planner and Fitness pilots. No shared UI package, no Swift/Xcode, no Supabase changes, and no four-app migration.

| Doc | Purpose |
| --- | --- |
| [`LIFEOS_SHARED_BOUNDARIES.md`](./LIFEOS_SHARED_BOUNDARIES.md) | Package boundaries, dependency direction, do-not-abstract list |
| [`LIFEOS_CONTRACTS_P0.md`](./LIFEOS_CONTRACTS_P0.md) | P0 contracts whitelist and type source of truth |
| [`LIFEOS_NATIVE_READINESS.md`](./LIFEOS_NATIVE_READINESS.md) | Future iOS readiness matrix and docs-only native types |
| [`LIFEOS_P0_PR_PLAN.md`](./LIFEOS_P0_PR_PLAN.md) | PR 1-4 implementation plan and acceptance criteria |
| [`LIFEOS_UI_CONTRACTS.md`](./LIFEOS_UI_CONTRACTS.md) | Web presentation map for cross-surface contracts |
| [`LIFEOS_P1_PREP.md`](./LIFEOS_P1_PREP.md) | First app pilot status, scope, guardrails, validation gates |

## Package docs

| Package | Doc |
| --- | --- |
| `@life-os/contracts` | [`../packages/contracts/README.md`](../packages/contracts/README.md) — type-only contracts; Planner/Fitness P1 pilot consumers |
| `@life-os/platform-web` | [`../packages/platform-web/README.md`](../packages/platform-web/README.md) — web adapters; Planner/Fitness P1 metadata pilots |
| `@life-os/finance-enrichment-contract` | [`../packages/finance-enrichment-contract/README.md`](../packages/finance-enrichment-contract/README.md) — Finance purchase-enrichment UI/read-model parity rules |
| `@life-os/theme` | [`../packages/theme/README.md`](../packages/theme/README.md), [`../packages/theme/DESIGN_SYSTEM.md`](../packages/theme/DESIGN_SYSTEM.md) |
| `@life-os/sync` | [`../packages/sync/README.md`](../packages/sync/README.md) |

Boundary guard: `npm run check:lifeos-boundaries` (see [`LIFEOS_SHARED_BOUNDARIES.md`](./LIFEOS_SHARED_BOUNDARIES.md)).

## App docs

App-specific architecture, IA, audits, QA reports, and generated exports live under each app:

- [`../apps/planner/README.md`](../apps/planner/README.md)
- [`../apps/fitness/README.md`](../apps/fitness/README.md)
- [`../apps/finance/README.md`](../apps/finance/README.md)
- [`../apps/music/README.md`](../apps/music/README.md)

Generated QA screenshots, export bundles, and historical audit packs under `apps/*/docs`, `apps/*/.qa-screenshots`, or `apps/*/exports` are app-owned evidence. Do not treat them as canonical shared-platform planning docs.
