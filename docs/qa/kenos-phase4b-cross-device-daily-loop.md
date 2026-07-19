---
title: Kenos Phase 4B cross-device daily loop QA
owner: kenpan
last_verified: 2026-07-19
doc_role: phase4b-qa
status: local-foundation-only
---

# Kenos Phase 4B — Cross-device daily loop QA

Local/simulator evidence only. No production APNs, OAuth, Executor, TestFlight, or App Store.

## Package tests

```bash
swift test --package-path clients/apple/Packages/KenosNotifications
swift test --package-path clients/apple/Packages/KenosHandoff
swift test --package-path clients/apple/Packages/KenosClient
```

## watchOS

```bash
cd clients/apple/Apps && xcodegen generate
xcodebuild -scheme KenosWatch -destination 'platform=watchOS Simulator,name=Apple Watch SE 3 (40mm)' build test
```

Covered:

| Area | Evidence |
| --- | --- |
| Today states | loading/ready/stale/unavailable; counts use `—` when source unavailable (not fake `0`) |
| Capture | local CaptureEnvelope draft → handoff queue; no Task auto-create |
| Inbox | count glance + open-on-iPhone |
| Approvals | read-only; Approve disabled; **zero-write** |
| Activity | safe result glance |
| 40mm layout | SE 3 (40mm) simulator build |
| VoiceOver | `kenos.watch.*` identifiers |
| Dynamic Type | system fonts |

## Cross-device

- Capture transfer idempotency (`KenosCrossDeviceConsistencyTests`)
- Owner isolation / unsupported schema fail closed
- Notification lock-screen redaction
- Complication/widget helpers read-only + deep link only

## Explicit non-claims

- Production App Group / WatchConnectivity entitlements not configured
- Production APNs not connected
- Approval decisions unavailable on Watch
- Phase 5 proactive automation absent
