# Kenos Visual Quality Rescue — progress

| Track | Status |
| ----- | ------ |
| Four-knife | Owner accepted structural wins |
| Space Continuity (function) | **PASSED** · Planner / Fitness / Isolation **VALIDATED** |
| Annotation / evidence binding | Closed in `…T20-12-22-998Z` |
| Continuity Verification Sheet | Rebuilt from canonical run (not Owner Review) |
| **P5 Visual Quality** | **IN_PROGRESS** — knife 1 hairline DONE · knife 2 hierarchy DONE · knives 3–5 open |
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
- Fix note: `app.css` invalid `:global()` in plain CSS corrected earlier

**No READY_FOR_OWNER_REVIEW. No overall visual PASS.**

## Still open (later knives)
- iPad adaptive material + touch vs fine pointer (Knife 3)
- Domain identity marks on Spaces directory (Knife 4)
- Type ramp / Today density (Knife 5)
