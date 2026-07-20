# Kenos UIUX Rescue — Round 2–6 (batch)

**Working tree** on top of `502d805c28b29d3d50c0efa2699ab717a301ac45`  
**Preview:** `http://127.0.0.1:5291/?kenosDemo=1`  
**Tests:** aios `136` pass  
**Evidence:** `output/uiux/kenos-visual-rescue-2026-07-20/rounds/r{2-6}/`  
**Capture:** `scripts/qa/kenos-visual-rescue-r2-r6-capture.mjs` (52 dark + 52 light web shots)

---

## Round 2 — System Shell

- Content bottom pad tokens; desktop Today two-column
- Continue removed from content-covering FAB; header/AppBar/Sidebar + **⌘.**
- Focus immersive leave → Plan bridge (return banner preserved)
- Custom headers on domain bridge routes

## Round 3 — Space Switcher

- Recent → Pinned → All(search/collapse) → System(Today only)
- user-scoped persist + logout clear (existing) + demo seed
- **External / hosted-bridge https resume** with same-origin / known-domain guards
- Apple `KenosSpaceSwitcherStore` already present
- Keyboard: Cmd/Ctrl + `.`

## Round 4 — Fitness + Planner

| Flow piece | Classification |
|---|---|
| `/spaces/training` local Focus | **shell-integrated** |
| Fitness `/day/chest/focus` via Continue / CTA | **state-restored deep link** |
| `/spaces/plan` bridge → `/upcoming` `/inbox` | **shell-integrated** + **state-restored deep link** |
| Truly embedded Planner/Fitness DOM | **not done** (iframe forbidden / out of scope) |

Flows covered in UI:
- Training → Fitness active deep link (remembered)
- Training → temporary Plan bridge
- Focus leave → Plan; return banner for Focus
- Today priority click remembers Plan/Training resume

## Round 5 — Other domains + states

- Bridges: `/spaces/{money,music,home,knowledge}`
- Spaces catalog = hosted bridges (no duplicate external rows)
- `/uiux-states` local state matrix: loading/empty/unavailable/offline/error/permission/unsupported/partial/stale/ready + approval pending / approved-not-executed + read-only copy

## Round 6 — Matrix

- Web 390 / 768 / 1024 / 1440 × **dark + light**
- Core pages + Continue sheet + states
- iPhone/iPad Simulator full window matrix: **not re-shot in this batch** (prior baseline + web matrix; Owner should use Preview + Simulator locally)

---

## Integration honesty

**KENOS UIUX DOMAIN INTEGRATION — FUNCTIONALLY_VALIDATED** only for:
- shell bridges + state-restored deep links + Focus shell continuity

**Not** claimed: truly embedded Fitness/Planner UI reuse.
