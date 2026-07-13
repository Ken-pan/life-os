# PLAT-P0-2 — Home AppShell validation

## Verdict

`API_READY_FOR_FREEZE`. Home and Fitness use the same `LifeOsAppShell` contract.
The Home migration required two semantic additions: generic `scrollMode="locked"`
for bounded workspaces and `mainClass` for app-owned main-landmark composition.
Neither addition contains Home route names, domain knowledge, app flags, private
selector exposure, or a new shell DOM type.

## Pre-migration concern map

| Concern | Current Home owner | Current behavior | Fitness Shell equivalent | Risk |
| --- | --- | --- | --- | --- |
| Outer DOM | `+layout.svelte` | App shell, tint strips, sidebar, main column, main, and bottom nav assembled directly | Shell viewport grid and regions | Medium: duplicated ownership |
| Body/main scroll | Theme shell CSS + Home `.wrap` | Main workspace is the intended content scroll root | `scrollMode="content"` | High: double-scroll during migration |
| Page workspace | Home `.wrap` | Home content width, padding, and Plan flex layout | App content in Shell main region | Medium |
| Safe area | Theme tokens + AppBar/nav + Plan CSS | Header/nav consume chrome insets; Plan owns canvas insets | Shared Shell chrome composition | High: must not consume twice |
| Desktop sidebar | `SideNav.svelte` | App-owned navigation schema and branding | `navigation('desktop')` | Low |
| Mobile bottom navigation | `BottomNav.svelte` | App-owned items; hidden during compact Plan edit | `navigation('mobile')` | Medium: final-row obstruction |
| AppBar | `AppBar.svelte` + layout metadata | App-owned title/brand; absent on `/plan` | `header` snippet | Low |
| Plan immersive/locked mode | Plan store + Plan page + layout | Compact edit hides nav and locks the bounded editor workspace | No PR #31 equivalent | High: requires generic locked mode |
| Settings page | Home settings route | Long content in normal content mode | Shell main scroll surface | Medium |
| Modal/dialog layering | Plan components + platform feedback | Dialogs layer above the shell and retain their own scrolling | `transientOverlay` + body observer | High in locked mode |
| Route-change focus | Home skip link only | Main landmark exists; no shared guarded focus | Shell `navigationKey` + `focusOnNavigate` | Medium |
| PortraitGate | Home settings + layout | Optional app setting composes the shared gate | `transientOverlay` | Low |
| Loading/error/auth states | SvelteKit + Home auth state | No dedicated Home loading/error layout; auth/settings state stays page-owned | Shell main slot | Low |
| Content bottom spacing | Home `.wrap` + theme nav tokens | Long content clears fixed/mobile nav | Shell main plus app-owned page padding | High |
| Persistent overlays | None | No persistent Home obstruction | Empty `persistentOverlay` region | Low |
| Transient overlays | Toast, PortraitGate, Plan/help dialogs | Do not reserve page space | `transientOverlay` | Medium |

## API fit assessment

| Prop or snippet | Assessment | Home use |
| --- | --- | --- |
| `header` | `USED_AS_DESIGNED` | App-owned `AppBar`; Home decides when it is absent |
| `navigation(projection)` | `USED_AS_DESIGNED` | App-owned `SideNav` and `BottomNav` |
| `main` | `USED_AS_DESIGNED` | Route content |
| `children` | `NOT_NEEDED_BY_HOME` | Home uses the explicit `main` snippet |
| `persistentOverlay` | `NOT_NEEDED_BY_HOME` | Empty region verifies optional composition |
| `transientOverlay` | `USED_AS_DESIGNED` | Toast and optional PortraitGate |
| `scrollMode="content"` | `USED_AS_DESIGNED` | Normal Home routes and Plan browse mode |
| `scrollMode="document"` | `NOT_NEEDED_BY_HOME` | Home has one bounded app viewport |
| `scrollMode="locked"` | `INSUFFICIENT_GENERIC_API` in PR #31; now `USED_AS_DESIGNED` | Compact Plan edit without route knowledge in platform-web |
| `navigationKey` | `USED_AS_DESIGNED` | Home pathname remains app-owned |
| `focusOnNavigate` | `USED_AS_DESIGNED` | Guarded main focus after route changes |
| `mainId` | `NOT_NEEDED_BY_HOME` | Default `main-content` preserves existing target |
| `mainLabel` | `USED_AS_DESIGNED` | HOME.OS main landmark label |
| `mainClass` | `INSUFFICIENT_GENERIC_API` in PR #31; now `USED_AS_DESIGNED` | Public Home `.wrap`/Plan composition classes; no private Shell selector |
| `skipLinkLabel` | `USED_AS_DESIGNED` | Preserves Chinese copy |
| `testIdPrefix` | `USED_AS_DESIGNED` | Cross-app browser contract |

No PR #31 prop is Fitness-specific, should be removed, or leaks a Fitness route
or domain concept. The generic additions are useful to a future map, canvas,
reader, or editor app. Safe-area ownership remains shared chrome plus app-owned
domain workspace padding; it is not consumed twice.

## CSS ownership

| CSS concern | Classification | Result |
| --- | --- | --- |
| Home `.skip-link` | `DUPLICATE_SAFE_TO_REMOVE` / `MOVED_TO_SHARED_SHELL` | Removed |
| Outer shell viewport/grid/scroll root | `MOVED_TO_SHARED_SHELL` | Removed from Home layout composition |
| AppBar and nav presentation | `STILL_HOME_OWNED` | Preserved |
| `.wrap` page width and normal bottom clearance | `STILL_HOME_OWNED` | Preserved |
| Plan flex height, canvas padding, and safe-area inset | `DOMAIN_LAYOUT` | Preserved |
| Plan immersive selection-bar offsets | `DOMAIN_LAYOUT` | Retargeted to Home's public main class |
| Theme legacy shell compatibility selectors | `LEGACY_KEEP_OUT_OF_SCOPE` | Unchanged |
| Deep selectors into AppShell internals | `INTERNAL_OVERRIDE_BLOCKER` | None found |

## Cross-app comparison

| Dimension | Fitness | Home | Same shared behavior | App-owned difference |
| --- | --- | --- | --- | --- |
| Scroll | Content main; modal lock | Content main; Plan locked mode | One Shell main scroll surface | Home selects locked for compact editor |
| Safe area | AppBar/nav and overlay inset | AppBar/nav and Plan workspace inset | Shared chrome placement | Plan canvas owns domain padding |
| Responsive navigation | Sidebar/mobile tab bar snippets | SideNav/BottomNav snippets | Shell chooses desktop/mobile projection at 840px | Items and markup |
| AppBar composition | Fitness AppBar | Home AppBar, omitted on Plan | Header snippet | Copy and route-local visibility |
| Bottom navigation | Fitness mobile component | Home mobile component | Shared bottom region | Home hides it during immersive edit |
| Persistent overlay | TimerWidget | None | Optional Shell region and obstruction spacer | Fitness provides an obstruction |
| Locked mode | Modal observer only | Generic `scrollMode="locked"` | Shell owns main overflow | Home chooses mode from app state |
| Focus | Route-key guarded focus | Route-key guarded focus | Same Shell behavior | Navigation schema |
| PWA behavior | Shared bounded viewport | Shared bounded viewport | Safe-area chrome and one scroll root | PortraitGate setting/content |
| CSS glue | Fitness page/overlay styles | Home `.wrap` and Plan domain layout | No private Shell overrides | Domain layout only |

Line accounting relative to PR #31 HEAD:

- Shared Shell implementation/type CSS: 11 additions, 3 deletions; documentation:
  8 additions in the component README and 5 in the architecture contract.
- Home outer layout/CSS: 43 additions, 47 deletions. The old duplicated shell
  markup and skip-link CSS account for the removals.
- Home shell composition glue: 46 lines (the app-local `mainClass` derivation
  plus the Shell invocation/snippets). Remaining Plan CSS is domain layout, not
  Shell glue.

The API gained semantic range rather than app-specific complexity: one new
scroll state and one public class-forwarding composition hook.

## Validation record

| Command | Exit | Result |
| --- | ---: | --- |
| `npm test --workspace=@life-os/platform-web` | 0 | Platform tests passed; AppShell unit suite passed |
| `npm run check --workspace=home-os` | 0 | 0 errors, 0 warnings |
| `npm run build --workspace=home-os` | 0 | Production build passed; one pre-existing platform feedback warning |
| `PWA_APP=home npx playwright test tests/pwa/home-app-shell.spec.ts` | 0 | 7 passed |
| `npm run test:viewport --workspace=home-os` | 0 | 49 passed, 0 failed |
| `npm run test:plan-edit --workspace=home-os` | 1 | Existing stale selector: base script requests nonexistent `删墙` button |
| `npm run check --workspace=fitness-os` | 0 | 0 errors; 8 pre-existing warnings |
| `npm run build --workspace=fitness-os` | 0 | Production build passed with pre-existing warnings |
| `PWA_APP=fitness npx playwright test tests/pwa/fitness-app-shell.spec.ts` | 0 | 7 passed |
| `PWA_APP=home npm run pwa:healthcheck` | 0 | Infrastructure passed; Home remains excluded from the default PWA app matrix |
| Targeted design-catalog AppShell smoke | 0 | 9 passed, 1 mobile-only skip |
| Targeted design-catalog AppShell a11y | 0 | 1 passed |
| Targeted design-catalog AppShell snapshots | 0 | 2 passed; no baseline update |
| `npm run test:design-catalog` | 0 | 181 passed, 1 skip |
| `npm run test:design-catalog:a11y` | 0 | 48 passed |
| `npm run check` | 0 | 6 check tasks passed; only existing warnings |
| `npm run check:lifeos-boundaries` | 0 | Passed |
| `npm run build` | 0 | 8 build tasks passed |
| `git diff --check` | 0 | Passed |

The known full snapshot baseline (66 passing and 16 unrelated one-pixel
failures) was not rewritten. The two relevant AppShell snapshots pass unchanged.

The failed Plan edit command is not caused by this migration: both the script's
`删墙` lookup and the absence of such a button in `PlanEditToolbar.svelte` are
identical at `9fbcdd77ee19eb93c195cd6c7d6d8dbdd8815f71`. The ticket does not change
Plan route logic, components, data, storage, auth, sync, or schema.

## Stability gate

| Dimension | Score (0–5) |
| --- | ---: |
| Cross-app semantic stability | 5 |
| Absence of app-specific flags | 5 |
| Scroll/safe-area reliability | 5 |
| Composition flexibility | 5 |
| Fitness compatibility | 5 |
| Home compatibility | 5 |
| Test coverage | 5 |
| Third-app readiness | 4 |

Total: **39/40**. The third-app score remains 4 until a third production app
uses the frozen contract; it does not justify another API redesign.

## Roadmap recommendation

Proceed next with `PLAT-P0-3 — Freeze AppShell contract and document migration
guide`, followed by the already planned P1/P2/P3 sequence. Do not begin the
starter template, Reading OS, generator, or AppManifest work in this ticket.
