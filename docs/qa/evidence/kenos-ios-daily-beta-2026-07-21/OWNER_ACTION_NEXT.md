# OWNER_ACTION_NEXT — iOS Daily Beta

**Status:** Personal Daily Beta READY_LAN_DEPENDENT. Enter **dogfood / stabilization** — do not close Phase 4.

## Now (Owner)

- Use Kenos on **17 Pro** as daily driver for 3–7 real days
- Log notes in `docs/qa/evidence/kenos-ios-dogfood-2026-07/DAILY_LOG.md`
- Prefer fixing only real P0/P1 from use

## Optional soft residuals



- Optional: Full Dynamic Type / VoiceOver OS Settings sweep (Focus timer font now scales; OS Settings still manual)
- Wi‑Fi↔Cellular mid-session
- Replace LAN-DEPENDENT Mac origin with phone-reachable Owner canary when ready

**Nav flow clean (2026-07-21):** PASS_ON_DEVICE — see `screenshots/nav-flow-clean/VERIFY.md`. Spaces chip = Shelf only; Domain dock switch fixed.

## Phase 4 gates (still EXIT_OPEN)

Next distribution / cross-device steps require Owner Apple Developer actions:

1. Enable App Group `group.space.kenos.app` on Team + regenerate provisioning (closes `KR-P4B-TEMP-005` local-only placeholder)
2. APNs capability + push certs
3. Focus entitlement (if shipping Focus interruption)
4. TestFlight internal distribution

Code already present: `KenosAppGroupStore` (falls back until suite is provisioned). Evidence: `PHASE4_NEXT_SLICE.md`.

Keep Mac Daily Beta on + same Wi‑Fi for daily use.
