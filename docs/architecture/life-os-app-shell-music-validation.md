# PLAT.SHELL.4 — Music AppShell validation

## Verdict

`ADOPTED_ON_FROZEN_CONTRACT_V1_1`. Music is the third production app on
`LifeOsAppShell`. The migration surfaced one `INSUFFICIENT_GENERIC_API`
finding, resolved per the freeze policy with two additive generic props
(**v1.1**: `shellClass`, `shellDataset`), plus one shell behavior fix
(remeasure persistent overlays on `transitionend`/`animationend`). No breaking
change; Fitness and Home pass unchanged.

## Pre-migration concern map (deltas vs Fitness/Home)

| Concern | Music specifics | Resolution |
| --- | --- | --- |
| Root state CSS | `packages/theme/music-shell.css` keys ~250 selectors off `.music-app[data-page-route/…]` on the shell root | `shellClass="music-app"` + `shellDataset` (v1.1 additive) |
| Persistent player | MiniPlayer previously stacked with BottomNav in an app-owned `.bottom-shell` outside the shell | `persistentOverlay` snippet; `.mini-player` was already `position: fixed` (mobile above tabbar, desktop `bottom: 0; left: var(--sidebar-w)`) |
| Player clearance | Legacy `padding-bottom` rules on `.main-wrap[data-player-chrome='mini']` | Deleted; the shell's measured overlay spacer owns clearance |
| Show/hide transitions | MiniPlayer shows via transform/opacity transition (no size change) → shell never remeasured after settle | Shell fix: remeasure on `transitionend`/`animationend` from the persistent overlay region |
| Wide routes (span frame) | `data-content-mode="span"` used to live on the app-owned `.main-wrap` | Mode moves to the shell root via `shellDataset`; `content-frame.css` gained root-scoped variants (`.app-shell[data-content-mode='span'] .main-wrap …`) |
| Utility pane | Desktop side pane; root `--utility-pane-w` inline style + `data-utility-open` | `fixed`-positioned pane composes via `transientOverlay`; width var moves to `documentElement` (app-owned `$effect`); open state via `shellDataset` |
| Queue drawer / toasts / banners | Mounted at various root positions | All compose via `transientOverlay` |
| Immersive now-playing | Root `data-page-route` / `data-immersive-mode` drive chrome hiding, tint strips, view transitions | `shellDataset`; shell-rendered tint strips match legacy selectors |
| i18n | zh-only; no skip-link copy existed | Added `common.skipToContent` |

CSS ownership deltas: one direct-child selector loosened
(`.music-app>.sidebar` → descendant), two obsolete clearance blocks deleted,
two span selectors simplified. No selector targets AppShell internals.

## Validation record (2026-07-12)

| Command | Result |
| --- | --- |
| `npm run check --workspace=music-os` | 0 errors (1 pre-existing warning) |
| `npm run build --workspace=music-os` | pass |
| `npm test --workspace=@life-os/platform-web` | pass |
| `PWA_APP=music npx playwright test tests/pwa/music-app-shell.spec.ts` | **6 passed** |
| `PWA_APP=fitness npx playwright test tests/pwa/fitness-app-shell.spec.ts` | 7 passed (no regression) |
| `PWA_APP=home npx playwright test tests/pwa/home-app-shell.spec.ts` | 7 passed (no regression) |
| `PWA_APP=music npx playwright test tests/pwa/mobile-viewport.spec.ts` | 7 passed |
| `npm run check` / `npm run check:lifeos-boundaries` | pass |
| Browser verification (dev server) | Desktop + mobile render verified; single main scroll root (`bodyScrollable: false`); shell root carries `music-app` class + dataset; MiniPlayer in persistent region; overlay inset resets to 0 when player hidden |

Known limitation: live playback states (mini player visible, utility pane
open, now-playing immersive) were structurally verified (fixed positioning,
selector reach, measured-inset mechanics) but not exercised with real audio in
this pass — cover on next manual QA with a library imported.

## Stability gate

| Dimension | Score (0–5) |
| --- | ---: |
| Cross-app semantic stability | 5 |
| Absence of app-specific flags | 5 (`shellClass`/`shellDataset` are generic passthroughs the shell never reads) |
| Scroll/safe-area reliability | 5 |
| Composition flexibility | 5 |
| Fitness compatibility | 5 |
| Home compatibility | 5 |
| Test coverage | 4 (playback-state runtime QA pending) |
| Third-app readiness | 5 (three production apps on the contract) |

Total: **39/40**. Third-app readiness is now proven; the remaining gap is
runtime playback QA, not API design.

## Roadmap recommendation

Proceed with `PLAT.SHELL.5 — starter template` (shell + auth + i18n + theme +
PWA + Netlify skeleton). The contract needed only additive passthroughs for
its most stateful adopter yet — a good signal the template can freeze on v1.1.
