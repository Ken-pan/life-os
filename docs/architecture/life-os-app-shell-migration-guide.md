# Life OS AppShell migration guide (PLAT.SHELL.3)

How to migrate a Life OS web app onto the frozen `LifeOsAppShell` v1 contract
([`life-os-app-shell.md`](./life-os-app-shell.md)). Distilled from the Fitness
(PLAT.SHELL.1) and Home (PLAT.SHELL.2) migrations.

## When to migrate

Migrate when an app still assembles its own outer shell DOM (viewport grid,
scroll root, skip link, sidebar/bottom-nav placement, safe-area chrome) in
`+layout.svelte`. Do **not** migrate to chase CSS cleanup alone; the payoff is
one shared viewport/scroll/safe-area/focus contract across apps.

## Step 0 — Pre-migration concern map

Before touching code, fill this table for the app (copy from the Home
validation doc for a worked example). Anything scored High needs an explicit
plan in the PR description.

| Concern | Current owner | Current behavior | Shell equivalent | Risk |
| --- | --- | --- | --- | --- |
| Outer DOM · body/main scroll · page workspace · safe area (top/bottom) · desktop nav · mobile nav · AppBar · immersive/locked states · settings/long pages · modal layering · route focus · PortraitGate · loading/error/auth · content bottom spacing · persistent overlays · transient overlays | … | … | … | … |

## Step 1 — Choose `scrollMode` per route state

- `content` (default): `<main>` is the single page scroll root. Right for
  almost every route.
- `locked`: bounded canvases/editors/maps — viewport stays mounted, page-main
  scrolling disabled, dialogs keep their own scrolling.
- `document`: launcher/spatial pilots only. **Never** select it just to
  preserve legacy CSS.

The app switches modes from app state (e.g. Home compact Plan edit → `locked`);
the shell never learns route names.

## Step 2 — Compose the shell

In `+layout.svelte`, replace the hand-rolled outer DOM with:

```svelte
<LifeOsAppShell
  scrollMode={mode}
  navigationKey={$page.url.pathname}
  focusOnNavigate="main"
  mainLabel="…"
  mainClass={publicPageClasses}
  skipLinkLabel="…"
  testIdPrefix="myapp"
>
  {#snippet header()}<AppBar … />{/snippet}
  {#snippet navigation(projection)}
    {#if projection === 'desktop'}<SideNav … />{:else}<BottomNav … />{/if}
  {/snippet}
  {#snippet main()}{@render children()}{/snippet}
  {#snippet persistentOverlay()}<!-- e.g. TimerWidget -->{/snippet}
  {#snippet transientOverlay()}<Toast … /><PortraitGate … />{/snippet}
</LifeOsAppShell>
```

The app keeps ownership of all component markup, routes, active-route
resolution, domain state, and overlay behavior.

## Step 3 — Delete duplicated shell DOM and CSS

Classify every outer-layout rule you touch:

| Classification | Action |
| --- | --- |
| `MOVED_TO_SHARED_SHELL` | Delete from app; shell owns it now |
| `DUPLICATE_SAFE_TO_REMOVE` | Delete |
| `STILL_APP_OWNED` | Keep (component presentation, toasts, sheets) |
| `DOMAIN_LAYOUT` | Keep (page/canvas composition; retarget via `mainClass` if needed) |
| `LEGACY_KEEP_OUT_OF_SCOPE` | Leave for non-migrated apps |
| `INTERNAL_OVERRIDE_BLOCKER` | **Must be zero** — never style shell internals |

Record the table in the app's validation doc.

## Step 4 — Known pitfalls (both migrations hit these)

- **Double scroll root** during migration: theme body scroll + shell main
  scroll. Remove the app-side root the same commit the shell lands.
- **Safe-area consumed twice**: shared chrome (AppBar/nav) already applies
  insets; app workspaces only pad their own domain canvas.
- **Bottom-nav clearance**: long content must clear mobile nav via app-owned
  page padding, not body padding.
- **Locked mode + dialogs**: transient surfaces must keep independent
  scrolling; verify with the body observer test.
- **Deep selectors into AppShell internals** are a review blocker.

## Step 5 — Validation checklist

All must pass before merge (record exit codes in the validation doc):

```bash
npm test --workspace=@life-os/platform-web       # shell unit suite
npm run check --workspace=<app>                  # 0 errors
npm run build --workspace=<app>
PWA_APP=<app> npx playwright test tests/pwa/<app>-app-shell.spec.ts   # copy fitness spec
npm run test:viewport --workspace=<app>          # if the app has one
npm run test:design-catalog                      # AppShell showcases unaffected
npm run check:lifeos-boundaries
npm run check && npm run build                   # whole monorepo
```

Also re-run the previously migrated apps' `<app>-app-shell.spec.ts` to prove no
cross-app regression.

## Step 6 — Record the validation doc

Create `docs/architecture/life-os-app-shell-<app>-validation.md` with: concern
map results, API fit table (`USED_AS_DESIGNED` / `NOT_NEEDED_BY_<APP>` /
`INSUFFICIENT_GENERIC_API`), CSS ownership table, validation record, and the
0–5 stability gate. Any `INSUFFICIENT_GENERIC_API` finding requires an
**additive, generic** shell change (see freeze policy) — never an app flag.
