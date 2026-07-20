# Kenos UIUX Reference Research

**Date:** 2026-07-20  
**Program:** KENOS UIUX COMPOUNDING OPTIMIZATION  
**Starting SHA:** `435f12e0efefd1027cb7efeb94cfa36a9b6978a6`

## Scope

Research for Kenos system shell (Today · Assistant · Spaces · Inbox), Space Switcher, domain reuse, and honest state presentation — Web + Apple.

## Sources

| Source | Type | URL / location |
|---|---|---|
| Apple HIG — Adopting Liquid Glass | Official | https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass |
| WWDC25 — Build a UIKit app with the new design | Official | https://developer.apple.com/videos/play/wwdc2025/284/ |
| iPad tab bar ↔ sidebar adaptivity | Official pattern | UITab / UITabGroup (Apple docs) |
| W3C ARIA landmarks / Using ARIA | Official | https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/ |
| W3C Using ARIA (first rule: prefer native) | Official | https://www.w3.org/TR/using-aria/ |
| Life OS Design System | Repo | `packages/theme/DESIGN_SYSTEM.md` |
| Kenos Apple architecture | Repo | `docs/architecture/kenos-apple-client-architecture.md` |
| Existing uiux-review tooling | Repo | `scripts/qa/README.uiux-review.md` |
| Reference apps (behavioral, not visual copy) | Product | Apple Fitness / Health / Music / Home / Reminders / Notes / Files / Shortcuts |

## Transferable principles

1. **Navigation is a separate layer from content.** Liquid Glass / HIG: tab bars and sidebars float above content; do not paint domain content into chrome.
2. **2–5 top-level destinations.** Kenos already has four. Space switching must stay a temporary layer — never a fifth permanent tab.
3. **iPad: tab ↔ sidebar adaptivity.** Prefer one adaptive system chrome, not Kenos sidebar + domain sidebar + third permanent rail.
4. **Content first during immersion.** Fitness active workout / Focus should minimize system chrome (already partially true for Focus).
5. **Landmarks + labels.** Multiple `navigation` regions need distinct accessible names (System vs Spaces vs Inbox queues).
6. **Native semantics first.** Prefer HTML/`TabView`/`NavigationStack`/`sheet` over custom gesture-only switchers.
7. **Live regions for state changes.** Empty/offline/error announcements must exist in DOM before content injects.
8. **Defer to mature domain apps.** Fitness/Planner already own workflows — Kenos embeds/deep-links, does not redesign training or task IA as dashboards.

## Not applicable to Kenos

| Pattern | Why not |
|---|---|
| Full Stage Manager window tiles on iPhone | Fake desktop multitasking; violates one-handed + HIG |
| Permanent Space grid in tab bar | Exceeds 5-tab guidance; crowds system IA |
| Liquid Glass translucency as brand look on Web | Accessibility risk (contrast); Web already has opaque token surfaces |
| Triple nested sidebars (system + domain + inspector always open) | Orientation failure on iPad compact |
| Cloning Apple Fitness visual language into AIOS cards | Destroys Fitness identity; creates duplicate workout UI |

## Conflicts with current architecture

| Conflict | Resolution direction |
|---|---|
| Domain apps use `AppBrandSwitcher`; AIOS uses Spaces cards | Keep domain switcher inside domain apps; Kenos gets Space Switcher with same catalog semantics |
| External Spaces open `target=_blank` | Keep deep link (no iframe rewrite this program); Switcher records recent + resume for hosted only |
| Apple SpacesHub had dead external rows | Make rows actionable (open URL) + shared catalog ids |
| `uiux-review` aios pages still chat-at-`/` | Update to Today / Assistant / Spaces / Inbox |

## Direct reuse of platform patterns

- **iPhone:** `TabView` (4 tabs) + sheet Space Switcher + Capture sheet (not a tab)
- **iPad/macOS:** `NavigationSplitView` for system tabs; Space Switcher from toolbar; collapse system chrome when domain needs width
- **Web:** `LifeOsBottomNav` / `LifeOsAppShell` / `LifeOsSheet` / status Empty/Error
- **Tokens:** structural spacing, `--content-max`, `--radius-control`, surface via theme — not new ad-hoc radii

## Space Switcher research conclusion

Evaluate two schemes:

- **A — Visible switcher control → sheet** (discoverable, one-handed, keyboard-friendly)
- **B — Spaces directory + Recent rail in sidebar** (already partially present)

**Decision criteria:** discoverability, speed, orientation, content space, native feel, state restoration, one-handed, keyboard, nested-nav conflict.

**Preliminary lean (to validate with prototypes + screenshots):** Scheme **A as primary** + Scheme **B as reinforcement** (Recent in sidebar + All opens same sheet). Hidden gestures alone are rejected.

## Accessibility conclusions

- Do not rely on color alone for selected Space / Approval pending / offline.
- Touch targets ≥ 44pt; Space Switcher rows meet this.
- Reduce Motion: sheet present/dismiss only, no fake window physics.
- Logout must clear user-scoped Space resume/recent (`kenos.spaceSwitcher.v1`).

## Outcome for implementation

Proceed with shared `spaceSwitcher.core` contract (Web + Apple mirror), Scheme A sheet, list-style Spaces directory (reduce card stack), domain apps remain deep-link / REUSE_WITH_SHELL.
