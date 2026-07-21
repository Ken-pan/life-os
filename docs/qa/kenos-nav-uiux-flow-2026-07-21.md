# Kenos iOS — Global nav UIUX flow (clean)

**Date:** 2026-07-21 · build `202607211239`（真机 PASS）  
**Does not close Phase 4.**  
证据：`docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/screenshots/nav-flow-clean/VERIFY.md`

## One sentence

> **Left Spaces chip = Space Shelf only.** Capsule = where you are. Everything else is not a second Spaces switcher.

## Modes

| Mode | Bottom chrome | Content |
| ---- | ------------- | ------- |
| **Kenos** | `[Spaces]` + `[Today · Assistant · Inbox · Settings]` | aios Daily Beta |
| **Domain** | `[Spaces]` + domain 4 (Plan/Training/…) | Continuity WKWebView |
| **Focus** | none | Workout / Deep Work immersive |

## Button → destination (SSOT)

| Control | Opens | Does **not** |
| ------- | ----- | ------------ |
| **Dock · Spaces** (left chip) | **Space Shelf** sidebar (toggle) | No `/spaces` page, no return-to-Kenos, no sheet duplicate |
| **Dock · capsule item** | That mode’s surface (Today / Tasks / …) | — |
| **Dock · Settings** (Kenos) | Settings sheet | — |
| **Top tools · Continue** | Continue sheet (recent resumes only) | Not full Space directory |
| **Top tools · Quick Switch** | Searchable jump (Things Quick Find) | Not Space Shelf |
| **Domain title · Plan ˅** | Quick Switch | Not Space Shelf |
| **Shelf · Kenos Home** | Leave Domain → prior Kenos tab | — |
| **Shelf · Recent card** | Open that Space (Domain Continuity) | — |
| **Shelf · All Spaces** | Full directory sheet (only from Shelf) | Not on dock / top tools |
| **Left-edge pull** (Domain root) | Space Shelf | — |

## Removed duplicates

- Top floating **Switch Space** (grid) — removed; Spaces chip owns switching.
- Spaces chip no longer jumps to `/spaces` or exits Domain by itself.
- Settings only in Kenos capsule (not also in top tools).

## Domain Continuity (why dock used to stick)

Plan/Training must call `enterDomainMode(url:)` on **MainActor**. WKWebView used to post Continuity off-main → UI kept Kenos capsule over domain content. Fixed: main-queue post + `enterDomainMode` + `didFinish` belt for domain origins.

## Mental model

```text
Spaces chip ──► Space Shelf ──► pick Space / Kenos Home / All Spaces
Capsule      ──► stay inside current mode’s IA
Continue     ──► resume mid-work (not browse Spaces)
Quick Switch ──► type-to-jump (not browse Spaces)
```
