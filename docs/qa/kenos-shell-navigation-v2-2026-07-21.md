# Kenos Shell Navigation v2 — Three Modes + Space Shelf

**Status:** `APPROVED_DIRECTION` — post–Daily Beta Stabilization  
**Date:** 2026-07-21  
**Does not supersede** the Daily Beta lock in `kenos-ios-ia-model-2026-07-21.md` until Stabilization exits and Owner schedules an IA slice.  
**Does not close Phase 4.**

## Relationship to frozen Daily Beta IA

| Layer | Status | Meaning |
| --- | --- | --- |
| Daily Beta IA | **LOCKED** | Four Kenos tabs always; domains via Continuity cover; Continue / Quick Switch / Live Accessory |
| Navigation v2 | **APPROVED_DIRECTION** | Kenos Mode ↔ Domain Mode (dock replace) ↔ Focus Mode + Space Shelf |
| Stabilization | **IN PROGRESS** | Do **not** implement v2 chrome during dogfood |

Daily Beta may temporarily show dual chrome (Kenos tabs + domain web bottom nav). That is a known P2 / structural debt — fix via this doc after dogfood, not by stacking more tabs.

## Verdict

```text
Kenos Shell Navigation
+ Contextual Domain Dock (replace, never stack)
+ Global Space Shelf (Stage Manager–like, live states)
+ Immersive Focus Mode
```

Core rule:

> In Kenos Mode you see Kenos navigation.  
> In Domain Mode you see that domain’s navigation.  
> At domain root, left-edge pull opens Space Shelf.  
> In Focus Mode navigation exits.  
> **Exactly one bottom bar at all times.**

## Three modes

### A. Kenos Mode — system hall

Surfaces: Today · Assistant · Spaces · Inbox (+ Settings).

```text
Today · Assistant · Spaces · Inbox
```

### B. Domain Mode — work surface

Entering Plan / Training / Money / … **replaces** the Kenos tab bar with a domain dock. Slot 1 is always **Kenos** (return to prior Kenos context — not “quit app”).

Unified five-slot semantics:

| Slot | Meaning |
| --- | --- |
| 1 | **Kenos** — return system context |
| 2 | Domain home / Today |
| 3 | Primary work object |
| 4 | Browse / history / library |
| 5 | Search or More |

| Domain | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| Plan | Kenos | Tasks | Calendar | Projects | Search |
| Training | Kenos | Today | Workout | Library | History |
| Money | Kenos | Today | Transactions | Plan | Accounts |
| Music | Kenos | Now Playing | Library | Discover | Search |
| Knowledge | Kenos | Notes | Library | Capture | Search |
| Home | Kenos | Home | Rooms | Items | Organize |
| Work | Kenos | Today | Projects | Focus | Search |

Within one domain, the dock **must not** appear/disappear per page (HIG tab-bar stability). Only whole-mode switches Kenos ↔ Domain ↔ Focus.

Tap **Kenos**: return previous Kenos tab context.  
Long-press **Kenos**: open Space Shelf.

### C. Focus Mode — immersive

Active Training, Deep Work, scan, capture, fullscreen edit: **hide** the dock. Exit / task / essential controls only. Matches existing Focus session direction.

## Space Shelf (not a second App Launcher)

### When left-edge gesture opens Shelf

| Navigation stack | Left-edge meaning |
| --- | --- |
| Has back stack | **System Back** only (HIG — do not steal) |
| At domain root (empty stack) | **Space Shelf** pull |

Never: “any left-edge → always Shelf.”

### Shelf content = live domain states

Cards show resume truth, not icons-only:

```text
domain · focused entity · stack depth hint · live status · relative time
```

Persist (Continuity / ResumeDescriptor–aligned): domain, focused entity, navigation stack, scroll/draft where safe, last active, live status. Restore on switch — do not dump to domain home.

### Shelf entry points (gesture is not sole)

1. Left-edge at domain root  
2. Long-press dock **Kenos**  
3. Tap domain title (`Plan ˅`) → Shelf / Quick Switch  
4. System / Quick Switch search  

## Distinction vs Continue / Quick Switch / Live Accessory

| Affordance | Question |
| --- | --- |
| Live Accessory | What is running **now**? |
| Continue | Where was I **recently**? |
| Space Shelf | Switch to another **living domain state** (visual) |
| Quick Switch | I know a **name** — search jump |

Shared destination router OK; **do not** merge into one mega-panel.

## Motion (restraint)

- Interactive pull follows finger; settle 180–240ms; cancel 140–180ms  
- Domain switch: content + dock **morph together** (≤260ms); no dock lag  
- Scale current page ~88–92% while Shelf open; light dim  

## Identity signals in Domain Mode

- Domain title + light accent (amber Plan, coral Training, …)  
- Dock slot 1 = Kenos  
- Accent on active icon / 3px rail / selection — not full-page tint  

## Risks & principles

| Risk | Principle |
| --- | --- |
| Edge vs Back conflict | Back first; Shelf only at root |
| Dock churn | Mode-boundary replace only; stable slots inside domain |
| Per-domain stacks | Required; Continuity already points here |
| WKWebView gesture | Domain Mode needs native dock + coordinated web scroll; hybrid honesty |
| a11y | Buttons for Kenos / Shelf / title — not swipe-only |
| Shelf snapshots | Privacy/perf — prefer descriptor + light preview, not raw secrets |

## Implementation gates (when Owner schedules)

1. Stabilization **PASSED** (or Owner explicitly prioritizes IA over LAN dogfood)  
2. Spec dock morph + Shelf against HIG Back  
3. Native Domain Mode chrome before hiding Kenos tabs under Continuity  
4. Domain web UIs stop owning a second BottomNav when hosted in Kenos  
5. No claim of Phase 4 closed from this IA alone  

## Non-goals until scheduled

- Implementing Shelf / dock replace during Stabilization  
- Customizing Kenos four tabs  
- Merging Shelf + Quick Switch UI  
- ActivityKit / APNs as dependency for Shelf cards  
