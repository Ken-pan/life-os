# LifeOS P1 Prep

> First app pilot after P0. This document records the current pilot status,
> scope, guardrails, and validation gates.

---

## Current status

As of 2026-07-07, the Planner and Fitness pilots remain within P1 scope.

| App | P1A — type-only pilot | P1B — metadata adapter pilot | P1C — sync error presentation model |
| --- | --- | --- | --- |
| Planner | **Done** — JSDoc typedefs for `PageMetadata`, `ColorSchemePreference`, and `ThemePreferenceModel` | **Done** — `DocumentHead.svelte` routes one metadata path through `applyDocumentMetaWeb` while keeping `<svelte:head>` | **Done** — local `syncErrorPresentation.js` maps existing sync error state to `SyncErrorPresentation` |
| Fitness | **Done** — JSDoc typedefs for `PageMetadata`, `ColorSchemePreference`, and `ThemePreferenceModel` | **Done** — `DocumentHead.svelte` routes one metadata path through `applyDocumentMetaWeb` while keeping `<svelte:head>` | **Done** — local `syncErrorPresentation.js` maps existing sync error state to `SyncErrorPresentation` |

Planner and Fitness are the only apps allowed to consume `@life-os/contracts`
and `@life-os/platform-web` in P1. Finance and Music stay on their existing
app-owned components and state until a follow-up is approved.

Validation completed for the current state:

- `npm run check`
- `npm run build`
- `npm run check:lifeos-boundaries`
- `node scripts/check-lifeos-boundaries.mjs --self-test`
- `npm run test -w @life-os/platform-web`
- `npm run test -w planner-os -- src/lib/syncErrorPresentation.test.js`
- `node apps/fitness/scripts/sync-error-presentation-check.mjs`
- `npm run test -w finance-os -- src/engine/purchaseEnrichmentDisplay.test.ts`
- `node packages/finance-enrichment-contract/scripts/test-contract.mjs`
- `npm run check -w planner-os`
- `npm run build:planner`
- `npm run check -w fitness-os`
- `npm run build:fitness`
- `npm run build:finance`

---

## Goal

Prove that P0 contracts and `@life-os/platform-web` can be consumed by one existing web app without changing user-visible behavior or forcing a four-app migration.

P1 is intentionally narrow:

- opt-in app pilots only
- type-only imports first
- optional thin adapter after checks pass
- no shared UI package
- no native implementation
- no Supabase or schema changes

---

## Recommended pilot

| Candidate | Recommendation | Rationale |
| --- | --- | --- |
| Planner | **First** | Mature Svelte app, clear page metadata, representative settings/theme usage, lower domain coupling than Finance/Music |
| Fitness | Second | Similar Svelte surface and SyncErrorBanner shape; useful follow-up after Planner proves the path |
| Finance | Later | TypeScript-heavy and has active purchase/order work in the tree; avoid mixing with shared-platform pilot |
| Music | Later | Player, ambience, and media-specific state make it a poor first proof |

Pilot order: **Planner first, Fitness second**.

---

## P1A — type-only pilot

Allowed:

- import `PageMetadata` from `@life-os/contracts/meta`
- import `ThemePreferenceModel` or `ColorSchemePreference` from `@life-os/contracts/appearance`
- use JSDoc `@typedef` in JS/Svelte where runtime imports are not needed
- keep existing markup and behavior unchanged

Not allowed:

- value-import from `@life-os/contracts`
- deleting app-owned components
- changing storage keys or stored values
- introducing `@life-os/ui-svelte`

Validation:

- `npm run check:lifeos-boundaries`
- `npm run check -w planner-os`
- planner production build if any runtime path changes

Current implementation:

- `apps/planner/src/lib/components/DocumentHead.svelte` mirrors `PageMetadata`.
- `apps/planner/src/lib/types.js` documents the existing web runtime `auto` theme value against contracts `ColorSchemePreference`.
- `apps/planner/src/lib/state.svelte.js` mirrors `ThemePreferenceModel` for the existing planner appearance state shape.
- `apps/fitness/src/lib/components/DocumentHead.svelte` mirrors `PageMetadata`.
- `apps/fitness/src/lib/state.svelte.js` mirrors `ColorSchemePreference` and `ThemePreferenceModel`; existing storage still uses web runtime `auto`.

---

## P1B — metadata adapter pilot

Only after P1A passes, optionally route one existing Planner metadata path through `applyDocumentMetaWeb`.

Guardrails:

- keep the existing `DocumentHead` public API stable
- no layout or route behavior changes
- no app-wide metadata rewrite
- no cross-app abstraction

Validation:

- `npm run test -w @life-os/platform-web`
- `npm run check -w planner-os`
- `npm run build:planner`

Current implementation:

- Planner and Fitness `DocumentHead.svelte` call `applyDocumentMetaWeb(pageMetadata, { pathname, imagePath })`.
- Existing `<svelte:head>` output remains in place for SSR/static output in both apps.
- No route, layout, storage, or settings behavior was changed.

---

## P1C — sync error presentation model

After metadata is stable, define local app adapters that map the existing sync error state to `SyncErrorPresentation`.

Guardrails:

- component markup remains app-owned
- `SyncErrorBanner` is not moved to a shared package
- retry/dismiss actions map to `UserAction.intent`
- no transport or merge changes in `@life-os/sync`

Validation:

- `npm run check:lifeos-boundaries`
- `npm run check -w planner-os`
- targeted component tests if Planner has coverage for the touched path

Current implementation:

- `apps/planner/src/lib/syncErrorPresentation.js` creates a `SyncErrorPresentation` from the existing sync error reason.
- `apps/fitness/src/lib/syncErrorPresentation.js` creates a `SyncErrorPresentation` from the existing sync error reason.
- `dismissAction` maps to `UserAction.intent === 'dismiss'`.
- No retry action is exposed because the existing banners have no retry behavior.
- Planner and Fitness `SyncErrorBanner.svelte` still own DOM and local dismiss state.
- `@life-os/sync` transport/merge behavior is unchanged.

## Finance enrichment contract note

`@life-os/finance-enrichment-contract` is a Finance-owned parity package for
purchase-enrichment display classification shared by the Finance UI and the
web-state read-model builder. It is not part of the P1 shared-platform pilot,
does not expose cross-surface LifeOS product contracts, and does not allow
Finance to consume `@life-os/contracts` or `@life-os/platform-web`.

---

## Explicitly out of scope

- Settings/MoreSheet shared component migration
- `@life-os/ui-svelte` or `@life-os/ui-react`
- `@life-os/domain`
- Swift, Xcode, LifeOSKit
- Supabase migrations, RLS, RPC, or sync transport changes
- four-app mechanical import rewrites

---

## Rollback

P1 must remain easy to revert:

1. Remove pilot app type imports and local adapter usage.
2. Keep P0 packages and docs intact.
3. Re-run boundary guard and the pilot app check.

If rollback requires deleting shared packages or changing app data, the P1 scope was too broad.

---

## Decision gate

Move beyond P1 only when all are true:

- one app consumes contracts without runtime import mistakes
- app behavior and build output remain stable
- no shared package depends on app code
- reviewer agrees the model improves clarity over app-local types

Until then, keep non-pilot apps on their existing app-owned components and state.
