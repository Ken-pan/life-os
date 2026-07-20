# Kenos UIUX Existing Asset Inventory

**Date:** 2026-07-20  
**Starting SHA:** `435f12e0efefd1027cb7efeb94cfa36a9b6978a6`

Reuse method values: `REUSE_AS_IS` | `REUSE_WITH_SHELL` | `EXTRACT_SHARED_COMPONENT` | `DEEP_LINK` | `EMBED_EXISTING_ROUTE` | `ADAPT_NATIVE` | `REDESIGN_REQUIRED`

| Existing asset | Quality | Reuse method | Conflicts | Action |
|---|---|---|---|---|
| `systemNav.js` Today·Assistant·Spaces·Inbox | High | REUSE_AS_IS | None | Keep as Web IA SSOT |
| Apple `KenosAppModel.Tab` same four | High | ADAPT_NATIVE | Labels EN-only | Keep; mirror ids with Web |
| `LifeOsAppShell` / BottomNav / SideNav | High | REUSE_AS_IS | — | System chrome |
| `LifeOsSheet` | High | REUSE_AS_IS | — | Space Switcher host |
| `EmptyState` / `ErrorState` | Medium-High | REUSE_AS_IS | Not all Kenos reads use them | Wire degraded/unavailable |
| `AppBrandSwitcher` | High in domain apps | REUSE_AS_IS | Parallel to Kenos Spaces | Do not replace domain switcher; Kenos uses Space Switcher |
| `KENOS_SPACES` + `spacesList.core` | High | EXTRACT_SHARED_COMPONENT | Hosted vs external naming | Feed Space Switcher catalog |
| AIOS `/spaces` card grid | Medium | REUSE_WITH_SHELL | Card stack cheapness | Convert to grouped list rows |
| ChatSidebar Recent rail | Medium | REUSE_WITH_SHELL | Static first-3 external | Bind to recent store + All → sheet |
| CaptureQuick ⌘K | High | REUSE_AS_IS | — | Keep non-tab |
| FocusSessionShell | High | REUSE_AS_IS | — | Immersive chrome hide |
| `/spaces/training` hosted read | Medium | EMBED_EXISTING_ROUTE | Not full Fitness workout | Keep read + deep link write |
| Fitness app routes (`/`, `/day/*`) | High | DEEP_LINK | — | REUSE_AS_IS domain; no Kenos rewrite |
| Planner routes | High | DEEP_LINK | — | Keep Planner IA |
| Finance `/home/today` | High | DEEP_LINK | — | Keep |
| Music library | High | DEEP_LINK | — | Keep |
| Home spatial | Medium | DEEP_LINK | WIP spatial | Keep in Home |
| Knowledge + `KnowledgeNoteLinks` | Medium | DEEP_LINK | Separate knowledge app | Keep wikilink chips |
| Work hub `/work` | Medium | REUSE_WITH_SHELL | Hosted only | Resume route via switcher |
| Portal `/today` soft redirect | High (Owner canary) | REUSE_AS_IS | Must not expand cohort | No production redirect change |
| `uiux-review.mjs` | High | REUSE_AS_IS | aios pages stale | Update page list |
| `docs/ui-qa-screenshots` (gitignored) | High | REUSE_AS_IS | — | Baseline + rounds |
| `output/` (gitignored) | — | REUSE_AS_IS | — | Compounding round artifacts |
| Gallery Netlify site | Disabled | REUSE_AS_IS | Must stay disabled | Local preview only |
| KenosDesign Swift tokens | Medium | ADAPT_NATIVE | Parallel to Web tokens | Keep naming parity where cheap |
| Apple SpacesHub dead external rows | Low | ADAPT_NATIVE | Non-actionable | Wire open URL + switcher |
| PaperOS | Sibling | DEEP_LINK | Outside monorepo UI | Entry via Plan/Work only |

## Domain reuse summary

| Domain | Method | Kenos role |
|---|---|---|
| Fitness / Training | DEEP_LINK + hosted read | Shell, Focus, Activity; never rewrite workout |
| Planner / Plan | DEEP_LINK | EntityRef / Inbox return |
| Finance / Money | DEEP_LINK | Today cards + switcher |
| Music | DEEP_LINK | Today read + switcher |
| Home | DEEP_LINK | Today read + switcher |
| Knowledge | DEEP_LINK | Library coming soon on Apple |
| Work | EMBED_EXISTING_ROUTE | Hosted hub + resume |
| Focus | REUSE_AS_IS | Overlay session |
| Health | Standalone | Out of Kenos Spaces catalog for now |

## Gaps closed this program

1. Shared `spaceSwitcher.core` + logout clear key `kenos.spaceSwitcher.v1`
2. Scheme A Space Switcher sheet (Web + Apple)
3. Spaces directory de-carded
4. uiux-review aios shell pages
5. Apple external Spaces actionable
