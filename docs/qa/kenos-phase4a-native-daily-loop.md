---
title: Kenos Phase 4A native daily loop QA
owner: kenpan
last_verified: 2026-07-19
doc_role: phase4a-qa
status: local-foundation-only
---

# Kenos Phase 4A — Apple native daily loop QA

Local/simulator evidence only. No TestFlight, App Store, notarization, production auth, or Executor.

## Package tests

```bash
swift test --package-path clients/apple/Packages/KenosClient
swift test --package-path clients/apple/Packages/KenosStore
swift test --package-path clients/apple/Packages/KenosActions
swift test --package-path clients/apple/Packages/KenosDesign
```

Covered: contract fixture decode, deep-link coverage, Keychain-vs-UserDefaults boundary, cache owner isolation, R3/R4 persist fail-closed, offline queue idempotency/restart, fake executor refusals.

## App targets

```bash
cd clients/apple/Apps && xcodegen generate
xcodebuild -scheme KenosIOS -destination 'platform=iOS Simulator,name=iPhone 17' build test
xcodebuild -scheme KenosIOS -destination 'platform=iOS Simulator,name=iPad (A16)' build
xcodebuild -scheme KenosMac -destination 'platform=macOS' build test
```

## Surfaces exercised

| Surface | Evidence |
| --- | --- |
| Today | mock cards, stale/unavailable banners, deep links, refresh |
| Assistant | mock streaming, proposal copy, no domain write |
| Inbox | read-only list + metadata |
| Approvals | read-only; Approve/Reject disabled |
| Activity | redacted summary + undo metadata only |
| Work vertical slice | project → deliverable → Plan Task ref → Library ref → Activity |
| Quick Capture | local draft → queue status; no auto Task |
| macOS | sidebar, command menu, MenuBarExtra capture shell |
| Deep links | `kenos://` router unit tests + app XCTest host |
| A11y | VoiceOver identifiers (`kenos.*`), Dynamic Type system fonts, Reduce Motion helper |
| Viewport | iPhone 17 (~390×844 class), iPad split sidebar |

## Explicit non-claims

- Production OAuth / Team / App Group / push not configured
- Approval cannot call production Executor
- watchOS product not started
- Phase 5 proactive automation not present
