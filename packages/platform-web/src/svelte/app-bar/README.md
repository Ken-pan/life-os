# LifeOsAppBar

`LifeOsAppBar` owns the shared app-bar skeleton every Life OS app used to
hand-write: `header.appbar > .appbar-inner > .appbar-leading / .appbar-titles /
.appbar-trailing`. Apps keep a thin local `AppBar.svelte` wrapper that injects
app-owned content (brand, bug-report button, i18n labels) through snippets.

Like the app shell, the component is generic: no app IDs, routes, or domain
flags. Styling stays in `@life-os/theme` (`shell.css`); this component only
guarantees the markup contract those selectors target.

## API

- `leading` snippet — rendered inside `.appbar-leading` when there is no back
  affordance; typically `<AppBrand appId="…" variant="appbar" />`.
- `backHref` / `backLabel` — renders the default back link (chevron + label) in
  the leading region and sets the `appbar--back` modifier.
- `onBack` — renders a back `<button>` instead of a link (history-back flows);
  takes precedence over `backHref`.
- `title` / `subtitle` — default `.appbar-titles` block (`h1.page-title` +
  `p.page-sub`), rendered only when `title` is set.
- `titles` snippet — replaces the default titles block entirely; the snippet
  owns its wrapper markup (e.g. Music's `.appbar-center`, Planner's list-menu
  titles).
- `trailing` snippet — rendered inside the always-present `.appbar-trailing`.
- `hidden` — skips rendering the header.
- `barClass` — app-owned public classes forwarded to the `header.appbar` root
  (e.g. `music-appbar`, conditional `appbar--tools` / `appbar--list-menu`
  modifiers).
