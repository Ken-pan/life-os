# LifeOsAppShell

`LifeOsAppShell` is the reusable web shell boundary for Life OS apps. It owns:

- the viewport-height outer structure and single primary content scroll root;
- desktop/mobile navigation placement at the shared theme breakpoint;
- skip-link and `<main>` semantics;
- safe-area chrome placement through the shared theme primitives;
- persistent-overlay obstruction space and transient-overlay ordering hooks;
- optional, guarded main-focus behavior after navigation.

Apps continue to own route definitions, active-route resolution, navigation
markup, headers, overlays, domain state, and all page content.

## API

The `navigation` snippet receives either `desktop` or `mobile`; the app chooses
which app-owned navigation component to render for that generic projection.
`main` is the preferred content snippet (`children` is accepted for ordinary
Svelte composition). `header`, `persistentOverlay`, and `transientOverlay` are
optional snippets.

`scrollMode="content"` is the default and makes `<main>` the primary scroll
root. `scrollMode="document"` is reserved for launcher/spatial pilots that need
document flow and should not be selected simply to preserve legacy CSS.
`scrollMode="locked"` keeps the viewport shell mounted while preventing page
main scrolling; it is intended for bounded canvases, editors, maps, and similar
workspaces. Dialogs and other independently scrolling transient surfaces remain
usable.

`mainClass` forwards app-owned public layout classes to the semantic `<main>`.
It is for page composition such as a reading wrapper or bounded workspace, not
for targeting private AppShell selectors.

`focusOnNavigate="main"` focuses the main landmark when `navigationKey`
changes, except while focus is in a form or dialog. The default is `preserve`.

Stable public hooks are the `data-testid` values derived from `testIdPrefix`:
the shell itself, `-header`, `-navigation-desktop`, `-navigation-mobile`,
`-main`, `-persistent-overlay`, and `-transient-overlay`. Internal classes are
not a public API.
