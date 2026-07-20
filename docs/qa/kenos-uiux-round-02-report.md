# Kenos UIUX Round 02 — System IA Coherent

**Stamp:** KENOS UIUX ROUND 2 — SYSTEM_IA_COHERENT

## Confirmed IA

| Entry | Web | Apple | Tab? |
|---|---|---|---|
| Today | `/` | Tab.today | Yes |
| Assistant | `/assistant` | Tab.assistant | Yes |
| Spaces | `/spaces` | Tab.spaces | Yes |
| Inbox | `/inbox` (+ approvals/activity) | Tab.inbox | Yes |
| Capture | sheet / ⌘K | sheet | **No** |
| Focus | `/focus` hides nav | Focus overlay | **No** |
| Work | under Spaces | SpacesDestination.work | Nested |

## Shared model (not shared renderer)

| Concern | Shared |
|---|---|
| Ordering / labels | systemNav + Apple Tab enum |
| Selected state | `isSystemNavActive` / Tab selection |
| Route aliases | Spaces→/work; Inbox→approvals/activity |
| Capture / Focus | Overlay contracts |

## Fixes

- Sidebar Space Switcher trigger + Recent “All”
- Mobile FAB Space switch (not 5th tab)
- Inbox children still highlight Inbox

## Score: **82/100**

P0 none. P1: ensure FAB does not collide with Capture on dense pages (monitor Round 6).
