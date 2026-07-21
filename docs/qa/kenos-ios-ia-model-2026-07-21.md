# Kenos iOS IA Model — locked 2026-07-21

**Status:** CANONICAL for iPhone Personal Daily Beta + Phase 4 native shell  
**Sources:** Apple HIG Tab Bar / Sheets / Sidebars; Notion mobile; Things Today + Quick Find; Todoist Browse; Slack stable tabs; Apple Music MiniPlayer  
**Does not close Phase 4.** Does not claim Kenos shipped.

## Verdict

```text
FOUR FIXED TABS + TODAY AGGREGATION + SPACES DIRECTORY
+ LIVE ACCESSORY (running) + CONTINUE (recent) + QUICK SWITCH
= OS-feel personal hub
```

Prior direction (**one Kenos shell · four top tabs · domains as Spaces · entity Continuity**) is **confirmed**.

Industry practice does **not** put every domain on the tab bar. Best stack:

1. Fixed few top-level tabs  
2. Today aggregates across domains  
3. Continue / MiniPlayer-style persistent context  
4. Search / Quick Switch as power path  
5. Domains keep their own navigation stacks  
6. Immersive full-screen only for true Focus / Training sessions  

## Top-level IA (locked)

```text
Today · Assistant · Spaces · Inbox
```

| Tab | Job |
| --- | --- |
| Today | Cross-domain priority + previews |
| Assistant | Chat / proposals / handoff |
| Spaces | Domain directory (Pinned / Recent / All) — **not** an app launcher |
| Inbox | Capture / review / Approvals / Activity |

**Not** bottom tabs: Plan · Training · Money · Music · Home · Knowledge · Work.

iPhone = Tab Bar; iPad = convertible Sidebar (same four destinations). Do not invent a second IA.

## Continue = two layers (upgrade)

| Layer | Meaning | Examples | UI |
| --- | --- | --- | --- |
| **Live Accessory** | Something is **running now** | Training mid-set, Focus timer, Music play, Home scan, Capture recording | Strip **above** Tab Bar (Music MiniPlayer pattern) |
| **Continue Sheet** | **Recent** contexts only | Last note, last Plan task, last Music library | Sheet: resume rows + Recent Spaces — **no** full All Domains dump |

Pinned / All Domains live in **Spaces Tab** or **Switch Space** / **Quick Switch**, not in Continue.

## Global Quick Switch (upgrade)

Things Quick Find pattern:

```text
Pull-down / title / dedicated trigger
→ Recent objects
→ Spaces
→ Search results (task / note / project / entity)
```

Power path; does not replace Tabs.

## Sheets vs stacks

| Sheet | NavigationStack / Continuity cover | Immersive full-screen |
| --- | --- | --- |
| Continue, Switch Space, Quick Switch, Capture, Approval, date pick, filters | Domain Plan/Training/Money content, task/note/txn detail | Active Training / Deep Focus session |

## Pin policy

- Users may **pin Spaces** inside Spaces / Switcher  
- Users may **not** rearrange the four system Tabs  
- Customization stays in Spaces so IA does not drift  

## Capacity honesty (Notion mobile lesson)

```text
iOS = high-frequency daily loop
Web / Mac = deep analysis & bulk admin
```

Do not force Finance wide tables, Home 3D solvers, or Knowledge bulk tools into iPhone parity.

## Entry map

| Intent | Path |
| --- | --- |
| Resume running work | Live Accessory |
| Resume recent work | Continue |
| Handle today | Today → exact object |
| Enter a domain | Spaces |
| Find anything | Quick Switch |
| Ask the system | Assistant |
| Process system inputs | Inbox |

## Implementation binding (this repo)

| Surface | Owner |
| --- | --- |
| Four Tabs | `KenosRootView` TabView + AIOS `systemNav` (web chrome hidden under `iosNativeShell`) |
| Live Accessory | Native bottom inset on TabView (not a second web BottomNav) |
| Continue Recent-only | Native sheet mode `.continueRecent` |
| Switch Space | Native sheet mode `.switchSpace` (Pinned + All + System Today) |
| Quick Switch | Native sheet mode `.quickSwitch`; AIOS `openQuickSwitchSheet` (⌘⇧. + Search) |
| Web Continue parity | AIOS `continueRecent` / `switchSpace` / `quickSwitch` — Continue = Recent only |
| Domain Continuity | In-app WKWebView cover (`continuityURL`) |
| Immersive Focus | Existing full-screen Focus session |

Evidence / residuals: `docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/`.

## Non-goals this lock

- ActivityKit / Dynamic Island production Live Activities (Phase 4 / APNs adjacent — still EXIT_OPEN)  
- User-customizable Tab Bar  
- Domain BottomNav inside Continuity covers (**known temporary debt** under Daily Beta)  
- Claiming Phase 4 complete  

## Next IA (approved, not active)

After **iOS Daily Beta Stabilization**, Owner-approved evolution:

```text
Kenos Mode · Domain Mode (dock replace) · Focus Mode
+ Space Shelf (Back-first left-edge at domain root)
```

Canonical: [`kenos-shell-navigation-v2-2026-07-21.md`](./kenos-shell-navigation-v2-2026-07-21.md) (`APPROVED_DIRECTION`).  
Do **not** implement during dogfood; do **not** treat as Daily Beta lock replacement until that slice is scheduled.
