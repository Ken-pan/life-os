# Kenos Space Switcher Decision

**Date:** 2026-07-20  
**Status:** VALIDATED — Scheme A primary + Scheme B reinforcement

## Prototypes compared

| Scheme | Implementation | Discoverability | Speed | Content space | Native feel | State restore | One-handed | Keyboard | Nested nav |
|---|---|---|---|---|---|---|---|---|---|
| A — Visible control → sheet | Web FAB/sidebar globe + `LifeOsSheet`; Apple toolbar + sheet | High | High | High (temporary) | High (sheet) | Hosted resume via `spaceSwitcher.core` | High (thumb FAB) | Sheet focus trap | No 5th tab |
| B — Spaces directory + Recent rail | `/spaces` list + ChatSidebar Recent | Medium-High | Medium | High | High | Same store | Medium | Link nav | No conflict |
| Hidden gesture only | Rejected | Low | — | — | Anti-HIG | — | Fragile | Poor | — |

## Decision

**Ship A as primary switcher; keep B as always-visible reinforcement.**

Rationale (evidence-based):

1. Four system tabs must stay stable — Space switch is temporary (HIG 2–5 destinations).
2. Sidebar Recent already existed; binding it to the same store compounds without a second catalog.
3. External Spaces remain deep links (no iframe rewrite); hosted Spaces resume `lastRoute`.
4. Apple mirrors the same sections: System / Recent / Pinned / All.
5. iPad/macOS: toolbar trigger on split sidebar — avoids third permanent sidebar.

## Rejected

- Fifth tab for Spaces switcher
- Fake Stage Manager window tiles on iPhone
- Replacing domain `AppBrandSwitcher` inside Planner/Fitness/etc.

## Contract SSOT

- Web: `apps/aios/src/lib/kenos/spaceSwitcher.core.js`
- Storage key: `kenos.spaceSwitcher.v1` (cleared on logout / owner switch)
- Apple: `KenosAppModel.spaceCatalog` + `showSpaceSwitcher` sheet (semantic mirror)

## Acceptance

- [x] Not a 5th tab
- [x] Current Space identity via recent/currentListKey
- [x] Recent / Pinned / All
- [x] Return to System (Today/Assistant/Inbox)
- [x] Hosted resume routes
- [x] Accessible labels + 44pt rows
- [x] User-scoped clear on logout
