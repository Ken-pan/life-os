# Navigation Stabilization Knife — 2026-07-21

**Does not close Phase 4.** Owner-quality UI still NOT READY; this knife addresses P1 navigation only.

## Shipped this knife

| Item | Change |
| ---- | ------ |
| Leading dock chip | **Spaces → Kenos** · tap = return Kenos / Home · **long-press = Space Shelf** |
| Domain Dock | Still 5 total: Kenos + 4 · Plan Search → **More** · Training History → **More** |
| Left gray handle | No drawn affordance · invisible edge pan only at Domain root (card edges ≠ handle) |
| Shelf morph | **overlay scale ~92% + light nudge** · full silhouette · tap outside / × closes |
| Shelf selected | Tint + 3pt domain rail · **no focus-ring stroke** |
| Training/Plan embed | BottomNav hidden · fitness bottom pad for dock |
| Domain More sheet | Search / History / secondary routes |

**Device build:** `202607211257`  
**Evidence:** `screenshots/nav-stab-knife/`

## Frozen semantics

| Control | Meaning |
| ------- | ------- |
| Back (web) | Domain-internal previous page |
| `Plan ⌄` / title | Quick Switch (domain switch) |
| **Kenos** chip tap | System exit → prior Kenos tab |
| **Kenos** long-press | Space Shelf |
| Capsule | Domain IA (≤4) |

## Still open (P1 leftovers / P2)

- Draft-preservation on Space switch (auto-save / confirm)
- Native TabView material path (vs brand capsule)
- Plan FAB → nav + compose
- Today / Assistant / Inbox density
- Dynamic Type OS sweep

```text
NAVIGATION_STABILIZATION: SHIPPED_SLICE
STRUCTURAL IA: PASS
OWNER-QUALITY UI: NOT READY
PHASE 4: EXIT_OPEN
```
