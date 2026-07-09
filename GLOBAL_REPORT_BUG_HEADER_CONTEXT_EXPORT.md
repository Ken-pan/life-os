# Global Header Context Export: Report Bug Trigger MVP

This document exports the relevant codebase context, architecture comparisons, UX placements, and implementation boundaries for adding a global "Report Bug" icon to the top-right header/action area of all PWA apps in the **LifeOS** monorepo.

---

## 1. App Shell / Header Structure

Each application maintains its own local layouts and header components rather than sharing a single unified header package.

* **portal**: Uses [PortalAppBar.svelte](file:///Users/kenpan/「Projects」/life-os/apps/portal/src/lib/components/PortalAppBar.svelte).
  * *Sharing*: Duplicated per app.
  * *Trailing Action Area*: Renders inside `<div class="appbar-trailing">`.
  * *Existing Action Order*: Bell (Inbox/Events) → Search button (Command Palette) → Cycle Theme → User Avatar chip → Log Out → Ellipsis Sheet trigger.
  * *APIs*: No shared slots/props.
* **planner**: Uses [AppBar.svelte](file:///Users/kenpan/「Projects」/life-os/apps/planner/src/lib/components/AppBar.svelte).
  * *Sharing*: Duplicated per app.
  * *Trailing Action Area*: Renders inside `<div class="appbar-trailing">`.
  * *Existing Action Order*: Settings gear link (only visible on mobile settings-relevant screens).
  * *APIs*: No shared slots/props.
* **fitness**: Uses [AppBar.svelte](file:///Users/kenpan/「Projects」/life-os/apps/fitness/src/lib/components/AppBar.svelte).
  * *Sharing*: Duplicated per app.
  * *Trailing Action Area*: Renders inside `<div class="appbar-trailing">`.
  * *Existing Action Order*: Displays metadata text (`meta` prop).
  * *APIs*: Custom props for `title`, `subtitle`, `meta`, `backHref`.
* **music**: Uses [AppBar.svelte](file:///Users/kenpan/「Projects」/life-os/apps/music/src/lib/components/AppBar.svelte).
  * *Sharing*: Duplicated per app.
  * *Trailing Action Area*: Renders inside `<div class="appbar-trailing">`.
  * *Existing Action Order*: Mobile search icon → Dynamic action buttons (e.g. Primary, Secondary, Ghost buttons) determined by active page actions store.
  * *APIs*: Center slots and dynamic page `actions` array wrapper.
* **finance**: Uses [AppShell.svelte](file:///Users/kenpan/「Projects」/life-os/apps/finance/src/lib/components/AppShell.svelte).
  * *Sharing*: Duplicated per app.
  * *Trailing Action Area*: Renders inside `<header class="page-header">`.
  * *Existing Action Order*: Spacer → "Data updated at" metadata label. Settings/navigation links reside inside the desktop sidebar or bottom mobile navigation sheet.
  * *APIs*: Per-tab views are passed in as `children`.
* **home**: Uses [AppBar.svelte](file:///Users/kenpan/「Projects」/life-os/apps/home/src/lib/components/AppBar.svelte).
  * *Sharing*: Duplicated per app.
  * *Trailing Action Area*: Renders inside `<div class="appbar-trailing">`.
  * *Existing Action Order*: Displays metadata text (`meta` prop).
  * *APIs*: Custom props for `title`, `subtitle`, `meta`, `backHref`.

---

## 2. Shared Component Opportunities

* **Shared Shell/Header Components**: No shared `AppBar` or unified navigation shell component exists in `packages/platform-web` or `packages/theme`.
* **Shared Component Scope**: One header change **cannot** automatically cover all apps; each app's `AppBar.svelte` or `AppShell.svelte` layout requires manual insertion of the feedback entry point.
* **Svelte Sharing Pattern**: Shared components are exported from `packages/platform-web` (e.g., brand switchers, sync error banners) and imported into individual apps using monorepo packages.
* **Feasibility of Shared `ReportBugButton`**: Highly feasible. A new component `ReportBugButton.svelte` can be added to `packages/platform-web/src/svelte/feedback/` and imported into each app's header action area.

---

## 3. Existing Icons / Visual System

* **Icon Systems**:
  * **Lucide (`@lucide/svelte`)**: Used in `portal` and `finance` app shells.
  * **Registry-Based Icon Wrapper (`Icon.svelte`)**: Used in `planner`, `fitness`, and `music`. The system utilizes a global/local SVG registry (e.g., `packages/platform-web/src/svelte/icon/Icon.svelte`).
* **Bug Icon Approach**: Register a standardized `bug` SVG icon inside the icon registry for registry-based headers, and use Lucide's `<Bug>` icon component in Lucide-based headers.
* **CSS & Sizing**:
  * Button size matches the standard header layout (typically `20px` icon size with `1.75` stroke width).
  * Reuses standard classes like `btn-secondary` or raw `appbar-settings` styling for hover, active states, and mobile touch targets (minimum `44x44px` outer tap boundaries).
* **Accessibility**: Always use `aria-label="Report a bug"` for icon-only buttons.

---

## 4. Existing Report Bug / Diagnostics Context

* **Existing Assets**: Neither `BugReporterSheet.svelte` nor `diagnostics.js` nor the Supabase migration tables exist in the codebase.
* **Planner/Shared Status**: There is no existing local implementation of a bug reporter in Planner OS.
* **Reusability**: Shared toast stores (`createToastStore` in `@life-os/platform-web/svelte/toast-store`) are available to confirm successful submissions.

---

## 5. Supabase/Auth Availability Per App

| App | Supabase client | Auth user/session source | Toast/UI source | Header component | Existing right actions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **portal** | `$lib/supabase.js` | `$lib/auth.svelte.js` | Local layout state | `PortalAppBar.svelte` | Bell → Theme → Avatar → Log Out / Ellipsis |
| **planner** | `$lib/supabase.js` | `$lib/auth.svelte.js` | `$lib/ui.svelte.js` | `AppBar.svelte` | Settings Gear Link |
| **fitness** | `$lib/supabase.js` | `$lib/auth.svelte.js` | `$lib/ui.svelte.js` | `AppBar.svelte` | Meta text label |
| **music** | `$lib/supabase.js` | `$lib/auth.svelte.js` | `$lib/ui.svelte.js` | `AppBar.svelte` | Mobile Search → Dynamic buttons |
| **finance** | `$lib/supabase.js` | `$lib/auth.svelte.js` | Local layout state | `AppShell.svelte` | Data update label |
| **home** | `$lib/supabase.js` | `$lib/auth.svelte.js` | Local layout state | `AppBar.svelte` | Meta text label |

---

## 6. Recommended Integration Architecture

### Option A — Shared `ReportBugButton` (Recommended)
Create `ReportBugButton.svelte` in `packages/platform-web/src/svelte/feedback/`. Each app imports it into its local header actions.
* **Files likely to change**:
  * `packages/platform-web/src/svelte/feedback/ReportBugButton.svelte` [NEW]
  * App bars in `portal`, `planner`, `fitness`, `music`, `finance`, `home`
* **Pros**: Encapsulates diagnostic logic and trigger sheets globally; ensures single-source-of-truth updates.
* **Cons**: Requires mapping icon systems (Lucide vs. custom Icon registry).
* **Risk**: Low (isolated to component definitions).
* **Expected Scope**: Medium.

### Option B — Shared `HeaderAction`
Extend a shared header action component with a `showReportBug` prop.
* **Files likely to change**: N/A (no shared header component exists).
* **Pros**: N/A.
* **Cons**: N/A.
* **Risk**: N/A.
* **Expected Scope**: N/A.

### Option C — Per-App Local Button
Add the button individually in each app header, importing and triggering a shared `BugReporterSheet`.
* **Files likely to change**: Layout components in all 6 apps.
* **Pros**: Simple local integration, easy custom styles.
* **Cons**: Code duplication across 6 separate header scripts.
* **Risk**: Low.
* **Expected Scope**: Medium.

---

## 7. UX Placement Recommendation

| App | Recommended position | Reason | Risk |
| :--- | :--- | :--- | :--- |
| **portal** | Before Ellipsis overflow button | Keeps it visible in desktop/mobile list; avoids conflicts with auth settings. | Low. |
| **planner** | Before Settings gear link | Direct, high-visibility placement next to standard configuration panel. | Low. |
| **fitness** | Trailing appbar action area | High visibility; fitness appbar lacks other trailing icons, making space clean. | Low. |
| **music** | Before dynamic actions | Simple trailing position matching search triggers. | Low. |
| **finance** | Next to the data update label | Consistent entry point inside the page-header wrapper. | Low. |
| **home** | Trailing appbar action area | Simple trailing position. | Low. |

---

## 8. Implementation Boundaries for Future Prompt

The future implementation prompt MUST NOT do the following:
* **No full UI redesign**: Do not alter margins, color systems, layout flexbox rules, or core designs.
* **No search/settings behavior changes**: Existing navigation flows, settings modals, and search forms must remain untouched.
* **No route restructuring**: Do not add new routes, directories, or endpoints.
* **No new global state framework**: Avoid importing third-party stores. Use local Svelte stores or runes already configured in each app.
* **No automatic capture/session replay**: Do not add silent screenshooting, session recorders, or video track captures.

---

## 9. Final Output Summary

### Recommended Path
Implement **Option A** (Shared `ReportBugButton` in `packages/platform-web`).

### Files Likely to Change
| File | Why | Risk |
| :--- | :--- | :--- |
| `packages/platform-web/src/svelte/feedback/ReportBugButton.svelte` [NEW] | Reusable bug reporter trigger wrapper. | Low. |
| `apps/portal/src/lib/components/PortalAppBar.svelte` | Insert global trigger icon before settings ellipsis. | Low. |
| `apps/planner/src/lib/components/AppBar.svelte` | Insert global trigger icon before settings gear. | Low. |
| `apps/fitness/src/lib/components/AppBar.svelte` | Insert global trigger icon in trailing space. | Low. |
| `apps/music/src/lib/components/AppBar.svelte` | Insert global trigger icon next to search/actions. | Low. |
| `apps/finance/src/lib/components/AppShell.svelte` | Insert global trigger icon inside page-header toolbar. | Low. |
| `apps/home/src/lib/components/AppBar.svelte` | Insert global trigger icon in trailing space. | Low. |

### Per-App Header Map
| App | Header file | Right action area | Suggested insertion point |
| :--- | :--- | :--- | :--- |
| **portal** | `PortalAppBar.svelte` | trailing buttons | Right before `<button class="portal-appbar-more-btn">` |
| **planner** | `AppBar.svelte` | appbar-trailing | Right before `<a class="appbar-settings">` |
| **fitness** | `AppBar.svelte` | appbar-trailing | Right before `<span class="appbar-meta">` |
| **music** | `AppBar.svelte` | appbar-trailing | Right before dynamic action iteration loop |
| **finance** | `AppShell.svelte` | page-header | Inside `<header class="page-header">` next to `<span class="updated">` |
| **home** | `AppBar.svelte` | appbar-trailing | Inside `<div class="appbar-trailing">` |

### Existing Reusable Components
* Shared brand switchers (`AppBrand`).
* Global registry-based icon wrappers (`Icon`).
* Shared toast stores (`createToastStore`).
* Svelte sheet lock managers (`lockScroll`/`unlockScroll`).

### Missing Prerequisites
* **Icon Registration**: Add a `bug` vector to the shared icon registry.
* **Diagnostics Utility**: Build a simple metadata compiler in `platform-web`.

### Commands Run
* `grep_search AppBar`
* `list_dir apps/finance/src/lib/components`
* `view_file apps/finance/src/lib/components/AppShell.svelte`
* `view_file apps/planner/src/lib/components/AppBar.svelte`
* `view_file apps/fitness/src/lib/components/AppBar.svelte`
* `view_file apps/music/src/lib/components/AppBar.svelte`
* `view_file apps/home/src/lib/components/AppBar.svelte`
* `view_file apps/portal/src/lib/components/PortalAppBar.svelte`
* `grep_search createLifeOsAuth`

### Confidence
**High**: The monorepo layout, headers, and appbar components have been exhaustively mapped. Option A provides the safest, least invasive path for future execution.
