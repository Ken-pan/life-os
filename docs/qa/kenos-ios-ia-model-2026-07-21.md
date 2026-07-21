# Kenos iOS IA Model — locked 2026-07-21 (updated)

**Status:** CANONICAL for iPhone Personal Daily Beta + Phase 4 native shell  
**Sources:** Apple HIG Tab Bar / Sheets / Sidebars; Liquid Glass WWDC25; Things Today + Quick Find; Apple Music MiniPlayer  
**Does not close Phase 4.** Does not claim Kenos shipped.

## Verdict

```text
SPACES ORB + THREE DESTINATIONS + TODAY AGGREGATION
+ LIVE ACCESSORY (running) + CONTINUE (recent) + QUICK SWITCH
= OS-feel personal hub
```

Industry practice does **not** put every domain on the tab bar. Best stack:

1. Fixed few top-level destinations
2. Today aggregates across domains
3. Continue / MiniPlayer-style persistent context
4. Search / Quick Switch as power path
5. Domains keep their own navigation stacks
6. Immersive full-screen only for true Focus / Training sessions

## Top-level IA (locked)

```text
◉ Spaces Orb | Today · Ask · Inbox
```

| Control | Job |
| ------- | --- |
| **Spaces Orb** | Space Shelf only (morphs to close while open) |
| **Today** | Cross-domain priority + previews |
| **Ask** | Chat / proposals / handoff (`/assistant`) |
| **Inbox** | Capture / review / Approvals / Activity |

**Off dock:**

| Control | Job |
| ------- | --- |
| Today account | Settings (native tab) |
| Domain header `···` | Domain More sheet |
| Continue | Recent resumes only |
| Quick Switch | Type-to-jump |

**Not** bottom destinations: Plan · Training · Money · Music · Home · Knowledge · Work · Settings · More.

iPhone = Orb + capsule; iPad = Sidebar (Today · Ask · Inbox) + Spaces toolbar. Same destinations; adaptive chrome.

## Continue = two layers

| Layer | Meaning | UI |
| ----- | ------- | -- |
| **Live Accessory** | Something is **running now** | Strip **above** dock |
| **Continue Sheet** | **Recent** contexts only | Sheet — no full All Domains dump |

Pinned / All Domains live in **Space Shelf**, not in Continue.

## Space Shelf

```text
Spaces
Current   → quiet selected row (accent fill + check)
Recent    → compact horizontal chips
All Spaces → list
```

Close: Spaces Orb (not a second header xmark). Backdrop ~0.97 scale; dim adaptive.

## Sheets vs stacks

| Sheet | NavigationStack / Continuity | Immersive |
| ----- | ---------------------------- | --------- |
| Continue, Switch Space, Quick Switch, Capture, Domain More | Domain content, task/note detail | Active Training / Deep Focus |

## Pin policy

- Users may **pin Spaces** inside Shelf
- Users may **not** rearrange system destinations
- Customization stays in Shelf so IA does not drift

## Capacity honesty

```text
iOS = high-frequency daily loop
Domains = depth on demand via Continuity
Focus = hide global nav
```
