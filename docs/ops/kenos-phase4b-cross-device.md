---
title: Kenos Phase 4B cross-device ops notes
owner: kenpan
last_verified: 2026-07-19
doc_role: phase4b-ops
status: local-foundation-only
---

# Kenos Phase 4B — ops notes

## Local loop

1. Role: `docs/architecture/kenos-phase4b-watch-role.md`
2. Packages: `KenosNotifications`, `KenosHandoff` (+ glances in `KenosClient`)
3. Apps: `cd clients/apple/Apps && xcodegen generate`
4. Guard: `node scripts/check-kenos-phase4b.mjs`

## Rollback

Remove Watch target / Widget extension / new packages; retain Phase 4A iOS/macOS foundation. No production migration to reverse.

## Deferred gates

- Production Team / App Group `group.space.kenos.app`
- WatchConnectivity production entitlements
- APNs credentials
- Critical alerts (remain disabled)
- TestFlight / App Store
