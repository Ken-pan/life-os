# Known residuals — iOS Daily Beta 2026-07-21

## Closed — READY gate (strict)

1. **FLOW A** — **PASS** (`logs/ios-flow-a-final.json`) — entity editor + user JWT persist + force-quit verify
2. **FLOW B** — **PASS** (`logs/ios-matrix-close-latest.json`) — Set1 UI → Continue Set2 **without** `kenosSet` pin
3. **Account isolation** — **PASS** (`logs/ios-isolation-rerun.json`) — real auth switch
4. Continuity Plan/Training — **in-app WKWebView** (build `202607210524`), not Safari
5. Auth / letterbox / install / cold launch / lifecycle / offline recovery — **PASS**

```text
IOS PERSONAL DAILY BETA: READY
OVERALL PERSONAL DAILY BETA: READY
NETWORK SCOPE: LAN-DEPENDENT
PHASE 4: EXIT_OPEN
```

## Soft residuals (optional Owner)

1. Full OS Dynamic Type / VoiceOver Settings sweep (DOM labels + 44px probed).
2. Wi‑Fi↔Cellular mid-session toggle.
3. Network scope remains **LAN-DEPENDENT** until phone-reachable Owner canary replaces Mac LAN.
4. Hosted Planner title writer flags OFF in Daily Beta static — Flow A uses user-JWT persist after editor open (same Auth as app; not service_role).

## Not acceptance evidence

- Prior 10-panel aggregate “iOS · Assistant” showing Safari chrome / `127.0.0.1`
- Simulator-only or Mac-harness-only FLOW claims substituted for device App process

## Phase 4 EXIT_OPEN (not Daily Beta blockers)

- App Group 持久共享
- APNs
- Focus entitlement
- TestFlight / distribution
- Watch/macOS 跨端持久状态
- legacy Apple shell retirement
