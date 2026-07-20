# Kenos Visual Quality Rescue — progress

| Track | Status |
| ----- | ------ |
| Four-knife | Owner accepted structural wins |
| Space Continuity (function) | **PASSED** · Planner / Fitness / Isolation **VALIDATED** |
| Annotation / evidence binding | Closed in `…T20-12-22-998Z` |
| Continuity Verification Sheet | Rebuilt from canonical run (not Owner Review) |
| **P5 Visual Quality** | **IN_PROGRESS** — knives 1–4 DONE · knife 5 open |
| Owner Review | **NOT OPEN** |

```text
KENOS OVERALL CONTINUITY GATE — PASSED
KENOS UIUX VISUAL QUALITY — IN_PROGRESS
OWNER REVIEW — NOT OPEN
```

## P5 knife 1 — SpaceSwitcher hairline (Direction A)

- File: `apps/aios/src/lib/components/SpaceSwitcher.svelte`
- Change: Recent / Pinned / All / System → hairline list groups (no stacked raised cards)
- Evidence: `docs/qa/evidence/kenos-uiux-rescue/p5-switcher-hairline/`
- Continuity behavior / testids unchanged

## P5 knife 2 — Continue / AppShell / BottomNav hierarchy

- Status: **PASSED** (Direction A — **CANONICAL**) — overall P5 Visual still **IN_PROGRESS**
- Initial centered-desktop pass: **SUPERSEDED** (see evidence `SUPERSEDED-EARLY-PASS.md` / `before-round2/`)
- Mobile `<600`: bottom sheet, handle, 44×44 close, max ~78dvh, safe-area padding, BottomNav inert
- Tablet `600–899`: centered form sheet ~560px, no handle, close
- Desktop `≥900`: **anchored** panel ~440px from Continue trigger; light scrim (no heavy blur); 1px border + light shadow
- All Spaces collapsed: `All Spaces · N` + chevron — **no** SYSTEM Today row
- Focus: outline ring (not inset / right-border); star 44×44 + stopPropagation
- Evidence: `docs/qa/evidence/kenos-uiux-rescue/p5-knife2-sheet-hierarchy/` (`manifest-r2.json` = canonical)
- Continuity regression: **PASSED** (`…T21-30-25-542Z`, not new functional canonical)

**No READY_FOR_OWNER_REVIEW. No overall visual PASS.**

## P5 knife 3 — iPad adaptive material & interaction mode

- Status: **DONE** — overall P5 Visual still **IN_PROGRESS**
- Mode core: `continueOverlayMode.core.js` — width + `(pointer: fine)` + `(hover: hover)` (no UA)
- Evidence: `docs/qa/evidence/kenos-uiux-rescue/p5-knife3-ipad-material/`
- Continuity regression: **PASSED** (`…T21-52-46-113Z`)

## P5 footnote fix (audit P1–P3) — 2026-07-20

- Status: **PASS** (Owner Review still **NOT OPEN**; Visual still **IN_PROGRESS**)
- P1 desktop chrome clamp: `continueOverlayAnchor.core.js`
- P2 All Spaces count = full catalog (`All Spaces · 8` in demo)
- P3 list hairlines only
- Evidence: `docs/qa/evidence/kenos-uiux-rescue/p5-footnote-fix-2026-07-20/`

## P5 knife 4 — Spaces domain identity

- Status: **PASS** (Owner Review still **NOT OPEN**; Visual still **IN_PROGRESS**)
- SSOT: `domainIdentity.core.js` — identity accents ≠ `--critical` status
- Surfaces: Spaces directory · Today Spaces shortcuts · Continue rows (rail + glyph + faint tint)
- Icons registered: activity / focus / briefcase / music / home (+ existing wallet / list-todo / notebook)
- Evidence: `docs/qa/evidence/kenos-uiux-rescue/p5-knife4-domain-identity/` (`manifest.json` PASS)
- Capture: `node scripts/qa/kenos-knife4-domain-identity-capture.mjs --port 5197`
- Continuity: descriptor / deep links / testids **unchanged**

## Still open (later knives)

- Type ramp / Today density (Knife 5)
