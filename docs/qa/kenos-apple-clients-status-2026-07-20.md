---
title: KENOS APPLE CLIENTS — PACKAGE STATUS
owner: kenpan
last_verified: 2026-07-20
status: CONTRACTS_PASS — DEVICE_EVIDENCE_PENDING_OWNER
---

# Apple clients progress

## Automated (no Owner)

| Check | Result |
| --- | --- |
| `clients/apple/Packages/KenosContracts` `swift test` | PASS (6 tests) |
| Production contracts RPCs for Focus/Approval/Capture/Plan | Live in DB tip `20260720230000` |

## Requires Owner

| Gate | Why |
| --- | --- |
| Xcode signing / device trust | Apple Developer account click |
| True device install smoke | Simulator ≠ production verified |
| Keychain / Universal Links / APNs | Device + portal entitlements |

## Explicitly not claimed

- iPhone PRODUCTION_VERIFIED
- macOS PRODUCTION_VERIFIED
- Watch PRODUCTION_VERIFIED
- Cross-device Focus/Inbox sync observed on hardware

Next when Owner available: open Xcode project, trust device, install iPhone build against production contracts, run cold-start/login/Focus/Approval smoke.
