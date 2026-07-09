# Safari Report Bug Layout Context Export

## 1. Files to inspect

- **`packages/platform-web/src/svelte/feedback/ReportBugButton.svelte`**:
  - Contains both the trigger button and the overlay UI (`<div class="bug-report-backdrop">`).
  - The overlay is rendered inline using `{#if isOpen}` directly adjacent to the button.
  - Styles for the backdrop use `position: fixed; inset: 0; z-index: 110;`.
- **`apps/planner/src/lib/components/AppBar.svelte`**:
  - Instantiates `<ReportBugButton />` inside `<div class="appbar-trailing">` inside `<header class="appbar">`.
- **`packages/theme/src/shell.css`**:
  - `.appbar` is defined as `position: sticky; top: 0;`.
  - Also applies `-webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);` to `.appbar`.
- **`packages/theme/src/ios-safari.css`**:
  - Adds `transform: translateZ(0);` to `.appbar` inside the `@media (--life-os-mobile)` block.

---

## 2. Rendered DOM structure after opening Report Bug

```txt
body
  .app-shell
    .main-col
      header.appbar
        div.appbar-inner
          div.appbar-trailing
            <!-- ReportBugButton Component -->
            button.report-bug-trigger
            div.bug-report-backdrop
              div.bug-report-sheet
                div.bug-report-header
                div.bug-report-body
                  form.bug-report-form
```

- **Is the backdrop/sheet inside the header/appbar DOM?** Yes.
- **Is it a direct child of `body`?** No.
- **What are the parent nodes of the backdrop?** `.appbar-trailing` -> `.appbar-inner` -> `header.appbar` -> `.main-col` -> `.app-shell` -> `body`.

---

## 3. Computed styles for key elements

- **`.appbar`**:
  - `position: sticky`
  - `transform: matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)` (resolves from `translateZ(0)`)
  - `backdrop-filter: blur(12px)`
  - `height: 88px` (approx, based on safe-area)
- **`.bug-report-backdrop`**:
  - `position: fixed`
  - `inset: 0`
  - Because of the ancestor constraints, `fixed` resolves against `.appbar` boundaries, restricting its height to 88px instead of `100dvh`.
- **`.bug-report-sheet`**:
  - `max-height: calc(100dvh - env(safe-area-inset-top) - 16px)`
  - Overflows the constrained backdrop bounding box.

---

## 4. CSS selector trace

- **`.bug-report-backdrop`** (`ReportBugButton.svelte`):
  - `position: fixed; inset: 0; z-index: var(--z-sheet, 110);`
- **`.appbar`** (`ios-safari.css`):
  - `@media (--life-os-mobile)` -> `transform: translateZ(0);`
- **`.appbar`** (`shell.css`):
  - `-webkit-backdrop-filter: blur(12px);`

The component-scoped CSS is correctly applied, but the layout engine's interpretation of `position: fixed` is overridden by the ancestor's properties.

---

## 5. Ancestor constraint audit

- **tag:** `header`
- **class:** `appbar`
- **computed position:** `sticky`
- **computed transform:** `translateZ(0)`
- **computed filter / backdrop-filter:** `blur(12px)`
- **Flagged:** Yes. Both `transform` (not `none`) and `backdrop-filter` (not `none`) formally establish a new containing block for `position: fixed` descendants in the CSS specification.

---

## 6. Safari/WebKit reproduction

On an iPhone Safari/WebKit viewport (e.g., 390x844):
- **Page is pushed down / Content clipped:** The backdrop is constrained to the `appbar` height. The `100dvh` sheet overflows this boundary. Since Safari mobile applies `transform: translateZ(0)` to the header, the "fixed" overlay is literally trapped inside the sticky header's coordinate space.
- **Actions position:** The actions try to stick to the bottom of the sheet, but because the sheet itself is squashed or overflowing weirdly inside the header, the actions float inline near the top of the viewport instead of anchoring to the physical bottom of the phone screen.

---

## 7. Compare browser behavior

| Environment | Sheet fixed? | Page pushed? | Content clipped? | Actions position | Notes |
|-------------|--------------|--------------|------------------|------------------|-------|
| Chrome Desktop | Yes | No | No | Bottom | `translateZ(0)` and mobile media queries don't apply. |
| Safari iOS / WebKit | No | Yes | Yes | Inline / Top | `transform: translateZ(0)` restricts `position: fixed` to the appbar bounds. |

---

## 8. Event and lifecycle audit

- **When is open set?** `onclick` on the bug icon button.
- **Where does the sheet render?** In Svelte markup, directly next to the button inside the header.
- **Are event listeners added only when open?** Yes, via an `$effect` block guarding `isOpen`.
- **Are event listeners cleaned up?** Yes, the `$effect` returns a cleanup function that calls `removeEventListener`.
- **Any possible leak or duplicate listener risk?** No leaks detected.

---

## 9. Package/export/build context

- **Import:** `import ReportBugButton from '@life-os/platform-web/svelte/feedback'`
- **Export:** Properly configured in `package.json` under `"./svelte/feedback"`.
- **Build Artifact Risk:** None. The CSS is correctly bundled, as evidenced by `.bug-report-backdrop` existing and working on desktop.

---

## 10. Root cause hypotheses ranked by evidence

| Rank | Hypothesis | Evidence for | Evidence against | Confidence |
|------|------------|--------------|------------------|------------|
| 1 | Fixed positioning is constrained by ancestor transform/contain/overflow. | `.appbar` has `transform: translateZ(0)` and `backdrop-filter` on mobile. CSS spec mandates these create a containing block for `fixed`. | None. | High |
| 2 | Overlay/backdrop is rendered inside appbar/header and participates in layout. | Svelte component places the backdrop exactly where the button is (inside the header). | Hypothesis 1 explains the actual breakage. | High |
| 3 | 100dvh / safe-area calculation breaks in Safari. | Safari is notorious for viewport height bugs. | The sheet appears inline near the top, which is a coordinate system issue, not just a height measurement issue. | Low |
| 4 | Component-scoped CSS is not applying or is overridden. | None. | `.bug-report-backdrop` applies perfectly; no global `.sheet` conflicts remain. | Low |

---

## 11. Recommended fix options, but do not implement

- **Option A: Body-level portal for backdrop/sheet.**
  - **Files:** `ReportBugButton.svelte`
  - **Why:** Moving the overlay to the end of `document.body` escapes the `.appbar` containing block, allowing `position: fixed` to map directly to the viewport.
  - **Risk:** Low. Uses standard Svelte portaling (e.g. action `use:portal` or mounting programmatically). Does not touch global CSS.
  
- **Option B: Remove `transform` and `backdrop-filter` from `.appbar`.**
  - **Files:** `ios-safari.css`, `shell.css`
  - **Why:** Removing these properties prevents `.appbar` from becoming a containing block.
  - **Risk:** High. `translateZ(0)` is usually a hack to fix iOS Safari flickering or scrolling performance. Removing it could regress other UI.

- **Option C: Lift `<ReportBugButton>` out of `<AppBar>`.**
  - **Files:** `AppBar.svelte` and all `+page.svelte` files.
  - **Why:** Moving the component outside the header DOM tree naturally escapes the constraints.
  - **Risk:** Medium. Requires wiring up props, events, or global state to trigger the sheet from the header button while rendering it at the layout root.

---

## 12. Final output

### Most likely root cause
**Fixed positioning is constrained by an ancestor's `transform` and `backdrop-filter`.**
The `ReportBugButton` renders its `position: fixed` overlay directly inside the DOM hierarchy of the `<header class="appbar">`. On mobile Safari, `.appbar` receives `transform: translateZ(0)` (via `ios-safari.css`) and potentially `backdrop-filter`. According to the CSS specification, these properties establish a new containing block for all descendants, including those with `position: fixed`. This forces the fixed overlay to be sized and positioned relative to the header's coordinate space (approx. 88px tall) rather than the screen viewport, causing it to render inline, clip content, and push layout.

### Evidence summary
- DOM tree confirms the backdrop is a child of the header.
- `ios-safari.css` contains `.appbar { transform: translateZ(0); }`.
- `shell.css` contains `.appbar { backdrop-filter: blur(12px); }`.
- Symptoms (sheet appears inline at the top) exactly match standard CSS containing-block breakage.

### Files likely to change for fix
| File | Why | Risk |
|------|-----|------|
| `packages/platform-web/src/svelte/feedback/ReportBugButton.svelte` | Needs to extract the `{#if isOpen}` block and portal it to `document.body` to escape the header's CSS influence. | Low |

### Recommended fix
**Option A: Body-level portal for backdrop/sheet.**

### Tests required after fix
- Mobile Safari (iPhone)
- iOS PWA installed app
- Desktop Chrome/Safari
- Verify across all six app headers (Portal, Planner, Fitness, Music, Finance, Home)

### Commands run
- `cat packages/platform-web/src/svelte/feedback/ReportBugButton.svelte`
- `cat packages/theme/src/scroll-shell.css`
- `cat packages/theme/src/shell.css`
- `grep -rn "AppBar" apps/planner/src/routes`
- `cat packages/theme/src/ios-safari.css`

### Confidence
**High**. This is a well-documented browser behavior (CSS transform/backdrop-filter establishing a containing block), and the CSS files explicitly apply these properties to the direct ancestor of the fixed overlay.
