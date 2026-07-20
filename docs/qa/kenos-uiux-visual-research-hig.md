# Kenos Visual Rescue — HIG Research → Adoption

Date: 2026-07-20  
Sources: Apple “Adopting Liquid Glass”, WWDC25 “Get to know the new design system”, WWDC25 “Build a UIKit app with the new design”.

Research is not a link dump. Each item maps to Kenos action.

---

## 1. Liquid Glass is for controls / navigation, not content cards

| | |
|---|---|
| **Current problem** | Baseline Switcher piles raised cards; content pages sometimes wrap every row in a card — glass/card language leaks into content. |
| **Principle** | Liquid Glass forms a **functional layer** for bars, sheets, popovers, controls; content stays underneath and should remain primary. |
| **Kenos adopts** | Glass / blur / raised materials only on: BottomNav, toolbar clusters, Space Switcher sheet, transient overlays. |
| **Does not adopt** | Glass fill on Today rows, Approval cards, Domain tiles, or every list group. |
| **Evidence / impl** | Direction A Today (hairline groups); Round 1 surface tokens: `canvas` / `content-group` / `raised-control` / `overlay`. |

## 2. Tab bar / sidebar float above content; may minimize on scroll

| | |
|---|---|
| **Current problem** | iPhone Today: bottom chrome covers list rows; FAB fights tab bar. |
| **Principle** | System tab bars float; optional minimize-on-scroll elevates content. |
| **Kenos adopts** | Compact system tabs (Today / Assistant / Inbox / More); Space Switcher is **not** a 5th tab; scroll-safe content inset. |
| **Does not adopt** | Fake floating “window” chrome on web; permanent FAB sticker competing with tab. |
| **Evidence / impl** | Round 2 Shell; contact `baseline/web-390x844/today.png` bottom collision. |

## 3. iPad: tab ↔ sidebar adaptivity; content may extend under sidebar

| | |
|---|---|
| **Current problem** | iPad baseline is mobile list stretched on white — no second column / inspector. |
| **Principle** | UITab / sidebar adapt; background extension keeps content immersive under glass sidebar. |
| **Kenos adopts** | Wide: system sidebar + domain content; mid/narrow: fold switcher into toolbar; preserve state across widths. |
| **Does not adopt** | Always-on dual sidebars that fight domain Planner/Fitness nav. |
| **Evidence / impl** | Direction C rail on wide; Round 3 iPad adaptive Switcher. |

## 4. Typography: stronger structure, left-aligned, Dynamic Type

| | |
|---|---|
| **Current problem** | Display “Today” poster + weak body ramp; Approvals metadata fights summary. |
| **Principle** | Bolder structure at key moments; clear roles; Dynamic Type scales. |
| **Kenos adopts** | Explicit roles: Display / Page / Section / List / Body / Secondary / Metadata / Button / Numeric. |
| **Does not adopt** | Magazine serif decoration or oversized hero on every page. |
| **Evidence / impl** | Direction B type scale for Today/Work; Direction A for Fitness lists. |

## 5. Materials stay on the topmost navigation layer

| | |
|---|---|
| **Current problem** | Cheap flat #000 canvas + sudden card sheet = platform mismatch. |
| **Principle** | Navigation lives in material layer; content uses calm opaque/grouped surfaces. |
| **Kenos adopts** | Sheet for Switcher; hairline grouped lists for content. |
| **Does not adopt** | Desktop-window shadows / Stage Manager fake thumbnails on iPhone. |
| **Evidence / impl** | Direction C “Continue” sheet selection ring without window chrome. |

## 6. State restoration is a platform expectation

| | |
|---|---|
| **Current problem** | Prior pass deferred Apple recent/pinned; deep link ≠ restored domain state. |
| **Principle** | Continuity across multitasking / switches. |
| **Kenos adopts** | user-scoped recent/pinned persistence + logout clear (Web already; Apple store landed). |
| **Does not adopt** | “Open Fitness home” after leaving mid-workout. |
| **Evidence / impl** | `KenosSpaceSwitcherStore.swift`; Round 3–4 flows. |
