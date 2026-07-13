# Life OS App Shell contract (PLAT-P0-1)

`LifeOsAppShell` is the first reusable layer for a future Life OS app
generator. It proves shell reuse with Fitness; it is not an app manifest or a
generator.

## Current-state map before migration

| Concern | Previous owner | DOM / CSS | Behavior | Migration risk |
| --- | --- | --- | --- | --- |
| Primary scroll | theme | `.main-wrap > #main-content` | document scroll in mobile browser; main scroll in standalone | high |
| Document/body scroll | theme | `html`, `body`, `.standalone-pwa` | body scroll in browser; viewport lock in PWA | high |
| Safe-area top | theme | `.appbar-inner`, `.sidebar` | header/sidebar consume top inset | high |
| Safe-area bottom | theme | `.nav`, `.bottom-shell` | mobile navigation consumes bottom inset | high |
| Desktop navigation | Fitness + theme | `SideNav`, `.sidebar` | persistent at ≥840px | medium |
| Mobile navigation | Fitness + theme | `BottomNav`, `.nav` | fixed at ≤839px | high |
| AppBar | Fitness + theme | `AppBar`, `.appbar` | route-owned content and visibility; sticky chrome | medium |
| TimerWidget | Fitness | `.tw` | fixed above mobile nav; fixed near desktop bottom | high |
| Modal scroll lock | theme + Fitness overlays | `lockScroll()`, `.sheet-bg`, `.modal-bg.show` | body-fixed in browser; main overflow lock in PWA | medium |
| PortraitGate | platform-web + theme | `.life-os-portrait-gate` | fixed modal layer with safe-area padding | low |
| Skip/main semantics | Fitness | `.skip-link`, `#main-content` | native skip target; no route focus policy | medium |
| Responsive breakpoint | theme | `--life-os-mobile`, `--life-os-desktop` | 839/840px projection boundary | low |
| Route focus | none | n/a | focus preserved implicitly | medium |
| Layer ordering | theme + Fitness | nav ~30, timer 200, sheets 350, gate 10000 | transient overlays cover persistent chrome | medium |

## Shared API and ownership

The shell accepts app-provided `header`, `navigation(projection)`, `main`,
`persistentOverlay`, and `transientOverlay` snippets. Optional props control
scroll mode, route focus, main semantics, skip-link copy, and stable test IDs.

The shell owns the viewport contract, main scroll root, responsive projection,
semantic landmark and skip link, guarded route focus, safe-area chrome
placement, and measured persistent-overlay clearance. Apps own all component
markup, routes, active-route resolution, domain state, and overlay behavior.

The projection value is generic (`desktop` or `mobile`); the shell contains no
app IDs, route logic, or navigation content.

## Fitness CSS ownership audit

| Changed rule | Classification | Reason |
| --- | --- | --- |
| `.skip-link`, `.skip-link:focus-visible` | `MOVED_TO_SHARED_SHELL` | skip semantics and focus presentation are platform behavior |
| desktop `body { padding-bottom: 0 }` | `DUPLICATE_SAFE_TO_REMOVE` | the content-scroll shell no longer uses body padding for chrome clearance |
| desktop `.app-shell` flex/min-height/width | `MOVED_TO_SHARED_SHELL` | viewport structure is now shell-owned |
| desktop `.sidebar { display: flex !important }` | `DUPLICATE_SAFE_TO_REMOVE` | shared breakpoint projection owns visibility |
| `.tw` visual and fixed-position rules | `STILL_FITNESS_OWNED` | TimerWidget markup and behavior remain domain composition |
| `.toast` desktop offset | `STILL_FITNESS_OWNED` | app notification presentation is unchanged |
| focus-view safe-area rules | `LEGACY_BUT_NOT_THIS_TICKET` | immersive domain page behavior is explicitly out of scope |
| sheet/modal safe-area rules | `STILL_FITNESS_OWNED` | transient overlay content remains app-owned |

No shared shell internal selector is overridden by Fitness. Legacy theme
selectors remain available for apps not yet migrated.

## Validation fixture

The design catalog App Shell fixture includes long content, desktop and mobile
navigation, a measured persistent overlay, safe-area simulation, empty optional
regions, skip-link focus, route-focus simulation, and a marked final-content
target. Playwright asserts the scroll-root contract and obstruction clearance at
desktop, 393×852, and 430×932 viewports.
