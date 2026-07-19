---
title: Kenos Phase 4A Apple native ops notes
owner: kenpan
last_verified: 2026-07-19
doc_role: phase4a-ops
status: local-foundation-only
---

# Kenos Phase 4A — Apple native ops notes

## Local loop

1. Inventory: `docs/architecture/kenos-phase4a-apple-inventory.md`
2. Packages under `clients/apple/Packages/{KenosContracts,KenosClient,KenosStore,KenosActions,KenosDesign}`
3. Apps: `cd clients/apple/Apps && xcodegen generate`
4. Guard: `node scripts/check-kenos-phase4.mjs`

## Security reminders

- Session tokens only via `KenosSecureStore` / Keychain abstraction
- Logout clears session + projection cache + offline queue
- Offline Action queue uses `FakeActionExecutor` only (`productionWrite: false`)
- Approvals UI stays disabled

## Rollback

Remove or ignore `clients/apple/Apps` and new packages; KenosContracts may remain for Phase 1–3 parity. No production migration or remote config to reverse.

## Deferred distribution gates

- Production Team ID / signing
- Production bundle IDs / App Groups
- OAuth / Supabase auth wiring
- Push credentials
- Universal Links domain
- TestFlight / App Store / notarization
