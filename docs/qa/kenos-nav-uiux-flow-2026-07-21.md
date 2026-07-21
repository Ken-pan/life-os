# Kenos iOS — Global nav UIUX flow (clean)

**Date:** 2026-07-21 · build `202607211239`（真机 PASS）
**Does not close Phase 4.**
证据：`docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/screenshots/nav-flow-clean/VERIFY.md`

## One sentence

> **Left Spaces Orb = Space Shelf only.** Capsule = where you are. Everything else is not a second Spaces switcher.

## Modes

| Mode | Bottom chrome | Content |
| ---- | ------------- | ------- |
| **Kenos** | `◉ Spaces Orb` + `[Today · Ask · Inbox]` | aios Daily Beta |
| **Domain** | `◉ Spaces Orb` + domain 3 destinations | Continuity WKWebView |
| **Focus** | none | Workout / Deep Work immersive |

## Dock × scroll (locked)

- Content **may** pass behind the transparent Liquid Glass dock while scrolling.
- At scroll end, the last content/action must rest **fully above** the dock.
- Mechanism: full-bleed WK under dock + `#main-content` `padding-bottom` / `scroll-padding-bottom` = `safe-area-bottom + KenosGlass.dockScrollEndPadPx` (56 + 6 + 16).
- Native Settings still uses a SwiftUI bottom inset (Form is not CSS-padded).

## Domain accent semantic pairs (locked)

Never one hex for light + dark + glass. Each Space has:

| Token | Use |
| ----- | --- |
| `accentLight` / `accentDark` | Content / shelf tints |
| `accentOnGlassLight` / `accentOnGlassDark` | Dock Orb icon + selected tab on Liquid Glass |
| plate ~10% light / ~14% dark | Selected capsule plate |

Plan: light ochre `#C47A08` / on-glass `#9A6410` (not `#C9A227` on cream glass). SSOT Swift `KenosDomainAccent` ↔ JS `domainIdentity.core.js`.

## Space Shelf Recent (locked)

Recent = horizontal **chips**: Space icon + name only. No subtitle (truncated “Fitness work…” is noise). Detail lives in All Spaces rows / Current.

## Space Shelf search (locked)

One search entry only — top field under **Spaces**:

```text
Spaces
[ Search spaces… ]

Current
Recent
All Spaces
```

No trailing header magnifyingglass **and** footer field (duplicate). Tap opens Quick Switch.

## Dock hierarchy — Orb vs selected tab (locked)

| Layer | Control | Visual |
| ----- | ------- | ------ |
| **Identity** | Spaces Orb | Neutral / clear Glass · Space accent **icon only** · no accent plate |
| **Location** | Selected capsule tab | Accent icon + soft accent plate (~0.12) + label · **primary** selected weight |
| **Shelf open** | Orb as close | Denser Glass + soft accent fill + `chevron.left` morph; capsule hides |

Do **not** give Orb and the selected tab equal accent plates — that reads as two “current” states.

## Status bar × Domain appearance (locked)

| Surface | `chromeAppearance` | Status bar foreground |
| ------- | ------------------ | --------------------- |
| Plan (light) | `.light` | **dark** |
| Training (dark) | `.dark` | **light** |
| Light Domain + Shelf | stays `.light` | still readable |
| Dark Domain + Sheet | parent `.dark` (Settings sheet pins `.dark`) | still readable |

- SSOT: `KenosAppModel.chromeAppearance` → `preferredColorScheme` (never hardcode `.dark` on the app root).
- Enter Domain: optimistic brand default; web `data-theme` / `publishChromeAppearance` may refine.
- WK load veil / under-page canvas follows the same appearance (no dark ink veil on light Plan).

## Button → destination (SSOT)

| Control | Opens | Does **not** |
| ------- | ----- | ------------ |
| **Dock · Spaces Orb** | **Space Shelf** (toggle; morphs to close while open) | No `/spaces` page, no return-to-Kenos, no sheet duplicate |
| **Dock · capsule item** | That mode’s surface (Today / Tasks / …) | — |
| **Today · account** | Settings (native tab) | Not on Ask / Inbox / Dock |
| **Domain header · ···** | Domain More sheet | Not a dock capsule |
| **Top tools · Continue** | Continue sheet (recent resumes only) | Not full Space directory |
| **Top tools · Quick Switch** | Searchable jump (Things Quick Find) | Not Space Shelf |
| **Domain title · Plan ˅** | Quick Switch | Not Space Shelf |
| **Shelf · Kenos Home** | Leave Domain → prior Kenos tab | — |
| **Shelf · Recent card** | Open that Space (Domain Continuity) | — |
| **Shelf · All Spaces** | Full directory sheet (only from Shelf) | Not on dock / top tools |
| **Left-edge pull** (Domain root) | Space Shelf | — |

## Removed duplicates

- Top floating **Switch Space** (grid) — removed; Spaces Orb owns switching.
- Spaces Orb no longer jumps to `/spaces` or exits Domain by itself.
- Settings only on Today account control (not Dock / Ask / Inbox).
- Domain More only in domain header ellipsis (not Dock capsule).

## Domain Continuity (why dock used to stick)

Plan/Training must call `enterDomainMode(url:)` on **MainActor**. WKWebView used to post Continuity off-main → UI kept Kenos capsule over domain content. Fixed: main-queue post + `enterDomainMode` + `didFinish` belt for domain origins.

## Mental model

```text
Spaces Orb   ──► Space Shelf ──► pick Space / Kenos Home / All Spaces
Capsule      ──► stay inside current mode’s IA (Today · Ask · Inbox / domain 3)
Today account──► Settings
Domain ···   ──► Domain More sheet
Continue     ──► resume mid-work (not browse Spaces)
Quick Switch ──► type-to-jump (not browse Spaces)
```
