# Known residuals — iOS Daily Beta 2026-07-21

## Closed — READY gate (strict)

1. **FLOW A** — **PASS** — entity editor + user Auth persist + force-quit verify
2. **FLOW B** — **PASS** — Set1 UI → Continue Set2 **without** `kenosSet` pin
3. **Account isolation** — **PASS** — real auth switch
4. Continuity Plan/Training — **in-app WKWebView** (not Safari)
5. Auth / letterbox / install / cold launch / lifecycle / offline recovery — **PASS**

```text
IOS PERSONAL DAILY BETA: READY
OVERALL PERSONAL DAILY BETA: READY
NETWORK SCOPE: LAN-DEPENDENT
PHASE 4: EXIT_OPEN
```

## IA upgrades (foundation shipped 2026-07-21)

See `docs/qa/kenos-ios-ia-model-2026-07-21.md`:

- Continue vs Switch Space vs Quick Switch **modes** (native)
- Live Accessory bar above Tab Bar for mid-Training Continuity
- Web AIOS Switcher Recent-only parity still open (Daily Beta uses native chrome)

## Soft residuals

1. Full OS Dynamic Type / VoiceOver Settings sweep (DOM labels + 44px probed).
2. Wi‑Fi↔Cellular mid-session toggle.
3. Network scope remains **LAN-DEPENDENT** until phone-reachable Owner canary replaces Mac LAN.
4. ~~Hosted title writer OFF in Daily Beta~~ → **CLOSED for Owner keyboard Save**  
   (`kenos-ctl` now bakes `PROD_WRITES` + `PLAN_UPDATE_TASK_TITLE_WRITER` for Owner email).  
   Automation note: WKWebView synthetic/`insertText` still does not update Svelte 5 `bind:value`; Flow A harness keeps **user JWT PATCH fallback** after editor open (never service_role). See `PHASE4_NEXT_SLICE.md`.

## Phase 4 EXIT_OPEN

| Item | Status |
| --- | --- |
| App Group 持久共享 | **LOCAL_FOUNDATION_ONLY** — `KenosAppGroupStore` + tests; entitlement/provisioning still open (`KR-P4B-TEMP-005`) |
| APNs | OPEN |
| Focus entitlement | OPEN |
| TestFlight / distribution | OPEN |
| Watch/macOS 跨端持久状态 | OPEN (needs live App Group suite) |
| legacy Apple shell retirement | OPEN |

## Not acceptance evidence

- Prior 10-panel aggregate “iOS · Assistant” showing Safari chrome / `127.0.0.1`
- Simulator-only or Mac-harness-only FLOW claims substituted for device App process
