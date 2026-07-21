# OWNER_ACTION_NEXT — iOS Daily Beta

**Status:** No hard Owner Action for Personal Daily Beta READY gate.

## Optional soft residuals

- Optional: plug **17 Pro USB** so `idevicescreenshot` can capture native Continue / Quick Switch chrome (Wi‑Fi CoreDevice launch already PASS).

- Full Dynamic Type / VoiceOver OS Settings sweep
- Wi‑Fi↔Cellular mid-session
- Replace LAN-DEPENDENT Mac origin with phone-reachable Owner canary when ready

## Phase 4 gates (still EXIT_OPEN)

Next distribution / cross-device steps require Owner Apple Developer actions:

1. Enable App Group `group.space.kenos.app` on Team + regenerate provisioning (closes `KR-P4B-TEMP-005` local-only placeholder)
2. APNs capability + push certs
3. Focus entitlement (if shipping Focus interruption)
4. TestFlight internal distribution

Code already present: `KenosAppGroupStore` (falls back until suite is provisioned). Evidence: `PHASE4_NEXT_SLICE.md`.

Keep Mac Daily Beta on + same Wi‑Fi for daily use.
