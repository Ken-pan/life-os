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
- ~~Web AIOS Switcher Recent-only parity~~ → **SHIPPED** (`continueRecent` / `switchSpace` / `quickSwitch`; tests 19/19)
- ~~LAN Web IA chrome verify~~ → **PASS** (`ia-web-parity-verify.mjs`; Continue Recent-only + Quick Switch + Switch Space)

## Soft residuals

1. Full OS Dynamic Type / VoiceOver Settings sweep (still needs unlocked 17 Pro OS Settings).
   - ~~LAN Web Continue/Quick Switch 44px + aria-label~~ → **PASS** (`ia-web-a11y-soft.mjs`) after SystemBar hit-target bump.
   - ~~iOS native Continue/Quick Switch unlock recheck~~ → **PASS_LAUNCH_NO_USB_SHOT** (launch @ 06:20:41Z; PNG needs USB — Wi‑Fi CoreDevice only).
   - ~~Focus timer fixed 44pt~~ → **SHIPPED** (`KenosTypography.display` scales with Dynamic Type). OS slider sweep still open.
2. Wi‑Fi↔Cellular mid-session toggle.
3. Network scope remains **LAN-DEPENDENT** until phone-reachable Owner canary replaces Mac LAN.
4. ~~Hosted title writer OFF in Daily Beta~~ → **CLOSED for Owner keyboard Save**  
   (`kenos-ctl` now bakes `PROD_WRITES` + `PLAN_UPDATE_TASK_TITLE_WRITER` for Owner email).  
   Automation note: WKWebView synthetic/`insertText` still does not update Svelte 5 `bind:value`; Flow A harness keeps **user JWT PATCH fallback** after editor open (never service_role). See `PHASE4_NEXT_SLICE.md`.
5. Optional: plug **USB** + unlock → `wait-usb-native-shot.sh` captures `04-ios-native-shell.png`.

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
