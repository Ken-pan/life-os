# KENOS VISUAL DIRECTION DECISION

**Date:** 2026-07-20  
**Evidence:** `output/uiux/kenos-visual-rescue-2026-07-20/directions/` (27 shots) + contact sheets in `…/diff/`  
**Blind reviewers:** A consumer visual · B Apple platform · C IA/workflow (codes V1=A, V2=B, V3=C)

Prior 91/100 and SIX_ROUND_PASS remain **invalid** as visual proof. This decision only selects a direction for rescue implementation.

---

## Blind tally (not a simple average)

| Question | A | B | C | Notes |
|---|---|---|---|---|
| Most mature consumer | V1 | V1 | — | Strong V1 |
| Least admin-tool | V2 | V1 | — | Split |
| Best domain native (Fitness) | V1 | V1 | — | Unanimous V1 |
| Easiest Space switching | V3 | V3 | V2* | *C prefers IA clarity of V2 resume copy; V3 spatial strip condemned as duplicate nav |
| Clearest hierarchy | V1 | V1 | V1 | Unanimous |
| Easiest long-term extend | V1 | V1 | V2≈V1 | Prefer V1 list grammar |

---

## Chosen primary

**Direction A — Native Content First (V1)**

Reasons (evidence-based, not preference):
1. Fitness is the only variant with usable mid-workout language (split columns, active tint, primary CTA) — A & B.
2. Single list grammar scales across Today / Spaces / Switcher / Planner without inventing a second nav metaphor — A, B, C.
3. Closest to Apple first-party list + tint patterns; easiest to map to Tab / NavigationSplit / sheet — B.
4. Hierarchy comes from roles + dividers, not poster type or empty voids — A & B.

---

## Absorb from other directions

### From B (Calm Editorial) — selective
- Stronger Today lede that states hub job (“重要事先处理…”) — C praised this.
- Tighter title → content rhythm (not V2’s large empty band under “真正重要的事”).
- Sparse domain accent **tokens** (tint / leading marker), not decorative underlines as brand skin — B warned against underline as system language; use SF-symbol/tint instead when native.

### From C (Spatial Context) — selective
- Switcher framing as **Continue / resume** with current selection ring — A & B.
- Recent rows show **mid-set / selected task** metadata — all three.
- Context shelf / rail **only inside Switcher** (and optionally iPad adaptive sidebar), never as a third persistent strip on Today/Spaces — C + A regression risk.

---

## Explicitly rejected

| Reject | Why |
|---|---|
| V3 page-persistent Training/Plan/Work strip | Triple entry with Spaces + Switcher (A, C). |
| V3 centered opaque “Continue” fake window | Platform mismatch; must be real sheet / popover (B). |
| V3 purple concept selection chrome as default | Non-system (B). |
| V2 oversized empty voids as “calm” | Reads unfinished (A); wastes iPad (B). |
| V2/V3 Fitness name∥reps glued layout | Looks un-QA’d; loses domain native (A, B). |
| Productizing prototype surface chips | Not product nav (all). |
| FAB “SPACE Switch” as primary entry | Competes with tab; not in chosen native model. |

---

## Implementation binding

1. **Round 1 foundation:** A type/spacing/surface/radius/color/icon tokens; apply to Today, Spaces, Inbox, Planner hub, Fitness/Training surfaces.
2. **Round 2 shell:** Restructure BottomNav / layout chrome; remove FAB; content insets; materials on nav only.
3. **Round 3 switcher:** LifeOsSheet + hairline groups + Continue semantics + recent/pinned persistence (Apple already started) + iPad adaptive.
4. **Rounds 4–6:** True domain integration beyond deep link; states; full matrix — Owner review only at end.

---

## Still ugly after this decision (honest)

- Pure `#000` canvas without materials still reads prototype until Round 2.
- iPad still mobile-stretched until Round 2/3.
- Direction prototypes themselves are not the product — production pages must catch up with screenshots.

**Status:** Direction locked. Visual quality remains **NOT Owner-accepted**.

## iOS IA (post-direction)

Interaction / navigation structure for iPhone is locked in [`kenos-ios-ia-model-2026-07-21.md`](./kenos-ios-ia-model-2026-07-21.md) (Tabs + Live Accessory + Continue + Quick Switch). Visual Direction A remains the surface grammar.
