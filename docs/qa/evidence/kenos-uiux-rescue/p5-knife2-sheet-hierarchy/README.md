# P5 Knife 2 — Continue responsive shell hierarchy

**Date:** 2026-07-20  
**Knife 2 status:** **PASSED** (Direction A)  
**Visual Quality overall:** **IN_PROGRESS**  
**Owner Review:** **NOT OPEN**  
**Continuity:** FUNCTIONALLY CLOSED — canonical `continuity-e2e-2026-07-20T20-12-22-998Z`

## Canonical result (use this)

```text
Knife 2 Direction A — CANONICAL / PASSED

Mobile  <600   → full-width bottom sheet
Tablet  600–899 → centered form sheet
Desktop ≥900   → anchored panel to Continue trigger (≈440px)
```

Evidence prefixes for the canonical result:

| Prefix | Meaning |
| ------ | ------- |
| `r2-*` | Direction A multi-viewport matrix (390 / 430 / 768 / 1024 / **1280** / 1440) |
| `r2b-open-*` | Post-anchor-fix open (desktop left-of-sidebar → to-the-right of trigger) |
| `manifest-r2.json` | Canonical probes + interaction matrix |

## SUPERSEDED — do not treat as current

```text
Knife 2 initial implementation — SUPERSEDED

Desktop ≥900 centered command panel (~460px)
(first hierarchy pass before Direction A anchoring)
```

| Path | Status |
| ---- | ------ |
| `01-*` / `02-*` / `03-*` / `04-*` (no `r2` prefix) | **SUPERSEDED** — early pass; desktop was centered |
| `before-round2/` | **SUPERSEDED** — snapshot of centered-desktop open shots |
| `manifest.json` | **SUPERSEDED** — pre–Direction A probes |

## Pass criteria (Direction A)

| Check | Result |
| ----- | ------ |
| Mobile bottom sheet hierarchy | **PASS** |
| Tablet form sheet | **PASS** |
| Desktop anchored panel | **PASS** |
| Background inert / scroll lock | **PASS** |
| Escape / scrim / close / focus return | **PASS** |
| BottomNav conflict | **RESOLVED** |
| All Spaces collapsed (`· N` + chevron, no Today pseudo-space) | **RESOLVED** |
| Continuity regression | **PASS** |

## Continuity regression

```bash
node scripts/qa/kenos-space-continuity-e2e-flows.mjs
# exit 0 · OVERALL PASSED
# regression run (not functional canonical): continuity-e2e-2026-07-20T21-30-25-542Z
```

Logs: `continuity-regression-r2.log` (Direction A), `continuity-regression.log` (earlier)

## Changed files (Knife 2 + Continuity store wiring required by Continue)

- `apps/aios/src/lib/components/SpaceSwitcher.svelte`
- `apps/aios/src/lib/components/BottomNav.svelte`
- `apps/aios/src/lib/components/KenosSystemBar.svelte`
- `apps/aios/src/lib/components/ChatSidebar.svelte`
- `apps/aios/src/routes/+layout.svelte`
- `apps/aios/src/app.css`
- `apps/aios/src/lib/kenos/spaceSwitcher.svelte.js`
- `packages/platform-web/src/svelte/overlay/LifeOsSheet.svelte`
- `packages/platform-web/src/svelte/overlay/index.d.ts`
- docs: `kenos-uiux-rescue-progress.md`, `KENOS_MIGRATION_LEDGER.md`

## Residual → Knife 3

- iPad adaptive material + touch-first vs fine-pointer for `≥900`
- Domain identity (Knife 4)
- Today type rhythm (Knife 5)
